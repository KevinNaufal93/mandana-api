import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageBookingStatus } from './enums/storage-booking-status.enum';
import { CreateStorageBookingDto } from './dto/create-storage-booking.dto';
import { QueryStorageBookingsDto } from './dto/query-storage-bookings.dto';
import { TransitionStorageBookingDto } from './dto/transition-storage-booking.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import { StorageService } from './storage.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageMapper } from './storage.mapper';
import { addMonthsToDateString, storageQuote } from './storage-pricing';

// No 0/O/1/I — avoids visual ambiguity when a customer reads the reference
// out loud over WhatsApp or phone.
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERENCE_CODE_LENGTH = 6;
const MAX_REFERENCE_ATTEMPTS = 5;
const POSTGRES_UNIQUE_VIOLATION = '23505';

/** `storage_bookings.reference` is the table's only unique column, so any
 * 23505 on insert can only be a reference collision — safe to retry blindly
 * rather than letting it surface as the generic "Resource already exists"
 * AllExceptionsFilter would otherwise produce (see all-exceptions.filter.ts). */
function generateReference(): string {
  const bytes = randomBytes(REFERENCE_CODE_LENGTH);
  let code = '';
  for (const b of bytes)
    code += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return `MDN-STG-${code}`;
}

@Injectable()
export class StorageBookingsService {
  constructor(
    @InjectRepository(StorageBooking)
    private readonly bookingRepo: Repository<StorageBooking>,
    @InjectRepository(StorageInventory)
    private readonly inventoryRepo: Repository<StorageInventory>,
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
    const { facility, unitType, inventory } =
      await this.storageService.resolveBookableInventory(
        dto.facilitySlug,
        dto.unitTypeSlug,
      );

    const quantity = dto.quantity ?? 1;
    if (quantity > inventory.totalUnits) {
      throw new BadRequestException(
        `${facility.name} only has ${inventory.totalUnits} ${unitType.name} unit(s) in total`,
      );
    }
    if (dto.durationMonths < unitType.minDurationMonths) {
      throw new BadRequestException(
        `${unitType.name} requires a minimum of ${unitType.minDurationMonths} month(s)`,
      );
    }

    const rate = inventory.monthlyRateOverride ?? unitType.monthlyRate;
    const priced = storageQuote(
      { monthlyRate: rate },
      quantity,
      dto.durationMonths,
    );
    const endDate = addMonthsToDateString(dto.startDate, dto.durationMonths);

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const booking = this.bookingRepo.create({
        reference: generateReference(),
        customerName: dto.customerName,
        email: dto.email,
        phone: dto.phone ?? null,
        notes: dto.notes ?? null,
        facilityId: facility.id,
        unitTypeId: unitType.id,
        quantity,
        startDate: dto.startDate,
        durationMonths: dto.durationMonths,
        endDate,
        monthlyRate: rate,
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

  /** Mirror of the allocate step below — GREATEST(...) floors at 0 so a
   * double-release (e.g. a retried request) can never go negative. */
  private async releaseUnit(booking: StorageBooking): Promise<void> {
    await this.inventoryRepo
      .createQueryBuilder()
      .update(StorageInventory)
      .set({ occupiedUnits: () => 'GREATEST(occupied_units - :qty, 0)' })
      .where('facility_id = :facilityId AND unit_type_id = :unitTypeId', {
        facilityId: booking.facilityId,
        unitTypeId: booking.unitTypeId,
      })
      .setParameter('qty', booking.quantity)
      .execute();
  }

  /**
   * The only place occupancy is taken. One atomic conditional UPDATE — no
   * SELECT ... FOR UPDATE, no transaction — the WHERE clause's capacity
   * check and the increment happen in the same statement, so two admins
   * confirming the last unit concurrently cannot both succeed: the second
   * UPDATE's WHERE simply matches zero rows once the first has committed.
   */
  async confirm(
    id: string,
    dto: TransitionStorageBookingDto,
    admin: User,
  ): Promise<StorageBooking> {
    const booking = await this.findOneOrFail(id);
    this.assertStatus(booking, StorageBookingStatus.PENDING, 'confirm');

    const result = await this.inventoryRepo
      .createQueryBuilder()
      .update(StorageInventory)
      .set({ occupiedUnits: () => 'occupied_units + :qty' })
      .where('facility_id = :facilityId AND unit_type_id = :unitTypeId', {
        facilityId: booking.facilityId,
        unitTypeId: booking.unitTypeId,
      })
      .andWhere('total_units - occupied_units >= :qty')
      .setParameter('qty', booking.quantity)
      .execute();

    if (result.affected === 0) {
      const inventory = await this.inventoryRepo.findOne({
        where: {
          facilityId: booking.facilityId,
          unitTypeId: booking.unitTypeId,
        },
      });
      const available = inventory
        ? Math.max(0, inventory.totalUnits - inventory.occupiedUnits)
        : 0;
      throw new ConflictException(
        `Only ${available} unit(s) of ${booking.unitType.name} left at ${booking.facility.name}`,
      );
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
