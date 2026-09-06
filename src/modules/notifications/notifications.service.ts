import {
  Injectable,
  Logger,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { Observable, Subject, interval, merge } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AdminNotification } from './entities/admin-notification.entity';
import { NotificationSourceModule } from './enums/notification-source-module.enum';
import { NotificationOrigin } from './enums/notification-origin.enum';
import { NotificationFilter } from './enums/notification-filter.enum';
import { QueryAdminNotificationsDto } from './dto/query-admin-notifications.dto';
import { NotificationSummaryDto } from './dto/notification-response.dto';
import { NotificationsMapper } from './notifications.mapper';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { POSTGRES_UNIQUE_VIOLATION } from '../../common/utils/booking-reference';

/** Same rationale as StorageAvailabilityService: CloudFront's 30s origin
 * idle timeout kills a quiet SSE response, so a heartbeat comfortably under
 * that keeps the connection alive. */
const HEARTBEAT_MS = 15_000;

/** What each module's booking-create path passes to emitCreated(). */
export interface EmitNotificationInput {
  sourceModule: NotificationSourceModule;
  sourceId: string;
  reference: string;
  customerName: string | null;
  total: number;
  origin: NotificationOrigin;
}

// `data: object`, not `unknown` -- must satisfy @nestjs/common's own
// MessageEvent (`data: string | object`), since stream() below merges this
// with the ping heartbeat's Observable<MessageEvent>.
type NotificationEvent =
  | { type: 'notification.created'; data: object }
  | { type: 'notification.resolved'; data: object }
  | { type: 'notification.read'; data: object };

/**
 * Owns the admin_notifications table and the one hot RxJS Subject that
 * feeds the admin SSE stream -- same shape as StorageAvailabilityService,
 * generalized to all three booking modules instead of just Storage.
 *
 * Every public method here swallows its own errors (logs, never throws):
 * this is a side channel onto the real booking data, not a system of
 * record, and a notification-bookkeeping hiccup must never fail -- or roll
 * back -- the booking create/confirm/reject/cancel/complete call that
 * triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly events$ = new Subject<NotificationEvent>();

  constructor(
    @InjectRepository(AdminNotification)
    private readonly repo: Repository<AdminNotification>,
    private readonly mapper: NotificationsMapper,
  ) {}

  async getSummary(): Promise<NotificationSummaryDto> {
    const [unresolvedCount, unreadCount] = await Promise.all([
      this.repo.count({ where: { resolvedAt: IsNull() } }),
      this.repo.count({ where: { readAt: IsNull() } }),
    ]);
    return { unresolvedCount, unreadCount };
  }

  /** No joins/relations on this entity, so plain getManyAndCount() with
   * skip/take is exact -- none of the one-to-many pagination hazards the
   * booking services' own doc comments warn about apply here. */
  async findAllAdmin(
    query: QueryAdminNotificationsDto,
  ): Promise<PaginatedResult<AdminNotification>> {
    const { page, limit, sourceModule, filter } = query;

    const qb = this.repo.createQueryBuilder('n');
    if (sourceModule) {
      qb.andWhere('n.sourceModule = :sourceModule', { sourceModule });
    }
    if (filter === NotificationFilter.UNRESOLVED) {
      qb.andWhere('n.resolvedAt IS NULL');
    }

    qb.orderBy('n.createdAt', 'DESC').addOrderBy('n.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Called once, right after a booking's own row is successfully saved, by
   * each of the three modules' create paths (Storage/Moving's create(),
   * Event Support's shared saveBookingWithReference() -- covering both its
   * public and admin-recorded callers). The unique constraint on
   * (sourceModule, sourceId) makes this idempotent: a duplicate call for a
   * booking that already has a notification row is a silent no-op rather
   * than a second notification.created event.
   */
  async emitCreated(input: EmitNotificationInput): Promise<void> {
    try {
      const notification = this.repo.create(input);
      let saved: AdminNotification;
      try {
        saved = await this.repo.save(notification);
      } catch (err) {
        const isDuplicate =
          err instanceof QueryFailedError &&
          (err as unknown as { code?: string }).code ===
            POSTGRES_UNIQUE_VIOLATION;
        if (isDuplicate) return;
        throw err;
      }

      const summary = await this.getSummary();
      this.events$.next({
        type: 'notification.created',
        data: this.mapper.toCreatedEvent(saved, summary),
      });
    } catch (err) {
      this.logger.error('Failed to emit booking-created notification', err);
    }
  }

  /**
   * Called at the end of each confirm/reject/cancel/complete transition, in
   * every module that has one. A no-op when no notification row exists for
   * this booking -- every booking predating this feature (no backfill was
   * done) hits exactly this path, by design. Also a no-op if the
   * notification was already resolved, which the booking status graph
   * itself should make unreachable (assertStatus() on every service
   * already rejects a second transition out of a terminal state) -- kept
   * anyway so this method can never emit a duplicate notification.resolved.
   */
  async resolveForBooking(
    sourceModule: NotificationSourceModule,
    sourceId: string,
    resolvedStatus: string,
  ): Promise<void> {
    try {
      const notification = await this.repo.findOne({
        where: { sourceModule, sourceId },
      });
      if (!notification || notification.resolvedAt) return;

      notification.resolvedAt = new Date();
      notification.resolvedStatus = resolvedStatus;
      await this.repo.save(notification);

      const { unresolvedCount } = await this.getSummary();
      this.events$.next({
        type: 'notification.resolved',
        data: {
          id: notification.id,
          sourceModule,
          sourceId,
          resolvedStatus,
          unresolvedCount,
        },
      });
    } catch (err) {
      this.logger.error('Failed to resolve notification for booking', err);
    }
  }

  /** Colours one row read. Never touches resolvedAt -- that separation is
   * the whole point of this feature (see AdminNotification's doc comment). */
  async markRead(id: string): Promise<void> {
    const notification = await this.repo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.readAt) return; // already read -- no-op, no duplicate event

    notification.readAt = new Date();
    await this.repo.save(notification);

    const { unreadCount } = await this.getSummary();
    this.events$.next({
      type: 'notification.read',
      data: { ids: [id], unreadCount },
    });
  }

  /** What the bell dropdown calls on open -- colours everything currently
   * unread. Read state is global/shared by product decision (one readAt
   * column, not per-admin), so this affects every admin's view at once.
   * Still never touches resolvedAt/unresolvedCount. */
  async markAllRead(): Promise<void> {
    const unread = await this.repo.find({
      where: { readAt: IsNull() },
      select: { id: true },
    });
    if (unread.length === 0) return;

    const ids = unread.map((n) => n.id);
    await this.repo
      .createQueryBuilder()
      .update(AdminNotification)
      .set({ readAt: () => 'now()' })
      .where('id = ANY(:ids::uuid[])', { ids })
      .execute();

    this.events$.next({
      type: 'notification.read',
      data: { ids, unreadCount: 0 },
    });
  }

  private heartbeat$(): Observable<MessageEvent> {
    return interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: { time: new Date().toISOString() } })),
    );
  }

  /** Admin stream: notification lifecycle events + heartbeat. No initial
   * snapshot replay on connect (unlike Storage's availability stream) --
   * the server-rendered bell already seeds the list and summary counts on
   * page load, so a fresh connection only needs what happens from here on. */
  stream(): Observable<MessageEvent> {
    const notifications$ = this.events$.pipe(
      map(({ type, data }) => ({ type, data })),
    );
    return merge(notifications$, this.heartbeat$()).pipe(
      catchError((err) => {
        this.logger.error('Admin notifications stream error', err);
        return this.heartbeat$();
      }),
    );
  }
}
