// See property-promo.mapper.spec.ts / article.mapper.spec.ts for why this
// mock is needed: MediaService (imported transitively via SeoMapper) pulls
// in the `uuid` package's ESM build, which this repo's jest config has no
// transform for.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SeoService } from './seo.service';
import { SeoSettings } from './entities/seo-settings.entity';
import { PageSeo } from './entities/page-seo.entity';
import { SeoMapper } from './seo.mapper';
import { SeoCacheService } from './seo-cache.service';
import { SeoPageKey, SEO_PAGE_KEYS } from './enums/seo-page-key.enum';

function makeSettings(overrides: Partial<SeoSettings> = {}): SeoSettings {
  return {
    id: 'settings-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    singleton: true,
    organizationName: 'Mandana Property',
    contactPhone: null,
    contactEmail: null,
    streetAddress: null,
    addressLocality: null,
    addressRegion: null,
    postalCode: null,
    socialLinks: {},
    googleSiteVerification: null,
    bingSiteVerification: null,
    defaultOgMediaAsset: null,
    defaultOgMediaAssetId: null,
    ...overrides,
  };
}

function makePage(overrides: Partial<PageSeo> = {}): PageSeo {
  return {
    id: 'page-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    pageKey: SeoPageKey.PROPERTIES,
    metaTitle: null,
    metaDescription: null,
    heading: null,
    noIndex: false,
    ogMediaAsset: null,
    ogMediaAssetId: null,
    ...overrides,
  };
}

