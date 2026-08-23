import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { EventBooking } from './entities/event-booking.entity';
import { EventBookingItem } from './entities/event-booking-item.entity';
import { EventBookingStatus } from './enums/event-booking-status.enum';
import { CreateEventBookingDto } from './dto/create-event-booking.dto';
import { QueryEventBookingsDto } from './dto/query-event-bookings.dto';
import { TransitionEventBookingDto } from './dto/transition-event-booking.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import { EventItemsService } from './event-items.service';
import { EventAvailabilityService } from './event-availability.service';
import {
  addDaysToDateString,
  aggregateEventQuote,
  computeLine,
} from './event-pricing';
import {
  generateBookingReference,
  MAX_REFERENCE_ATTEMPTS,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/booking-reference';

/** Row shape for the item-lock query in confirm() — `queryRunner.query()`
 * returns `any`, this gives the destructure an explicit, honest type. */
interface LockedItemRow {
  id: string;
  stockQuantity: number;
  name: string;
}

@Injectable()
export class EventBookingsService {
  constructor(
    @InjectRepository(EventBooking)
    private readonly bookingRepo: Repository<EventBooking>,
    @InjectRepository(EventBookingItem)
    private readonly bookingItemRepo: Repository<EventBookingItem>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly itemsService: EventItemsService,
    private readonly availability: EventAvailabilityService,
  ) {}

  async findOneOrFail(id: string): Promise<EventBooking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { items: true, createdBy: true, confirmedBy: true },
    });
    if (!booking) throw new NotFoundException(`Event booking ${id} not found`);
    return booking;
  }

  /** Filters shared by the count and id-page queries below — split out so
   * neither query carries the joined `items` collection: paginating a
   * query-builder with a joined one-to-many multiplies rows and corrupts
   * both `skip`/`take` and the total count (unlike storage's admin listing,
   * whose joins are all many-to-one). Fetch matching ids first, then load
   * the full entity graph for just that page. */
  private buildFilteredQb(query: QueryEventBookingsDto) {
    const { status, from, to, search } = query;
    const qb = this.bookingRepo.createQueryBuilder('b');

    if (status) qb.andWhere('b.status = :status', { status });
    if (from) qb.andWhere('b.endDate >= :from', { from });
    if (to) qb.andWhere('b.startDate <= :to', { to });
    if (search) {
      qb.andWhere(
        '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    return qb;
  }

  async findAllAdmin(
    query: QueryEventBookingsDto,
  ): Promise<PaginatedResult<EventBooking>> {
    const { page, limit } = query;

    const total = await this.buildFilteredQb(query).getCount();

    const idRows = await this.buildFilteredQb(query)
      .select('b.id', 'id')
      .orderBy('b.createdAt', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: string }>();

    const ids = idRows.map((r) => r.id);
    const rows =
      ids.length === 0
        ? []
        : await this.bookingRepo.find({
            where: { id: In(ids) },
            relations: { items: true, createdBy: true, confirmedBy: true },
          });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((r): r is EventBooking => !!r);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Creates a `pending` booking. Deliberately does NOT reserve stock — per
   * the same product decision as Smart Storage, only a confirmed booking
   * counts against availability, so two admins can both record a request
   * against the last unit here. The guard against overselling lives
   * entirely in confirm() below. Every line's `itemName`/`pricePerDay` is
   * snapshotted at creation time so a later rename or price change never
   * rewrites this booking's history.
   */
  async create(dto: CreateEventBookingDto, admin: User): Promise<EventBooking> {
    const items = await this.itemsService.findManyPublishedByIdsOrFail(
      dto.items.map((l) => l.itemId),
    );
    const itemById = new Map(items.map((i) => [i.id, i]));

    const lines = dto.items.map((lineDto) => {
      const item = itemById.get(lineDto.itemId)!;
      const computed = computeLine({
        pricePerDay: item.pricePerDay,
        quantity: lineDto.quantity,
        days: lineDto.days,
      });
      return {
        itemId: item.id,
        itemName: item.name,
        quantity: computed.quantity,
        startDate: lineDto.startDate,
        days: computed.days,
        endDate: addDaysToDateString(lineDto.startDate, computed.days),
        pricePerDay: computed.pricePerDay,
        lineTotal: computed.lineTotal,
      };
    });

    const quote = aggregateEventQuote(lines);
    const startDate = lines.reduce(
      (min, l) => (l.startDate < min ? l.startDate : min),
      lines[0].startDate,
    );
    const endDate = lines.reduce(
      (max, l) => (l.endDate > max ? l.endDate : max),
      lines[0].endDate,
    );

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const booking = this.bookingRepo.create({
        reference: generateBookingReference('MDN-EVT'),
        customerName: dto.customerName,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        eventLocation: dto.eventLocation ?? null,
        notes: dto.notes ?? null,
        startDate,
        endDate,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        total: quote.total,
        createdById: admin.id,
        items: lines.map((l) => this.bookingItemRepo.create(l)),
      });

      try {
        const saved = await this.bookingRepo.save(booking);
        return this.findOneOrFail(saved.id);
      } catch (err) {
        const isReferenceCollision =
          err instanceof QueryFailedError &&
          (err as unknown as { code?: string }).code ===
            POSTGRES_UNIQUE_VIOLATION;
        if (!isReferenceCollision || attempt === MAX_REFERENCE_ATTEMPTS - 1) {
          throw err;
        }
        // else: loop and try again with a freshly generated reference
      }
    }
    /* istanbul ignore next -- unreachable: the loop above always returns or throws */
    throw new Error('Failed to generate a unique booking reference');
  }

  private assertStatus(
    booking: EventBooking,
    expected: EventBookingStatus[],
    action: string,
  ): void {
    if (!expected.includes(booking.status)) {
      throw new ConflictException(
        `Booking ${booking.reference} is ${booking.status}, cannot ${action}`,
      );
    }
  }

  /**
   * The only place stock is taken. Locks every referenced `event_items` row
   * (in a stable `ORDER BY id`, so two admins confirming overlapping carts
   * in opposite orders can't deadlock each other) before re-checking each
   * line's availability inside the transaction — this is what stops two
   * concurrent confirmations from both succeeding against the same last
   * unit. Availability is checked per line, using that line's own date
   * range, since a single booking can mix items with different rental
   * windows (see EventAvailabilityService.getPeakBooked's peak-per-day
   * math for why the window can't just be summed).
   */
  async confirm(
    id: string,
    dto: TransitionEventBookingDto,
    admin: User,
  ): Promise<EventBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [EventBookingStatus.PENDING], 'confirm');

    const itemIds = [...new Set(booking.items.map((l) => l.itemId))].sort();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const lockedRows = (await queryRunner.query(
        `SELECT id, stock_quantity AS "stockQuantity", name FROM event_items
           WHERE id = ANY($1::uuid[])
           ORDER BY id
           FOR UPDATE`,
        [itemIds],
      )) as LockedItemRow[];
      const stockById = new Map(lockedRows.map((r) => [r.id, r]));

      for (const line of booking.items) {
        const stockRow = stockById.get(line.itemId);
        if (!stockRow) continue; // item FK is RESTRICT — should be unreachable

        const peak = await this.availability.getPeakBooked(
          [line.itemId],
          line.startDate,
          line.endDate,
          booking.id,
          queryRunner,
        );
        const alreadyBooked = peak.get(line.itemId) ?? 0;
        const remaining = stockRow.stockQuantity - alreadyBooked;

        if (remaining < line.quantity) {
          await queryRunner.rollbackTransaction();
          throw new ConflictException(
            `Only ${Math.max(0, remaining)} unit(s) of "${line.itemName}" left for ${line.startDate} to ${line.endDate}`,
          );
        }
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    booking.status = EventBookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();
    booking.confirmedById = admin.id;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    return this.findOneOrFail(id);
  }

  /** From pending or confirmed. Releases whatever stock a confirmed booking
   * held implicitly — only `confirmed` bookings count against availability
   * (see EventAvailabilityService), so flipping the status away from
   * `confirmed` is itself the release; no separate bookkeeping needed. */
  async cancel(
    id: string,
    dto: TransitionEventBookingDto,
  ): Promise<EventBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(
      booking,
      [EventBookingStatus.PENDING, EventBookingStatus.CONFIRMED],
      'cancel',
    );

    booking.status = EventBookingStatus.CANCELLED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    return this.findOneOrFail(id);
  }

  /** Marks a confirmed booking as completed (event over, equipment
   * returned) — releases its stock hold for the same reason cancel() does. */
  async complete(
    id: string,
    dto: TransitionEventBookingDto,
  ): Promise<EventBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [EventBookingStatus.CONFIRMED], 'complete');

    booking.status = EventBookingStatus.COMPLETED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    return this.findOneOrFail(id);
  }
}
