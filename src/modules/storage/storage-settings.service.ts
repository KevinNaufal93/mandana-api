import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageSettings } from './entities/storage-settings.entity';
import { UpdateStorageSettingsDto } from './dto/update-storage-settings.dto';
import { STORAGE_DEFAULTS } from './storage-pricing';
import { SiteConfigCacheService } from '../site-config/site-config-cache.service';

/**
 * Reads/writes the Smart Storage pricing-policy singleton (insuranceBps).
 * See storage-settings.entity.ts and storage-pricing.ts. Mirrors
 * MovingSettingsService exactly, except for the pct<->bps conversion on
 * update()/the mapper — same convention as PropertySettingsService's
 * kprAnnualRateBps.
 */
@Injectable()
export class StorageSettingsService {
  constructor(
    @InjectRepository(StorageSettings)
    private readonly repo: Repository<StorageSettings>,
    private readonly siteConfigCache: SiteConfigCacheService,
  ) {}

  /** Loads the singleton row, seeding it on first read if the migration's
   * seed somehow didn't run (e.g. a DB restored before this migration) —
   * a quote must never 500 for missing pricing config. */
  async get(): Promise<StorageSettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      insuranceBps: STORAGE_DEFAULTS.insuranceBps,
      whatsappNumber: null,
    });
    return this.repo.save(created);
  }

  async update(dto: UpdateStorageSettingsDto): Promise<StorageSettings> {
    const settings = await this.get();

    Object.assign(settings, {
      // dto.insurancePct is a percent (may carry up to 2 decimals, e.g.
      // 0.5); stored as whole basis points — same conversion as
      // PropertySettingsService.update()'s kprAnnualRateBps.
      ...(dto.insurancePct !== undefined && {
        insuranceBps: Math.round(dto.insurancePct * 100),
      }),
      ...(dto.whatsappNumber !== undefined && {
        whatsappNumber: dto.whatsappNumber.trim() || null,
      }),
    });

    const saved = await this.repo.save(settings);
    await this.siteConfigCache.bust();
    return saved;
  }
}
