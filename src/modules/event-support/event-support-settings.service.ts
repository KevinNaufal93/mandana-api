import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventSupportSettings } from './entities/event-support-settings.entity';
import { UpdateEventSupportSettingsDto } from './dto/update-event-support-settings.dto';
import { SiteConfigCacheService } from '../site-config/site-config-cache.service';

/**
 * Reads/writes the Event Support settings singleton. Once also served the
 * flexible-hourly-pricing policy to event-pricing.ts's computeLine() — that
 * policy is gone (8-hour-block pricing has no tunable knobs), so this now
 * only holds the delivery-area disclosure. See
 * event-support-settings.entity.ts and
 * migration 1788600000000-ReplaceEventHourlyWithEightHourPricing.
 */
@Injectable()
export class EventSupportSettingsService {
  constructor(
    @InjectRepository(EventSupportSettings)
    private readonly repo: Repository<EventSupportSettings>,
    private readonly siteConfigCache: SiteConfigCacheService,
  ) {}

  /** Loads the singleton row, seeding it on first read if the migration's
   * seed somehow didn't run (e.g. a DB restored before this migration) —
   * a quote must never 500 for missing settings. */
  async get(): Promise<EventSupportSettings> {
    const existing = await this.repo.findOne({ where: { singleton: true } });
    if (existing) return existing;

    const created = this.repo.create({
      singleton: true,
      priceIncludesJabodetabekDelivery: true,
      outsideJabodetabekNote: null,
      whatsappNumber: null,
    });
    return this.repo.save(created);
  }

  async update(
    dto: UpdateEventSupportSettingsDto,
  ): Promise<EventSupportSettings> {
    const settings = await this.get();

    Object.assign(settings, {
      ...(dto.priceIncludesJabodetabekDelivery !== undefined && {
        priceIncludesJabodetabekDelivery: dto.priceIncludesJabodetabekDelivery,
      }),
      ...(dto.outsideJabodetabekNote !== undefined && {
        outsideJabodetabekNote: dto.outsideJabodetabekNote ?? null,
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
