import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageSettings } from './entities/storage-settings.entity';
import { UpdateStorageSettingsDto } from './dto/update-storage-settings.dto';
import { STORAGE_DEFAULTS } from './storage-pricing';

/**
 * Reads/writes the Smart Storage pricing-policy singleton (insurancePct).
 * See storage-settings.entity.ts and storage-pricing.ts. Mirrors
 * MovingSettingsService exactly.
 */
@Injectable()
export class StorageSettingsService {
  constructor(
    @InjectRepository(StorageSettings)
    private readonly repo: Repository<StorageSettings>,
  ) {}

  /** Loads the singleton row, seeding it on first read if the migration's
   * seed somehow didn't run (e.g. a DB restored before this migration) —
   * a quote must never 500 for missing pricing config. */
  async get(): Promise<StorageSettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      insurancePct: STORAGE_DEFAULTS.insurancePct,
    });
    return this.repo.save(created);
  }

  async update(dto: UpdateStorageSettingsDto): Promise<StorageSettings> {
    const settings = await this.get();

    Object.assign(settings, {
      ...(dto.insurancePct !== undefined && {
        insurancePct: dto.insurancePct,
      }),
    });

    return this.repo.save(settings);
  }
}
