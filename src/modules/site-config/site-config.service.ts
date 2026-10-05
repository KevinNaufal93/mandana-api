import { Injectable } from '@nestjs/common';
import { MovingSettingsService } from '../moving/moving-settings.service';
import { StorageSettingsService } from '../storage/storage-settings.service';
import { EventSupportSettingsService } from '../event-support/event-support-settings.service';
import { PropertySettingsService } from '../properties/property-settings.service';
import { SeoService } from '../seo/seo.service';
import { SiteConfigCacheService } from './site-config-cache.service';
import { SiteConfigDto } from './dto/site-config-response.dto';

/**
 * The one public read (GET /site-config) the website uses for
 * admin-editable values that are not SEO: the WhatsApp number per line of
 * business and the KPR simulator rate/tenor. Assembled from the five
 * settings singletons (each auto-seeds on read, so this never 404s) and
 * Redis-cached; every one of those five services busts the cache on save.
 *
 * Numbers are returned exactly as an admin typed them (trimmed, empty stored
 * as null). The website decides the fallback order and normalizes them for
 * wa.me; the API has no opinion on which number a page should use.
 */
@Injectable()
export class SiteConfigService {
  constructor(
    private readonly moving: MovingSettingsService,
    private readonly storage: StorageSettingsService,
    private readonly eventSupport: EventSupportSettingsService,
    private readonly property: PropertySettingsService,
    private readonly seo: SeoService,
    private readonly cache: SiteConfigCacheService,
  ) {}

  async getPublicPayload(): Promise<SiteConfigDto> {
    const cached = await this.cache.get<SiteConfigDto>();
    if (cached) return cached;

    const [moving, storage, eventSupport, property, seo] = await Promise.all([
      this.moving.get(),
      this.storage.get(),
      this.eventSupport.get(),
      this.property.get(),
      this.seo.getSettings(),
    ]);

    const payload: SiteConfigDto = {
      whatsapp: {
        general: seo.whatsappNumber,
        moving: moving.whatsappNumber,
        storage: storage.whatsappNumber,
        event: eventSupport.whatsappNumber,
      },
      kpr: {
        annualRatePct: property.kprAnnualRateBps / 100,
        tenorYears: property.kprTenorYears,
      },
    };

    await this.cache.set(payload);
    return payload;
  }
}
