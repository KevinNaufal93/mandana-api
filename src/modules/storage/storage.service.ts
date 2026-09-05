import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageUnit } from './entities/storage-unit.entity';
import { CreateStorageUnitTypeDto } from './dto/create-storage-unit-type.dto';
import { UpdateStorageUnitTypeDto } from './dto/update-storage-unit-type.dto';
import { CreateStorageFacilityDto } from './dto/create-storage-facility.dto';
import { UpdateStorageFacilityDto } from './dto/update-storage-facility.dto';
import { CreateStorageInventoryDto } from './dto/create-storage-inventory.dto';
import { UpdateStorageInventoryDto } from './dto/update-storage-inventory.dto';
import { QuoteStorageDto } from './dto/quote-storage.dto';
import { StorageQuoteDto } from './dto/storage-response.dto';
import { StorageDurationUnit } from './enums/storage-duration-unit.enum';
import { resolveUniqueSlug } from '../../common/utils/slugify';
import { resolveStorageRates, storageQuote } from './storage-pricing';
import { StorageAvailabilityService } from './storage-availability.service';

@Injectable()
export class StorageService {
  constructor(
    @InjectRepository(StorageUnitType)
    private readonly unitTypeRepo: Repository<StorageUnitType>,
    @InjectRepository(StorageFacility)
    private readonly facilityRepo: Repository<StorageFacility>,
    @InjectRepository(StorageInventory)
    private readonly inventoryRepo: Repository<StorageInventory>,
    @InjectRepository(StorageUnit)
    private readonly unitRepo: Repository<StorageUnit>,
    private readonly availability: StorageAvailabilityService,
  ) {}

  // ─── Unit types ───────────────────────────────────────────────────────────

