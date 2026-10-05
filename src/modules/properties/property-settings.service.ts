import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertySettings } from './entities/property-settings.entity';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { PropertySettingsDto } from './dto/property-settings-response.dto';
import { SiteConfigCacheService } from '../site-config/site-config-cache.service';

/** What the website showed before this was configurable. */
export const PROPERTY_SETTINGS_DEFAULTS = {
  kprAnnualRateBps: 175,
  kprTenorYears: 25,
} as const;

/**
 * Reads/writes the property-settings singleton (KPR rate + tenor). Mirrors
 * StorageSettingsService: get() auto-seeds, so nothing downstream can 500
 * for a missing row. Saving busts the public GET /site-config cache.
 */
@Injectable()
export class PropertySettingsService {
  constructor(
    @InjectRepository(PropertySettings)
    private readonly repo: Repository<PropertySettings>,
    private readonly siteConfigCache: SiteConfigCacheService,
  ) {}

  async get(): Promise<PropertySettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      kprAnnualRateBps: PROPERTY_SETTINGS_DEFAULTS.kprAnnualRateBps,
      kprTenorYears: PROPERTY_SETTINGS_DEFAULTS.kprTenorYears,
    });
    return this.repo.save(created);
  }

  async update(dto: UpdatePropertySettingsDto): Promise<PropertySettings> {
    const settings = await this.get();

    Object.assign(settings, {
      ...(dto.kprAnnualRatePct !== undefined && {
        kprAnnualRateBps: Math.round(dto.kprAnnualRatePct * 100),
      }),
      ...(dto.kprTenorYears !== undefined && {
        kprTenorYears: dto.kprTenorYears,
      }),
    });

    const saved = await this.repo.save(settings);
    await this.siteConfigCache.bust();
    return saved;
  }

  toDto(settings: PropertySettings): PropertySettingsDto {
    return {
      // Divide after storing as an integer so 175 becomes 1.75 exactly.
      kprAnnualRatePct: settings.kprAnnualRateBps / 100,
      kprTenorYears: settings.kprTenorYears,
    };
  }
}
