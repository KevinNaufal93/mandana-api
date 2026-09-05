import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageBookingStatus } from './enums/storage-booking-status.enum';
import { StorageUnitStatus } from './enums/storage-unit-status.enum';
import { CreateStorageBookingDto } from './dto/create-storage-booking.dto';
import { QueryStorageBookingsDto } from './dto/query-storage-bookings.dto';
import { TransitionStorageBookingDto } from './dto/transition-storage-booking.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import { StorageService } from './storage.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageMapper } from './storage.mapper';
import { StorageDurationUnit } from './enums/storage-duration-unit.enum';
import {
  addMonthsToDateString,
  addWeeksToDateString,
  resolveStorageRates,
  storageQuote,
} from './storage-pricing';
import {
  generateBookingReference,
  MAX_REFERENCE_ATTEMPTS,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/booking-reference';

/** Shapes for the two raw SQL result sets in confirm() — `queryRunner.query()`
 * returns `any`, so these give the two destructures an explicit, honest type
 * instead of letting `any` flow silently into typed variables. */
interface ClaimedUnitRow {
  id: string;
}
interface CountRow {
  count: number;
}

@Injectable()
export class StorageBookingsService {
  constructor(
    @InjectRepository(StorageBooking)
    private readonly bookingRepo: Repository<StorageBooking>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly availability: StorageAvailabilityService,
    private readonly mapper: StorageMapper,
  ) {}

  async findOneOrFail(id: string): Promise<StorageBooking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { facility: true, unitType: true, confirmedBy: true },
    });
    if (!booking)
      throw new NotFoundException(`Storage booking ${id} not found`);
    return booking;
  }

  async findAllAdmin(
    query: QueryStorageBookingsDto,
  ): Promise<PaginatedResult<StorageBooking>> {
    const { page, limit, status, facilitySlug, unitTypeSlug } = query;

    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.facility', 'facility')
      .leftJoinAndSelect('b.unitType', 'unitType')
      .leftJoinAndSelect('b.confirmedBy', 'confirmedBy');

    if (status) qb.andWhere('b.status = :status', { status });
    if (facilitySlug) {
      qb.andWhere('facility.slug = :facilitySlug', { facilitySlug });
    }
    if (unitTypeSlug) {
      qb.andWhere('unitType.slug = :unitTypeSlug', { unitTypeSlug });
    }

    qb.orderBy('b.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Creates a `pending` booking. Deliberately does NOT reserve a unit —
   * per the confirmed product decision, only a confirmed booking occupies
   * stock, so two customers can both request the last one here. The guard
   * against overselling lives entirely in confirm() below.
   */
  async create(dto: CreateStorageBookingDto): Promise<StorageBooking> {
    const { facility, unitType, inventory, totalUnits } =
      await this.storageService.resolveBookableInventory(
        dto.facilitySlug,
        dto.unitTypeSlug,
      );

    const quantity = dto.quantity ?? 1;
    if (quantity > totalUnits) {
      throw new BadRequestException(
        `${facility.name} only has ${totalUnits} ${unitType.name} unit(s) in total`,
      );
    }

    // Exactly one of these is set — enforced by @ValidStorageDuration() on
    // the DTO. durationMonths (legacy) implies 'month'.
    const durationUnit = dto.durationUnit ?? StorageDurationUnit.MONTH;
    const duration = dto.durationMonths ?? dto.duration!;

    const rates = resolveStorageRates(unitType, inventory);

    if (durationUnit === StorageDurationUnit.WEEK) {
      const isWeeklyEligible =
        Boolean(rates.supportsWeekly) && (rates.weeklyRate ?? 0) > 0;
      if (!isWeeklyEligible) {
        throw new BadRequestException(
          `${unitType.name} is not available for weekly booking`,
        );
      }
      const minWeeks = unitType.minDurationWeeks ?? 1;
      if (duration < minWeeks) {
        throw new BadRequestException(
          `${unitType.name} requires a minimum of ${minWeeks} week(s)`,
        );
      }
    } else if (duration < unitType.minDurationMonths) {
      throw new BadRequestException(
        `${unitType.name} requires a minimum of ${unitType.minDurationMonths} month(s)`,
      );
    }

    const priced = storageQuote(rates, quantity, duration, durationUnit);
    const endDate =
      durationUnit === StorageDurationUnit.WEEK
        ? addWeeksToDateString(dto.startDate, duration)
        : addMonthsToDateString(dto.startDate, duration);

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const booking = this.bookingRepo.create({
        reference: generateBookingReference('MDN-STG'),
        customerName: dto.customerName,
        email: dto.email,
        phone: dto.phone ?? null,
        notes: dto.notes ?? null,
        facilityId: facility.id,
        unitTypeId: unitType.id,
        quantity,
        startDate: dto.startDate,
        durationMonths: priced.durationMonths,
        endDate,
        durationUnit,
        durationUnits: duration,
        unitRate: priced.unitRate,
        monthlyRate: rates.monthlyRate,
        subtotal: priced.subtotal,
        discountAmount: priced.discountAmount,
        total: priced.total,
      });

      try {
        const saved = await this.bookingRepo.save(booking);
        const full = await this.findOneOrFail(saved.id);
        this.availability.publishBookingCreated(
          this.mapper.toBookingCreatedEvent(full),
        );
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

  private assertStatus(
    booking: StorageBooking,
    expected: StorageBookingStatus,
    action: string,
  ): void {
    if (booking.status !== expected) {
      throw new ConflictException(
        `Booking ${booking.reference} is ${booking.status}, cannot ${action}`,
      );
    }
  }

  /** Releases whatever units this specific booking holds, regardless of
   * quantity — a plain targeted UPDATE, no locking needed: only one booking
   * can ever point at a given set of rows, so there's no contention to
   * resolve here (unlike confirm() below, which is contested). */
  private async releaseUnit(booking: StorageBooking): Promise<void> {
    await this.dataSource.query(
      `UPDATE storage_units
         SET status = $1::storage_units_status_enum, booking_id = NULL, "updatedAt" = now()
       WHERE booking_id = $2`,
      [StorageUnitStatus.AVAILABLE, booking.id],
    );
  }

  /**
   * The only place occupancy is taken. Unlike a pooled counter, claiming N
   * *specific* unit rows needs real row-level locking: two admins confirming
   * the last unit concurrently must not both succeed. `SELECT ... FOR UPDATE
   * SKIP LOCKED` is what makes that safe — the second transaction's SELECT
   * simply skips any row the first has already locked, so it correctly sees
   * fewer than `quantity` rows available and rolls back instead of racing.
   * Raw SQL through a manual QueryRunner transaction — the portable choice,
   * matching how the phase-1 atomic-UPDATE trick also went straight to SQL
   * rather than trusting a query-builder abstraction to get SKIP LOCKED right.
   */
  async confirm(
    id: string,
    dto: TransitionStorageBookingDto,
    admin: User,
  ): Promise<StorageBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, StorageBookingStatus.PENDING, 'confirm');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const claimed = (await queryRunner.query(
        `SELECT id FROM storage_units
           WHERE facility_id = $1 AND unit_type_id = $2
             AND status = $3::storage_units_status_enum AND is_active = true
           ORDER BY code
           LIMIT $4
           FOR UPDATE SKIP LOCKED`,
        [
          booking.facilityId,
          booking.unitTypeId,
          StorageUnitStatus.AVAILABLE,
          booking.quantity,
        ],
      )) as ClaimedUnitRow[];

      if (claimed.length < booking.quantity) {
        const [{ count }] = (await queryRunner.query(
          `SELECT COUNT(*)::int AS count FROM storage_units
             WHERE facility_id = $1 AND unit_type_id = $2
               AND status = $3::storage_units_status_enum AND is_active = true`,
          [booking.facilityId, booking.unitTypeId, StorageUnitStatus.AVAILABLE],
        )) as CountRow[];
        await queryRunner.rollbackTransaction();
        throw new ConflictException(
          `Only ${count} unit(s) of ${booking.unitType.name} left at ${booking.facility.name}`,
        );
      }

      await queryRunner.query(
        `UPDATE storage_units
           SET status = $1::storage_units_status_enum, booking_id = $2, "updatedAt" = now()
         WHERE id = ANY($3::uuid[])`,
        [StorageUnitStatus.OCCUPIED, booking.id, claimed.map((row) => row.id)],
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    booking.status = StorageBookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();
    booking.confirmedById = admin.id;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.availability.publish();
    this.availability.publishBookingUpdated(
      this.mapper.toBookingUpdatedEvent(updated),
    );
    return updated;
  }

  async reject(
    id: string,
    dto: TransitionStorageBookingDto,
  ): Promise<StorageBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, StorageBookingStatus.PENDING, 'reject');

    booking.status = StorageBookingStatus.REJECTED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    this.availability.publishBookingUpdated(
      this.mapper.toBookingUpdatedEvent(updated),
    );
    return updated;
  }

  async cancel(
    id: string,
    dto: TransitionStorageBookingDto,
  ): Promise<StorageBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, StorageBookingStatus.CONFIRMED, 'cancel');

    await this.releaseUnit(booking);
    booking.status = StorageBookingStatus.CANCELLED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.availability.publish();
    this.availability.publishBookingUpdated(
      this.mapper.toBookingUpdatedEvent(updated),
    );
    return updated;
  }

  async complete(
    id: string,
    dto: TransitionStorageBookingDto,
  ): Promise<StorageBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, StorageBookingStatus.CONFIRMED, 'complete');

    await this.releaseUnit(booking);
    booking.status = StorageBookingStatus.COMPLETED;
    if (dto.adminNote !== undefined) booking.adminNote = dto.adminNote;
    await this.bookingRepo.save(booking);

    const updated = await this.findOneOrFail(id);
    await this.availability.publish();
    this.availability.publishBookingUpdated(
      this.mapper.toBookingUpdatedEvent(updated),
    );
    return updated;
  }
}