describe('SeoService', () => {
  let service: SeoService;
  // Explicit generics on save/findOneOrFail (not bare `jest.Mock`) so
  // `.mock.calls[0][0]` below is typed as SeoSettings/PageSeo, not `any` —
  // otherwise indexing into it trips @typescript-eslint/no-unsafe-*.
  let settingsRepo: {
    findOne: jest.Mock<Promise<SeoSettings | null>, [unknown?]>;
    create: jest.Mock<SeoSettings, [Partial<SeoSettings>]>;
    save: jest.Mock<Promise<SeoSettings>, [SeoSettings]>;
    findOneOrFail: jest.Mock<Promise<SeoSettings>, [unknown?]>;
  };
  let pageRepo: {
    find: jest.Mock<Promise<PageSeo[]>, [unknown?]>;
    findOne: jest.Mock<Promise<PageSeo | null>, [unknown?]>;
    create: jest.Mock<PageSeo, [Partial<PageSeo>]>;
    save: jest.Mock<Promise<PageSeo>, [PageSeo]>;
    insert: jest.Mock;
    findOneOrFail: jest.Mock<Promise<PageSeo>, [unknown?]>;
  };
  let cache: { get: jest.Mock; set: jest.Mock; bust: jest.Mock };

  beforeEach(async () => {
    settingsRepo = {
      findOne: jest.fn<Promise<SeoSettings | null>, [unknown?]>(),
      create: jest.fn((entity: Partial<SeoSettings>) => makeSettings(entity)),
      save: jest.fn((entity: SeoSettings) => Promise.resolve(entity)),
      findOneOrFail: jest.fn<Promise<SeoSettings>, [unknown?]>(),
    };
    pageRepo = {
      find: jest.fn<Promise<PageSeo[]>, [unknown?]>(),
      findOne: jest.fn<Promise<PageSeo | null>, [unknown?]>(),
      create: jest.fn((entity: Partial<PageSeo>) => makePage(entity)),
      save: jest.fn((entity: PageSeo) => Promise.resolve(entity)),
      insert: jest.fn(),
      findOneOrFail: jest.fn<Promise<PageSeo>, [unknown?]>(),
    };
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      bust: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeoService,
        { provide: getRepositoryToken(SeoSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(PageSeo), useValue: pageRepo },
        {
          provide: SeoMapper,
          useValue: {
            toSettingsPayload: jest.fn((s: SeoSettings) => ({
              organizationName: s.organizationName,
            })),
            toPagePayload: jest.fn((p: PageSeo) => ({ pageKey: p.pageKey })),
          },
        },
        { provide: SeoCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(SeoService);
  });

  describe('getSettings', () => {
    it('returns the existing row when one exists', async () => {
      const existing = makeSettings({ organizationName: 'Custom Co' });
      settingsRepo.findOne.mockResolvedValue(existing);

      const result = await service.getSettings();

      expect(result).toBe(existing);
      expect(settingsRepo.create).not.toHaveBeenCalled();
    });

    it('auto-seeds a singleton row when none exists — a page must never 500 for missing SEO config', async () => {
      settingsRepo.findOne.mockResolvedValue(null);

      const result = await service.getSettings();

      expect(settingsRepo.create).toHaveBeenCalledWith({ singleton: true });
      expect(settingsRepo.save).toHaveBeenCalled();
      expect(result.organizationName).toBe('Mandana Property');
    });
  });

  describe('updateSettings', () => {
    it('busts the cache and re-fetches with the ogImage relation loaded', async () => {
      settingsRepo.findOne.mockResolvedValue(makeSettings());
      const refetched = makeSettings({ organizationName: 'New Name' });
      settingsRepo.findOneOrFail.mockResolvedValue(refetched);

      const result = await service.updateSettings({
        organizationName: 'New Name',
      });

      expect(cache.bust).toHaveBeenCalled();
      expect(settingsRepo.findOneOrFail).toHaveBeenCalledWith(
        expect.objectContaining({ relations: { defaultOgMediaAsset: true } }),
      );
      expect(result).toBe(refetched);
    });

    it('normalizes an explicit empty string to null (the "clear this field" convention)', async () => {
      settingsRepo.findOne.mockResolvedValue(
        makeSettings({ contactPhone: '+6281234567890' }),
      );
      settingsRepo.findOneOrFail.mockImplementation(
        async () => settingsRepo.save.mock.calls[0][0],
      );

      await service.updateSettings({ contactPhone: '' });

      const saved = settingsRepo.save.mock.calls[0][0];
      expect(saved.contactPhone).toBeNull();
    });
  });

  describe('getPages', () => {
    it('auto-seeds every missing page key and returns all 8 in SEO_PAGES order', async () => {
      // First call: nothing exists yet.
      pageRepo.find.mockResolvedValueOnce([]);
      // Second call (after insert): every key now has a row.
      pageRepo.find.mockResolvedValueOnce(
        SEO_PAGE_KEYS.map((pageKey) => makePage({ pageKey })),
      );

      const result = await service.getPages();

      expect(pageRepo.insert).toHaveBeenCalledWith(
        SEO_PAGE_KEYS.map((pageKey) => ({ pageKey, noIndex: false })),
      );
      expect(result.map((p) => p.pageKey)).toEqual(SEO_PAGE_KEYS);
    });

    it('does not re-insert keys that already have a row', async () => {
      pageRepo.find.mockResolvedValue(
        SEO_PAGE_KEYS.map((pageKey) => makePage({ pageKey })),
      );

      await service.getPages();

      expect(pageRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('getPage', () => {
    it('rejects a key outside SEO_PAGE_KEYS — the controller pipe should never let one through, but the service checks defensively too', async () => {
      await expect(
        service.getPage('not-a-real-page' as SeoPageKey),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePage', () => {
    it('rejects noIndex:true for "home" — the one page this API refuses to let anyone hide from Google', async () => {
      pageRepo.findOne.mockResolvedValue(
        makePage({ pageKey: SeoPageKey.HOME }),
      );

      await expect(
        service.updatePage(SeoPageKey.HOME, { noIndex: true }),
      ).rejects.toThrow(BadRequestException);
      expect(pageRepo.save).not.toHaveBeenCalled();
    });

    it('accepts noIndex:true for a hideable page', async () => {
      pageRepo.findOne.mockResolvedValue(
        makePage({ pageKey: SeoPageKey.EVENT }),
      );
      pageRepo.findOneOrFail.mockImplementation(
        async () => pageRepo.save.mock.calls[0][0],
      );

      await service.updatePage(SeoPageKey.EVENT, { noIndex: true });

      const saved = pageRepo.save.mock.calls[0][0];
      expect(saved.noIndex).toBe(true);
      expect(cache.bust).toHaveBeenCalled();
    });

    it('leaves noIndex untouched (does not run the home-guard) when the request omits it', async () => {
      pageRepo.findOne.mockResolvedValue(
        makePage({ pageKey: SeoPageKey.HOME, metaTitle: 'Old' }),
      );
      pageRepo.findOneOrFail.mockImplementation(
        async () => pageRepo.save.mock.calls[0][0],
      );

      await service.updatePage(SeoPageKey.HOME, { metaTitle: 'New title' });

      const saved = pageRepo.save.mock.calls[0][0];
      expect(saved.metaTitle).toBe('New title');
    });
  });

  describe('getPublicPayload', () => {
    it('returns the cached payload without touching the repositories when present', async () => {
      const cached = { settings: { organizationName: 'Cached' }, pages: [] };
      cache.get.mockResolvedValue(cached);

      const result = await service.getPublicPayload();

      expect(result).toBe(cached);
      expect(settingsRepo.findOne).not.toHaveBeenCalled();
      expect(pageRepo.find).not.toHaveBeenCalled();
    });

    it('builds, caches, and returns the payload on a cache miss', async () => {
      settingsRepo.findOne.mockResolvedValue(makeSettings());
      pageRepo.find.mockResolvedValue(
        SEO_PAGE_KEYS.map((pageKey) => makePage({ pageKey })),
      );

      const result = await service.getPublicPayload();

      expect(cache.set).toHaveBeenCalledWith(result);
      expect(result.pages).toHaveLength(SEO_PAGE_KEYS.length);
    });
  });
});
