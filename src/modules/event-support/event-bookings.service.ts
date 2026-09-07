import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { EventBooking } from './entities/event-booking.entity';
import { EventBookingItem } from './entities/event-booking-item.entity';
import { EventSupportSettings } from './entities/event-support-settings.entity';
import { EventBookingStatus } from './enums/event-booking-status.enum';
import { EventBookingSource } from './enums/event-booking-source.enum';
import { EventBookingSort } from './enums/event-booking-sort.enum';
import { EventBillingMode } from './enums/event-billing-mode.enum';
import { CreateEventBookingDto } from './dto/create-event-booking.dto';
import { CreatePublicEventBookingDto } from './dto/create-public-event-booking.dto';
import { QueryEventBookingsDto } from './dto/query-event-bookings.dto';
import { TransitionEventBookingDto } from './dto/transition-event-booking.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import {
  EventItemsService,
  EventQuoteComputation,
} from './event-items.service';
import { EventAvailabilityService } from './event-availability.service';
import { EventSupportSettingsService } from './event-support-settings.service';
import { aggregateEventQuote, computeLine } from './event-pricing';
import { applyJakartaDayRange } from '../../common/utils/jakarta-day-range';
import { SortOrder } from '../../common/enums/sort-order.enum';
import {
  generateBookingReference,
  MAX_REFERENCE_ATTEMPTS,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/booking-reference';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationSourceModule } from '../notifications/enums/notification-source-module.enum';
import { NotificationOrigin } from '../notifications/enums/notification-origin.enum';

/** Row shape for the item-lock query in confirm() — `queryRunner.query()`
 * returns `any`, this gives the destructure an explicit, honest type. */
interface LockedItemRow {
  id: string;
  stockQuantity: number;
  name: string;
}

/** Everything saveBookingWithReference() needs to build one EventBookingItem
 * row — shared by both create() (admin, itemId-keyed) and createPublic()
 * (public, slug-keyed via EventItemsService.quote()). `days` is deliberately
 * NOT here: it is recomputed centrally from startDate/endDate in
 * saveBookingWithReference(), since neither caller's source data carries it
 * pre-computed. */
interface BookingLineInput {
  itemId: string;
  itemName: string;
  quantity: number;
  startDate: string;
  endDate: string;
  dropoffAt: string;
  pickupAt: string;
  billingMode: EventBillingMode;
  pricePerDay: number;
  unitPrice: number;
  unitLabel: '8 jam' | 'hari';
  billableUnits: number;
  lineTotal: number;
}

interface BookingHeaderInput {
  customerName: string;
  phone: string | null;
  email: string | null;
  eventLocation: string | null;
  notes: string | null;
  source: EventBookingSource;
  createdById: string | null;
}

/** Allow-listed sortBy -> column map: TypeScript enforces every enum value
 * has an entry (a missing one is a compile error), and user input is only
 * ever used as a lookup key here — never interpolated into SQL. */
const EVENT_SORT_COLUMNS: Record<EventBookingSort, string> = {
  [EventBookingSort.CREATED_AT]: 'b.createdAt',
  [EventBookingSort.REFERENCE]: 'b.reference',
  [EventBookingSort.TOTAL]: 'b.total',
  [EventBookingSort.START_DATE]: 'b.startDate',
};

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
    private readonly settingsService: EventSupportSettingsService,
    private readonly notifications: NotificationsService,
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
   * the full entity graph for just that page.
   *
   * Do NOT add a join here — see MovingBookingsService.buildFilteredQb()'s
   * doc comment for why: TypeORM only promotes skip()/take() into SQL
   * LIMIT/OFFSET when the builder has zero join attributes. */
  private buildFilteredQb(query: QueryEventBookingsDto) {
    const { status, from, to, startFrom, startTo, search } = query;
    const qb = this.bookingRepo.createQueryBuilder('b');

    if (status) qb.andWhere('b.status = :status', { status });

    applyJakartaDayRange(qb, 'b.createdAt', from, to);

    // Window OVERLAP over the event's own start/end date — this is the OLD
    // from/to semantics, renamed to startFrom/startTo now that from/to
    // means createdAt everywhere (see BookingListQueryDto). A multi-day
    // booking that started before startFrom still matches if it hasn't
    // ended yet — BREAKING CHANGE for existing callers of the old from/to.
    if (startFrom) qb.andWhere('b.endDate >= :startFrom', { startFrom });
    if (startTo) qb.andWhere('b.startDate <= :startTo', { startTo });

    if (search) {
      qb.andWhere(
        '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search OR b.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    return qb;
  }

  async findAllAdmin(
    query: QueryEventBookingsDto,
  ): Promise<PaginatedResult<EventBooking>> {
    const { page, limit, sortBy, sortOrder } = query;

    const total = await this.buildFilteredQb(query).getCount();

    const direction = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';
    const idRows = await this.buildFilteredQb(query)
      .select('b.id', 'id')
      .orderBy(EVENT_SORT_COLUMNS[sortBy], direction)
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
   * Shared tail of both create paths below: turns priced lines + header
   * fields into a saved, reloaded EventBooking, with the same 5-attempt
   * reference-collision retry loop Storage/Moving also use.
   *
   * Booking-level startDate/endDate/dropoffAt/pickupAt are always the
   * min/max across `lineInputs` — NEVER copied from a cart-level dto field.
   * A cart-level dropoffAt/pickupAt can disagree with a per-line override,
   * so deriving from the lines themselves is the only value that is
   * correct for every line in the booking.
   */
  private async saveBookingWithReference(
    header: BookingHeaderInput,
    lineInputs: BookingLineInput[],
  ): Promise<EventBooking> {
    const lines = lineInputs.map((l) => ({
      ...l,
      // Calendar days held — still meaningful under hourly billing, kept
      // for anything (admin list filters, old reports) that reads `days`.
      days: Math.max(
        1,
        Math.round(
          (Date.parse(`${l.endDate}T00:00:00Z`) -
            Date.parse(`${l.startDate}T00:00:00Z`)) /
            86_400_000,
        ) + 1,
      ),
    }));

    const quote = aggregateEventQuote(lines);
    const startDate = lines.reduce(
      (min, l) => (l.startDate < min ? l.startDate : min),
      lines[0].startDate,
    );
    const endDate = lines.reduce(
      (max, l) => (l.endDate > max ? l.endDate : max),
      lines[0].endDate,
    );
    const dropoffAt = lines.reduce(
      (min, l) => (l.dropoffAt < min ? l.dropoffAt : min),
      lines[0].dropoffAt,
    );
    const pickupAt = lines.reduce(
      (max, l) => (l.pickupAt > max ? l.pickupAt : max),
      lines[0].pickupAt,
    );

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const booking = this.bookingRepo.create({
        reference: generateBookingReference('MDN-EVT'),
        customerName: header.customerName,
        phone: header.phone,
        email: header.email,
        eventLocation: header.eventLocation,
        notes: header.notes,
        source: header.source,
        startDate,
        endDate,
        dropoffAt,
        pickupAt,
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        total: quote.total,
        createdById: header.createdById,
        items: lines.map((l) => this.bookingItemRepo.create(l)),
      });

      try {
        const saved = await this.bookingRepo.save(booking);
        const full = await this.findOneOrFail(saved.id);
        await this.notifications.emitCreated({
          sourceModule: NotificationSourceModule.EVENT_SUPPORT,
          sourceId: full.id,
          reference: full.reference,
          customerName: full.customerName,
          total: full.total,
          origin:
            header.source === EventBookingSource.PUBLIC
              ? NotificationOrigin.CUSTOMER
              : NotificationOrigin.ADMIN,
        });
        return full;
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

  /**
   * Creates a `pending` booking recorded by an admin after a WhatsApp
   * conversation. Deliberately does NOT reserve stock — per the same
   * product decision as Smart Storage, only a confirmed booking counts
   * against availability, so two admins can both record a request against
   * the last unit here. The guard against overselling lives entirely in
   * confirm() below. Every line's `itemName`/`pricePerDay` is snapshotted
   * at creation time so a later rename or price change never rewrites this
   * booking's history.
   */
  async create(dto: CreateEventBookingDto, admin: User): Promise<EventBooking> {
    const items = await this.itemsService.findManyPublishedByIdsOrFail(
      dto.items.map((l) => l.itemId),
    );
    const itemById = new Map(items.map((i) => [i.id, i]));

    const lineInputs: BookingLineInput[] = dto.items.map((lineDto) => {
      const item = itemById.get(lineDto.itemId)!;
      const computed = computeLine({
        pricePerDay: item.pricePerDay,
        eightHourRate: item.eightHourRate,
        supportsEightHour: item.supportsEightHour,
        quantity: lineDto.quantity,
        dropoffAt: lineDto.dropoffAt,
        pickupAt: lineDto.pickupAt,
      });
      return {
        itemId: item.id,
        itemName: item.name,
        quantity: computed.quantity,
        startDate: computed.startDate,
        endDate: computed.endDate,
        dropoffAt: computed.dropoffAt,
        pickupAt: computed.pickupAt,
        billingMode: computed.billingMode,
        pricePerDay: item.pricePerDay,
        unitPrice: computed.unitPrice,
        unitLabel: computed.unitLabel,
        billableUnits: computed.billableUnits,
        lineTotal: computed.lineTotal,
      };
    });

    return this.saveBookingWithReference(
      {
        customerName: dto.customerName,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        eventLocation: dto.eventLocation ?? null,
        notes: dto.notes ?? null,
        source: EventBookingSource.ADMIN,
        createdById: admin.id,
      },
      lineInputs,
    );
  }

  /**
   * Creates a `pending` booking submitted directly by a customer — the
   * public counterpart to Storage's `POST /storage/bookings` and Moving's
   * `POST /moving/bookings`. Routes pricing through the exact same
   * `EventItemsService.quote()` call `POST /event-support/quote` uses, so
   * the persisted price can never drift from the quote the customer saw,
   * and per-line availability comes back for free as part of that call.
   * Reserves nothing — same rule as the admin path above.
   */
  async createPublic(dto: CreatePublicEventBookingDto): Promise<{
    booking: EventBooking;
    quote: EventQuoteComputation;
    settings: EventSupportSettings;
  }> {
    const [quote, settings] = await Promise.all([
      this.itemsService.quote(dto),
      this.settingsService.get(),
    ]);

    const lineInputs: BookingLineInput[] = quote.lines.map((l) => ({
      itemId: l.item.id,
      itemName: l.item.name,
      quantity: l.quantity,
      startDate: l.startDate,
      endDate: l.endDate,
      dropoffAt: l.dropoffAt,
      pickupAt: l.pickupAt,
      billingMode: l.billingMode,
      pricePerDay: l.item.pricePerDay,
      unitPrice: l.unitPrice,
      unitLabel: l.unitLabel,
      billableUnits: l.billableUnits,
      lineTotal: l.lineTotal,
    }));

    const booking = await this.saveBookingWithReference(
      {
        customerName: dto.customerName,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        eventLocation: dto.eventLocation ?? null,
        notes: dto.notes ?? null,
        source: EventBookingSource.PUBLIC,
        createdById: null,
      },
      lineInputs,
    );

    return { booking, quote, settings };
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

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.EVENT_SUPPORT,
      updated.id,
      updated.status,
    );
    return updated;
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

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.EVENT_SUPPORT,
      updated.id,
      updated.status,
    );
    return updated;
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

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.EVENT_SUPPORT,
      updated.id,
      updated.status,
    );
    return updated;
  }
}
