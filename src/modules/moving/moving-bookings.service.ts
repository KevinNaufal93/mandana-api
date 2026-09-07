import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { MovingBooking } from './entities/moving-booking.entity';
import { MovingBookingStop } from './entities/moving-booking-stop.entity';
import { MovingBookingAddon } from './entities/moving-booking-addon.entity';
import { MovingBookingLeg } from './entities/moving-booking-leg.entity';
import { MovingBookingStatus } from './enums/moving-booking-status.enum';
import { MovingBookingSort } from './enums/moving-booking-sort.enum';
import { CreateMovingBookingDto } from './dto/create-moving-booking.dto';
import { QueryMovingBookingsDto } from './dto/query-moving-bookings.dto';
import { TransitionMovingBookingDto } from './dto/transition-moving-booking.dto';
import { MovingService } from './moving.service';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
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

/** Allow-listed sortBy -> column map: TypeScript enforces every enum value
 * has an entry (a missing one is a compile error), and user input is only
 * ever used as a lookup key here — never interpolated into SQL. */
const MOVING_SORT_COLUMNS: Record<MovingBookingSort, string> = {
  [MovingBookingSort.CREATED_AT]: 'b.createdAt',
  [MovingBookingSort.REFERENCE]: 'b.reference',
  [MovingBookingSort.TOTAL]: 'b.total',
};

@Injectable()
export class MovingBookingsService {
  constructor(
    @InjectRepository(MovingBooking)
    private readonly bookingRepo: Repository<MovingBooking>,
    @InjectRepository(MovingBookingStop)
    private readonly stopRepo: Repository<MovingBookingStop>,
    @InjectRepository(MovingBookingAddon)
    private readonly addonRepo: Repository<MovingBookingAddon>,
    @InjectRepository(MovingBookingLeg)
    private readonly legRepo: Repository<MovingBookingLeg>,
    private readonly movingService: MovingService,
    private readonly notifications: NotificationsService,
  ) {}

