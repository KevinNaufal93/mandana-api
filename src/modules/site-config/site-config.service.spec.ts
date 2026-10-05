// MediaService (pulled in transitively through SeoService -> SeoMapper) imports
// the uuid package's ESM build, which this repo's jest config has no
// transform for. Same workaround as seo.service.spec.ts.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { SiteConfigService } from './site-config.service';
import { SiteConfigCacheService } from './site-config-cache.service';
import { MovingSettingsService } from '../moving/moving-settings.service';
import { StorageSettingsService } from '../storage/storage-settings.service';
import { EventSupportSettingsService } from '../event-support/event-support-settings.service';
import { PropertySettingsService } from '../properties/property-settings.service';
import { SeoService } from '../seo/seo.service';
import { SiteConfigDto } from './dto/site-config-response.dto';

describe('SiteConfigService', () => {
  let service: SiteConfigService;
  let moving: { get: jest.Mock };
  let storage: { get: jest.Mock };
  let eventSupport: { get: jest.Mock };
  let property: { get: jest.Mock };
  let seo: { getSettings: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    moving = { get: jest.fn().mockResolvedValue({ whatsappNumber: null }) };
    storage = { get: jest.fn().mockResolvedValue({ whatsappNumber: null }) };
    eventSupport = {
      get: jest.fn().mockResolvedValue({ whatsappNumber: null }),
    };
    property = {
      get: jest
        .fn()
        .mockResolvedValue({ kprAnnualRateBps: 175, kprTenorYears: 25 }),
    };
    seo = {
      getSettings: jest.fn().mockResolvedValue({ whatsappNumber: null }),
    };
    cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteConfigService,
        { provide: MovingSettingsService, useValue: moving },
        { provide: StorageSettingsService, useValue: storage },
        { provide: EventSupportSettingsService, useValue: eventSupport },
        { provide: PropertySettingsService, useValue: property },
        { provide: SeoService, useValue: seo },
        { provide: SiteConfigCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(SiteConfigService);
  });

  it('maps each singleton to its line of business, and converts bps to a percent', async () => {
    moving.get.mockResolvedValue({ whatsappNumber: '+62811' });
    storage.get.mockResolvedValue({ whatsappNumber: '+62822' });
    eventSupport.get.mockResolvedValue({ whatsappNumber: '+62833' });
    seo.getSettings.mockResolvedValue({ whatsappNumber: '+62844' });
    property.get.mockResolvedValue({
      kprAnnualRateBps: 325,
      kprTenorYears: 20,
    });

    const payload = await service.getPublicPayload();

    expect(payload).toEqual({
      whatsapp: {
        general: '+62844',
        moving: '+62811',
        storage: '+62822',
        event: '+62833',
      },
      kpr: { annualRatePct: 3.25, tenorYears: 20 },
    });
  });

  it('returns nulls (not a failure) when no number has been set yet', async () => {
    const payload = await service.getPublicPayload();

    expect(payload.whatsapp).toEqual({
      general: null,
      moving: null,
      storage: null,
      event: null,
    });
    expect(payload.kpr).toEqual({ annualRatePct: 1.75, tenorYears: 25 });
  });

  it('caches the mapped payload on a miss, and serves a hit without touching the database', async () => {
    const payload = await service.getPublicPayload();
    expect(cache.set).toHaveBeenCalledWith(payload);

    const cached: SiteConfigDto = {
      whatsapp: { general: '+62855', moving: null, storage: null, event: null },
      kpr: { annualRatePct: 2, tenorYears: 10 },
    };
    cache.get.mockResolvedValue(cached);
    moving.get.mockClear();

    const result = await service.getPublicPayload();

    expect(result).toBe(cached);
    expect(moving.get).not.toHaveBeenCalled();
  });
});
