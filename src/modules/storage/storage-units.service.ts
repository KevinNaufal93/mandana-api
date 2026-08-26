import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { StorageUnit } from './entities/storage-unit.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageUnitStatus } from './enums/storage-unit-status.enum';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { BulkCreateStorageUnitsDto } from './dto/bulk-create-storage-units.dto';
import { BulkDeleteStorageUnitsDto } from './dto/bulk-delete-storage-units.dto';
import { QueryStorageUnitsDto } from './dto/query-storage-units.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { StorageAvailabilityService } from './storage-availability.service';

/**
 * CRUD for individual storage_unit rows, kept independent of StorageService
 * (which owns unit-types/facilities/inventory) — StorageService needs a live
 * unit count for resolveBookableInventory(), and this service needs facility/
 * unit-type existence checks, so sharing one direction would create a cycle.
 * Both sides just inject the repos they need directly instead.
 */
@Injectable()
export class StorageUnitsService {
  constructor(
    @InjectRepository(StorageUnit)
    private readonly unitRepo: Repository<StorageUnit>,
    @InjectRepository(StorageFacility)
    private readonly facilityRepo: Repository<StorageFacility>,
    @InjectRepository(StorageUnitType)
    private readonly unitTypeRepo: Repository<StorageUnitType>,
    private readonly availability: StorageAvailabilityService,
  ) {}

  async findAllAdmin(
    query: QueryStorageUnitsDto,
  ): Promise<PaginatedResult<StorageUnit>> {
    const { page, limit, facilityId, unitTypeId, status } = query;

    const where: FindOptionsWhere<StorageUnit> = {};
    if (facilityId) where.facilityId = facilityId;
    if (unitTypeId) where.unitTypeId = unitTypeId;
    if (status) where.status = status;

    const [data, total] = await this.unitRepo.findAndCount({
      where,
      relations: { facility: true, unitType: true },
      order: {
        facility: { sortOrder: 'ASC' },
        unitType: { sortOrder: 'ASC' },
        code: 'ASC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneOrFail(id: string): Promise<StorageUnit> {
    const unit = await this.unitRepo.findOne({
      where: { id },
      relations: { facility: true, unitType: true },
    });
    if (!unit) throw new NotFoundException(`Storage unit ${id} not found`);
    return unit;
  }

  /** Total physical capacity for a facility+type pair — the live source of
   * truth StorageService.resolveBookableInventory() reads for its capacity
   * sanity-check (replacing the old StorageInventory.totalUnits column). */
  countTotal(facilityId: string, unitTypeId: string): Promise<number> {
    return this.unitRepo.count({
      where: { facilityId, unitTypeId, isActive: true },
    });
  }

  private async assertFacilityAndUnitTypeExist(
    facilityId: string,
    unitTypeId: string,
  ): Promise<void> {
    const [facility, unitType] = await Promise.all([
      this.facilityRepo.findOne({ where: { id: facilityId } }),
      this.unitTypeRepo.findOne({ where: { id: unitTypeId } }),
    ]);
    if (!facility) {
      throw new NotFoundException(`Storage facility ${facilityId} not found`);
    }
    if (!unitType) {
      throw new NotFoundException(`Storage unit type ${unitTypeId} not found`);
    }
  }

  async create(dto: CreateStorageUnitDto): Promise<StorageUnit> {
    await this.assertFacilityAndUnitTypeExist(dto.facilityId, dto.unitTypeId);

    const unit = this.unitRepo.create({
      facilityId: dto.facilityId,
      unitTypeId: dto.unitTypeId,
      code: dto.code,
      gridColumn: dto.gridColumn ?? null,
      gridRow: dto.gridRow ?? null,
      columnSpan: dto.columnSpan ?? null,
      rowSpan: dto.rowSpan ?? null,
      status: dto.status ?? StorageUnitStatus.AVAILABLE,
      isActive: dto.isActive ?? true,
    });
    // A racing duplicate (facilityId, code) surfaces as the standard 23505 →
    // 409 via AllExceptionsFilter — no pre-check needed.
    const saved = await this.unitRepo.save(unit);
    await this.availability.publish();
    return this.findOneOrFail(saved.id);
  }

  async update(id: string, dto: UpdateStorageUnitDto): Promise<StorageUnit> {
    const unit = await this.findOneOrFail(id);

    Object.assign(unit, {
      ...(dto.facilityId !== undefined && { facilityId: dto.facilityId }),
      ...(dto.unitTypeId !== undefined && { unitTypeId: dto.unitTypeId }),
      ...(dto.code !== undefined && { code: dto.code }),
      ...(dto.gridColumn !== undefined && {
        gridColumn: dto.gridColumn ?? null,
      }),
      ...(dto.gridRow !== undefined && { gridRow: dto.gridRow ?? null }),
      ...(dto.columnSpan !== undefined && {
        columnSpan: dto.columnSpan ?? null,
      }),
      ...(dto.rowSpan !== undefined && { rowSpan: dto.rowSpan ?? null }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    await this.unitRepo.save(unit);
    await this.availability.publish();
    return this.findOneOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const unit = await this.findOneOrFail(id);
    await this.unitRepo.remove(unit);
    await this.availability.publish();
  }

  /** Ops convenience for adding capacity — the same "prefix + next sequence
   * number" logic the initial migration's seed step already needs. */
  async bulkCreate(dto: BulkCreateStorageUnitsDto): Promise<StorageUnit[]> {
    await this.assertFacilityAndUnitTypeExist(dto.facilityId, dto.unitTypeId);

    const prefix = dto.codePrefix.toUpperCase();
    const existing = await this.unitRepo.find({
      where: { facilityId: dto.facilityId },
      select: { code: true },
    });

    const codePattern = new RegExp(`^${prefix}-(\\d+)$`);
    let maxSeq = 0;
    for (const u of existing) {
      const match = codePattern.exec(u.code);
      if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }

    const toCreate = Array.from({ length: dto.count }, (_, i) =>
      this.unitRepo.create({
        facilityId: dto.facilityId,
        unitTypeId: dto.unitTypeId,
        code: `${prefix}-${String(maxSeq + i + 1).padStart(2, '0')}`,
        status: StorageUnitStatus.AVAILABLE,
        isActive: true,
      }),
    );

    const saved = await this.unitRepo.save(toCreate);
    await this.availability.publish();
    // save() only returns the FK columns (facilityId/unitTypeId), not the
    // loaded facility/unitType relations — toUnitDto() needs both slugs, so
    // reload with relations before returning (same reason create() does it).
    return this.unitRepo.find({
      where: { id: In(saved.map((u) => u.id)) },
      relations: { facility: true, unitType: true },
      order: { code: 'ASC' },
    });
  }

  /** Row-select counterpart to bulkCreate() — atomic: every id must exist
   * or nothing is deleted, so a caller never has to reconcile a partial
   * result. Same "name what's missing" shape as findOneOrFail(), just for
   * a set instead of one id. No occupied-unit guard, same as remove(). */
  async bulkRemove(dto: BulkDeleteStorageUnitsDto): Promise<void> {
    const units = await this.unitRepo.find({
      where: { id: In(dto.ids) },
    });

    const foundIds = new Set(units.map((u) => u.id));
    const missing = dto.ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Storage unit(s) not found: ${missing.join(', ')}`,
      );
    }

    await this.unitRepo.remove(units);
    await this.availability.publish();
  }
}