  findAllUnitTypesPublic(): Promise<StorageUnitType[]> {
    return this.unitTypeRepo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  findAllUnitTypesAdmin(isActive?: boolean): Promise<StorageUnitType[]> {
    const where: FindOptionsWhere<StorageUnitType> = {};
    if (isActive !== undefined) where.isActive = isActive;

    return this.unitTypeRepo.find({
      where,
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findUnitTypeOrFail(id: string): Promise<StorageUnitType> {
    const unitType = await this.unitTypeRepo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!unitType) {
      throw new NotFoundException(`Storage unit type ${id} not found`);
    }
    return unitType;
  }

  async findUnitTypeBySlugOrFail(slug: string): Promise<StorageUnitType> {
    const unitType = await this.unitTypeRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!unitType) {
      throw new NotFoundException(`Storage unit type '${slug}' not found`);
    }
    return unitType;
  }

  /** §weekly-pricing invariant: a unit type with `supportsWeekly: true` must
   * always carry a positive `weeklyRate` — otherwise a later quote() call
   * would silently 400 (or worse, fall back to $0) and the admin's "weekly"
   * toggle would lie. Checked against the resolved (post-merge) values, so
   * a PATCH that sets `supportsWeekly: true` without ever sending
   * `weeklyRate` on a unit type that has none is caught too. Mirrors
   * EventItemsService.assertHourlyRateInvariant. */
  private assertWeeklyRateInvariant(
    supportsWeekly: boolean,
    weeklyRate: number | null,
  ): void {
    if (supportsWeekly && !(weeklyRate !== null && weeklyRate > 0)) {
      throw new BadRequestException(
        'supportsWeekly requires a positive weeklyRate',
      );
    }
  }

  async createUnitType(
    dto: CreateStorageUnitTypeDto,
  ): Promise<StorageUnitType> {
    const slug = await resolveUniqueSlug(
      this.unitTypeRepo,
      dto.slug ?? dto.name,
    );

    const weeklyRate = dto.weeklyRate ?? null;
    const supportsWeekly = dto.supportsWeekly ?? false;
    this.assertWeeklyRateInvariant(supportsWeekly, weeklyRate);

    const unitType = this.unitTypeRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      volumeM3: dto.volumeM3 ?? null,
      lengthCm: dto.lengthCm ?? null,
      widthCm: dto.widthCm ?? null,
      heightCm: dto.heightCm ?? null,
      monthlyRate: dto.monthlyRate,
      minDurationMonths: dto.minDurationMonths ?? 1,
      weeklyRate,
      supportsWeekly,
      minDurationWeeks: dto.minDurationWeeks ?? null,
      mediaAssetId: dto.mediaAssetId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.unitTypeRepo.save(unitType);
    await this.availability.publish();
    return this.findUnitTypeOrFail(saved.id);
  }

  async updateUnitType(
    id: string,
    dto: UpdateStorageUnitTypeDto,
  ): Promise<StorageUnitType> {
    const unitType = await this.findUnitTypeOrFail(id);

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await resolveUniqueSlug(
            this.unitTypeRepo,
            dto.slug ?? dto.name ?? unitType.name,
            id,
          )
        : undefined;

    const resolvedWeeklyRate =
      dto.weeklyRate !== undefined ? dto.weeklyRate : unitType.weeklyRate;
    const resolvedSupportsWeekly =
      dto.supportsWeekly !== undefined
        ? dto.supportsWeekly
        : unitType.supportsWeekly;
    this.assertWeeklyRateInvariant(resolvedSupportsWeekly, resolvedWeeklyRate);

    Object.assign(unitType, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.volumeM3 !== undefined && { volumeM3: dto.volumeM3 ?? null }),
      ...(dto.lengthCm !== undefined && { lengthCm: dto.lengthCm ?? null }),
      ...(dto.widthCm !== undefined && { widthCm: dto.widthCm ?? null }),
      ...(dto.heightCm !== undefined && { heightCm: dto.heightCm ?? null }),
      ...(dto.monthlyRate !== undefined && { monthlyRate: dto.monthlyRate }),
      ...(dto.minDurationMonths !== undefined && {
        minDurationMonths: dto.minDurationMonths,
      }),
      ...(dto.weeklyRate !== undefined && {
        weeklyRate: dto.weeklyRate ?? null,
      }),
      ...(dto.supportsWeekly !== undefined && {
        supportsWeekly: dto.supportsWeekly,
      }),
      ...(dto.minDurationWeeks !== undefined && {
        minDurationWeeks: dto.minDurationWeeks ?? null,
      }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.unitTypeRepo.save(unitType);
    await this.availability.publish();
    return this.findUnitTypeOrFail(id);
  }

  async removeUnitType(id: string): Promise<void> {
    const unitType = await this.findUnitTypeOrFail(id);
    await this.unitTypeRepo.remove(unitType);
    await this.availability.publish();
  }

  // ─── Facilities ───────────────────────────────────────────────────────────

  findAllFacilitiesPublic(): Promise<StorageFacility[]> {
    return this.facilityRepo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  findAllFacilitiesAdmin(isActive?: boolean): Promise<StorageFacility[]> {
    const where: FindOptionsWhere<StorageFacility> = {};
    if (isActive !== undefined) where.isActive = isActive;

    return this.facilityRepo.find({
      where,
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findFacilityOrFail(id: string): Promise<StorageFacility> {
    const facility = await this.facilityRepo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!facility) {
      throw new NotFoundException(`Storage facility ${id} not found`);
    }
    return facility;
  }

  async findFacilityBySlugOrFail(slug: string): Promise<StorageFacility> {
    const facility = await this.facilityRepo.findOne({
      where: { slug, isActive: true },
      relations: { mediaAsset: true },
    });
    if (!facility) {
      throw new NotFoundException(`Storage facility '${slug}' not found`);
    }
    return facility;
  }

  async createFacility(
    dto: CreateStorageFacilityDto,
  ): Promise<StorageFacility> {
    const slug = await resolveUniqueSlug(
      this.facilityRepo,
      dto.slug ?? dto.name,
    );

    const facility = this.facilityRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      address: dto.address ?? null,
      area: dto.area ?? null,
      city: dto.city ?? null,
      province: dto.province ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      mediaAssetId: dto.mediaAssetId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.facilityRepo.save(facility);
    await this.availability.publish();
    return this.findFacilityOrFail(saved.id);
  }

  async updateFacility(
    id: string,
    dto: UpdateStorageFacilityDto,
  ): Promise<StorageFacility> {
    const facility = await this.findFacilityOrFail(id);

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await resolveUniqueSlug(
            this.facilityRepo,
            dto.slug ?? dto.name ?? facility.name,
            id,
          )
        : undefined;

    Object.assign(facility, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.address !== undefined && { address: dto.address ?? null }),
      ...(dto.area !== undefined && { area: dto.area ?? null }),
      ...(dto.city !== undefined && { city: dto.city ?? null }),
      ...(dto.province !== undefined && { province: dto.province ?? null }),
      ...(dto.latitude !== undefined && { latitude: dto.latitude ?? null }),
      ...(dto.longitude !== undefined && {
        longitude: dto.longitude ?? null,
      }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.facilityRepo.save(facility);
    await this.availability.publish();
    return this.findFacilityOrFail(id);
  }

  async removeFacility(id: string): Promise<void> {
    const facility = await this.findFacilityOrFail(id);
    await this.facilityRepo.remove(facility);
    await this.availability.publish();
  }

  // ─── Inventory ────────────────────────────────────────────────────────────

  findAllInventoryAdmin(
    facilityId?: string,
    unitTypeId?: string,
  ): Promise<StorageInventory[]> {
    const where: FindOptionsWhere<StorageInventory> = {};
    if (facilityId) where.facilityId = facilityId;
    if (unitTypeId) where.unitTypeId = unitTypeId;

    return this.inventoryRepo.find({
      where,
      relations: { facility: true, unitType: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findInventoryOrFail(id: string): Promise<StorageInventory> {
    const inventory = await this.inventoryRepo.findOne({
      where: { id },
      relations: { facility: true, unitType: true },
    });
    if (!inventory) {
      throw new NotFoundException(`Storage inventory row ${id} not found`);
    }
    return inventory;
  }

  async createInventory(
    dto: CreateStorageInventoryDto,
  ): Promise<StorageInventory> {
    // Existence checks first — surfaces a clean 404 instead of a raw FK
    // violation (which AllExceptionsFilter has no special handling for).
    await this.findFacilityOrFail(dto.facilityId);
    await this.findUnitTypeOrFail(dto.unitTypeId);

    const inventory = this.inventoryRepo.create({
      facilityId: dto.facilityId,
      unitTypeId: dto.unitTypeId,
      monthlyRateOverride: dto.monthlyRateOverride ?? null,
      weeklyRateOverride: dto.weeklyRateOverride ?? null,
      isActive: dto.isActive ?? true,
    });
    // A racing duplicate (facilityId, unitTypeId) pair surfaces as the
    // standard 23505 → 409 "Resource already exists" via AllExceptionsFilter
    // — no pre-check needed, the UNIQUE constraint already guards this.
    const saved = await this.inventoryRepo.save(inventory);
    await this.availability.publish();
    return this.findInventoryOrFail(saved.id);
  }

  async updateInventory(
    id: string,
    dto: UpdateStorageInventoryDto,
  ): Promise<StorageInventory> {
    const inventory = await this.findInventoryOrFail(id);

    Object.assign(inventory, {
      ...(dto.facilityId !== undefined && { facilityId: dto.facilityId }),
      ...(dto.unitTypeId !== undefined && { unitTypeId: dto.unitTypeId }),
      ...(dto.monthlyRateOverride !== undefined && {
        monthlyRateOverride: dto.monthlyRateOverride ?? null,
      }),
      ...(dto.weeklyRateOverride !== undefined && {
        weeklyRateOverride: dto.weeklyRateOverride ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    await this.inventoryRepo.save(inventory);
    await this.availability.publish();
    return this.findInventoryOrFail(id);
  }

  async removeInventory(id: string): Promise<void> {
    const inventory = await this.findInventoryOrFail(id);
    await this.inventoryRepo.remove(inventory);
    await this.availability.publish();
  }

  // ─── Quote ────────────────────────────────────────────────────────────────

  /** Resolves and validates a facility+unitType+inventory triple, plus the
   * live physical unit count for that pair (StorageInventory no longer
   * carries totalUnits — see storage-inventory.entity.ts). Shared by
   * quote() and (via StorageService injected into StorageBookingsService)
   * booking creation, so "is this combination bookable" has one answer. */
  async resolveBookableInventory(
    facilitySlug: string,
    unitTypeSlug: string,
  ): Promise<{
    facility: StorageFacility;
    unitType: StorageUnitType;
    inventory: StorageInventory;
    totalUnits: number;
  }> {
    const facility = await this.findFacilityBySlugOrFail(facilitySlug);
    const unitType = await this.findUnitTypeBySlugOrFail(unitTypeSlug);
    const inventory = await this.inventoryRepo.findOne({
      where: {
        facilityId: facility.id,
        unitTypeId: unitType.id,
        isActive: true,
      },
    });
    if (!inventory) {
      throw new NotFoundException(
        `${unitType.name} is not offered at ${facility.name}`,
      );
    }
    const totalUnits = await this.unitRepo.count({
      where: {
        facilityId: facility.id,
        unitTypeId: unitType.id,
        isActive: true,
      },
    });
    return { facility, unitType, inventory, totalUnits };
  }

  async quote(dto: QuoteStorageDto): Promise<StorageQuoteDto> {
    const { facility, unitType, inventory } =
      await this.resolveBookableInventory(dto.facilitySlug, dto.unitTypeSlug);

    // Exactly one of these is set — enforced by @ValidStorageDuration() on
    // the DTO. durationMonths (legacy) implies 'month'.
    const durationUnit = dto.durationUnit ?? StorageDurationUnit.MONTH;
    const duration = dto.durationMonths ?? dto.duration!;

    const rates = resolveStorageRates(unitType, inventory);
    const isWeeklyEligible =
      Boolean(rates.supportsWeekly) && (rates.weeklyRate ?? 0) > 0;
    if (durationUnit === StorageDurationUnit.WEEK && !isWeeklyEligible) {
      throw new BadRequestException(
        `${unitType.name} is not available for weekly booking`,
      );
    }

    const quantity = dto.quantity ?? 1;
    const result = storageQuote(rates, quantity, duration, durationUnit);

    return {
      facility: { slug: facility.slug, name: facility.name },
      unitType: { slug: unitType.slug, name: unitType.name },
      ...result,
      // storage-pricing.ts is decorator-free and mirrored byte-for-byte in
      // the frontend repo, so it deals in the plain 'week' | 'month' union
      // rather than this Nest-flavoured enum — same underlying string
      // values, safe to re-type at this boundary.
      durationUnit: result.durationUnit as StorageDurationUnit,
      currency: 'IDR',
    };
  }
}