  async findOneOrFail(id: string): Promise<MovingBooking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { stops: true, addons: true, legs: true, confirmedBy: true },
    });
    if (!booking) throw new NotFoundException(`Moving booking ${id} not found`);
    return booking;
  }

  /** Filters shared by the count and id-page queries below — split out so
   * neither query carries the joined `stops`/`addons`/`legs` collections:
   * paginating a query-builder with a joined one-to-many multiplies rows and
   * corrupts both `skip`/`take` and the total count (same hazard
   * EventBookingsService.findAllAdmin() documents — unlike Storage's admin
   * listing, whose joins are all many-to-one, MovingBooking has *three*
   * one-to-many children). Fetch matching ids first, then load the full
   * entity graph for just that page.
   *
   * Do NOT add a join here. `findAllAdmin()` below reads this builder via
   * `getRawMany()`, and TypeORM only promotes `.skip()`/`.take()` into SQL
   * LIMIT/OFFSET when the builder has zero join attributes — add one join
   * and the LIMIT silently disappears while `getCount()` still reports the
   * right total, so the bug would present as "meta.total is right but data
   * has every matching row." To filter on a child table (e.g. destination
   * address), use an EXISTS subquery instead. */
  private buildFilteredQb(query: QueryMovingBookingsDto) {
    const { status, from, to, search } = query;
    const qb = this.bookingRepo.createQueryBuilder('b');

    if (status) qb.andWhere('b.status = :status', { status });

    applyJakartaDayRange(qb, 'b.createdAt', from, to);

    if (search) {
      qb.andWhere(
        '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search OR b.email ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  async findAllAdmin(
    query: QueryMovingBookingsDto,
  ): Promise<PaginatedResult<MovingBooking>> {
    const { page, limit, sortBy, sortOrder } = query;

    const total = await this.buildFilteredQb(query).getCount();

    const direction = sortOrder === SortOrder.ASC ? 'ASC' : 'DESC';
    const idRows = await this.buildFilteredQb(query)
      .select('b.id', 'id')
      .orderBy(MOVING_SORT_COLUMNS[sortBy], direction)
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
            relations: {
              stops: true,
              addons: true,
              legs: true,
              confirmedBy: true,
            },
          });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((r): r is MovingBooking => !!r);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Persists the order a customer configured, the moment they click "Pesan
   * via WhatsApp" — before the real conversation/confirmation happens over
   * WhatsApp with a human. Always recomputes the price server-side via
   * `MovingService.buildQuote()` (the exact same validated path
   * `POST /moving/quote` uses) rather than trusting anything the client
   * sends — this is the third module using the reference-collision retry
   * loop from `booking-reference.ts` (Storage, Event Support, now Moving),
   * copied verbatim.
   */
  async create(dto: CreateMovingBookingDto): Promise<MovingBooking> {
    // legs.length must match destinations.length — or destinations.length + 1
    // when roundTrip is true and the caller chose to include an explicit
    // return leg (optional, not mandatory: roundTrip alone still controls
    // toll/addon doubling independent of leg count, see moving-pricing.ts).
    // Cross-field, so it can't be expressed with class-validator alone.
    const validLegCounts =
      dto.roundTrip === true
        ? [dto.destinations.length, dto.destinations.length + 1]
        : [dto.destinations.length];
    if (!validLegCounts.includes(dto.legs.length)) {
      throw new BadRequestException(
        `legs.length (${dto.legs.length}) must equal destinations.length (${dto.destinations.length})` +
          (dto.roundTrip === true
            ? ` or destinations.length + 1 (${dto.destinations.length + 1}) for an explicit return leg`
            : '') +
          '.',
      );
    }

    const { truck, result } = await this.movingService.buildQuote(dto);

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const booking = this.bookingRepo.create({
        reference: generateBookingReference('MDN-MOV'),
        status: MovingBookingStatus.PENDING,
        truckSlug: truck.slug,
        truckName: truck.name,
        pickupAddress: dto.pickup.address ?? null,
        pickupLat: dto.pickup.lat,
        pickupLng: dto.pickup.lng,
        distanceKm: result.distanceKm,
        includedKm: result.includedKm,
        chargeableKm: result.chargeableKm,
        chargeableSteps: result.chargeableSteps,
        roundTrip: result.roundTrip,
        tollRoute: result.tollRoute,
        declaredValue: dto.declaredValue ?? null,
        baseFare: result.baseFare,
        distanceFare: result.distanceFare,
        travelSubtotal: result.travelSubtotal,
        tollFare: result.tollFare,
        addonsTotal: result.addonsTotal,
        subtotal: result.subtotal,
        total: result.total,
        lowEstimate: result.lowEstimate,
        highEstimate: result.highEstimate,
        minFareApplied: result.minFareApplied,
        customerName: dto.customerName ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
        // Array order -> stopIndex: this is the "unlimited destinations"
        // piece — see MovingBookingStop's doc comment.
        stops: dto.destinations.map((d, i) =>
          this.stopRepo.create({
            stopIndex: i,
            address: d.address ?? null,
            lat: d.lat,
            lng: d.lng,
          }),
        ),
        // Snapshotted from the already-priced/validated addon lines — no
        // separate lookup needed, result.addons already has name/unitPrice.
        addons: result.addons.map((line) =>
          this.addonRepo.create({
            addonSlug: line.slug,
            addonName: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
          }),
        ),
        // Snapshotted from the already-priced per-leg breakdown, same
        // pattern as addons above — not re-derived from dto.legs.
        legs: result.legs.map((leg, i) =>
          this.legRepo.create({
            legIndex: i,
            distanceKm: leg.distanceKm,
            includedKm: leg.includedKm,
            chargeableKm: leg.chargeableKm,
            chargeableSteps: leg.chargeableSteps,
            baseFare: leg.baseFare,
            distanceFare: leg.distanceFare,
            subtotal: leg.subtotal,
          }),
        ),
      });

      try {
        const saved = await this.bookingRepo.save(booking); // cascades stops + addons + legs
        const full = await this.findOneOrFail(saved.id);
        await this.notifications.emitCreated({
          sourceModule: NotificationSourceModule.MOVING,
          sourceId: full.id,
          reference: full.reference,
          customerName: full.customerName,
          total: full.total,
          origin: NotificationOrigin.CUSTOMER,
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
    throw new Error('Failed to generate a unique moving booking reference');
  }

  /** Internal note only — status changes exclusively through the
   * confirm/reject/cancel/complete transitions below, never through this
   * generic PATCH. `forbidNonWhitelisted: true` (global ValidationPipe)
   * means a client still sending `status` here gets a hard 400, not a
   * silent no-op. */
  async update(
    id: string,
    dto: TransitionMovingBookingDto,
  ): Promise<MovingBooking> {
    const booking = await this.findOneOrFail(id);
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);
    return this.findOneOrFail(id);
  }

  private assertStatus(
    booking: MovingBooking,
    expected: MovingBookingStatus[],
    action: string,
  ): void {
    if (!expected.includes(booking.status)) {
      throw new ConflictException(
        `Booking ${booking.reference} is ${booking.status}, cannot ${action}`,
      );
    }
  }

  /**
   * Pure status writes below — unlike Storage/Event, Moving reserves no
   * inventory, so there is nothing to lock and no availability to
   * re-check. Do NOT add a QueryRunner/transaction here; there is no
   * concurrency hazard these four transitions need to guard against.
   */

  async confirm(
    id: string,
    dto: TransitionMovingBookingDto,
    admin: User,
  ): Promise<MovingBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [MovingBookingStatus.PENDING], 'confirm');

    booking.status = MovingBookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();
    booking.confirmedById = admin.id;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.MOVING,
      updated.id,
      updated.status,
    );
    return updated;
  }

  async reject(
    id: string,
    dto: TransitionMovingBookingDto,
  ): Promise<MovingBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [MovingBookingStatus.PENDING], 'reject');

    booking.status = MovingBookingStatus.REJECTED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.MOVING,
      updated.id,
      updated.status,
    );
    return updated;
  }

  async cancel(
    id: string,
    dto: TransitionMovingBookingDto,
  ): Promise<MovingBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [MovingBookingStatus.CONFIRMED], 'cancel');

    booking.status = MovingBookingStatus.CANCELLED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.MOVING,
      updated.id,
      updated.status,
    );
    return updated;
  }

  async complete(
    id: string,
    dto: TransitionMovingBookingDto,
  ): Promise<MovingBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, [MovingBookingStatus.CONFIRMED], 'complete');

    booking.status = MovingBookingStatus.COMPLETED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.notifications.resolveForBooking(
      NotificationSourceModule.MOVING,
      updated.id,
      updated.status,
    );
    return updated;
  }
}
