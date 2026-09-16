// See seo.service.spec.ts for why this mock is needed: MediaService
// (imported transitively via PageImagesMapper) pulls in the `uuid`
// package's ESM build, which this repo's jest config has no transform for.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PageImagesService } from './page-images.service';
import { PageImage } from './entities/page-image.entity';
import { PageImagesCacheService } from './page-images-cache.service';
import { PageImagesMapper } from './page-images.mapper';
import { MediaService } from '../media/media.service';
import { PageImageSlot, PAGE_IMAGE_SLOT_KEYS } from './enums/page-image-slot.enum';

function makeSlot(overrides: Partial<PageImage> = {}): PageImage {
  return {
    id: 'slot-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    slotKey: PageImageSlot.ABOUT_HERO,
    mediaAsset: null,
    mediaAssetId: null,
    ...overrides,
  };
}

describe('PageImagesService', () => {
  let service: PageImagesService;
  let repo: {
    find: jest.Mock<Promise<PageImage[]>, [unknown?]>;
    findOne: jest.Mock<Promise<PageImage | null>, [unknown?]>;
    findOneOrFail: jest.Mock<Promise<PageImage>, [unknown?]>;
    create: jest.Mock<PageImage, [Partial<PageImage>]>;
    save: jest.Mock<Promise<PageImage>, [PageImage]>;
    insert: jest.Mock;
    update: jest.Mock;
  };
  let cache: { get: jest.Mock; set: jest.Mock; bust: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn<Promise<PageImage[]>, [unknown?]>(),
      findOne: jest.fn<Promise<PageImage | null>, [unknown?]>(),
      findOneOrFail: jest.fn<Promise<PageImage>, [unknown?]>(),
      create: jest.fn((entity: Partial<PageImage>) => makeSlot(entity)),
      save: jest.fn((entity: PageImage) => Promise.resolve(entity)),
      insert: jest.fn(),
      update: jest.fn(),
    };
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      bust: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageImagesService,
        PageImagesMapper,
        { provide: getRepositoryToken(PageImage), useValue: repo },
        { provide: PageImagesCacheService, useValue: cache },
        { provide: MediaService, useValue: { buildImageDto: jest.fn() } },
      ],
    }).compile();

    service = module.get(PageImagesService);
  });

  describe('getSlots', () => {
    it('auto-seeds every missing slot key and returns all 3 in PAGE_IMAGE_SLOT_KEYS order', async () => {
      repo.find.mockResolvedValueOnce([]);
      repo.find.mockResolvedValueOnce(PAGE_IMAGE_SLOT_KEYS.map((slotKey) => makeSlot({ slotKey })));

      const result = await service.getSlots();

      expect(repo.insert).toHaveBeenCalledWith(PAGE_IMAGE_SLOT_KEYS.map((slotKey) => ({ slotKey })));
      expect(result.map((s) => s.slotKey)).toEqual(PAGE_IMAGE_SLOT_KEYS);
    });

    it('does not re-insert keys that already have a row', async () => {
      repo.find.mockResolvedValue(PAGE_IMAGE_SLOT_KEYS.map((slotKey) => makeSlot({ slotKey })));

      await service.getSlots();

      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('getSlot', () => {
    it('rejects a key outside PAGE_IMAGE_SLOT_KEYS', async () => {
      await expect(service.getSlot('not-a-real-slot' as PageImageSlot)).rejects.toThrow(NotFoundException);
    });

    it('returns the existing row when one exists', async () => {
      const existing = makeSlot({ slotKey: PageImageSlot.ABOUT_STORY });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getSlot(PageImageSlot.ABOUT_STORY);

      expect(result).toBe(existing);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('auto-seeds a null-image row when none exists — a page must never 500 for a missing slot', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.getSlot(PageImageSlot.ABOUT_HELP_CTA);

      expect(repo.create).toHaveBeenCalledWith({ slotKey: PageImageSlot.ABOUT_HELP_CTA });
      expect(result.slotKey).toBe(PageImageSlot.ABOUT_HELP_CTA);
      expect(result.mediaAssetId).toBeNull();
    });
  });

  describe('updateSlot', () => {
    // repo.update(), not repo.save() — see the service method's own doc
    // comment: saving a loaded entity that still carries the (stale)
    // `mediaAsset` relation alongside a directly-assigned `mediaAssetId`
    // lets TypeORM re-derive the FK from the relation on write, silently
    // discarding an explicit `null` clear. This was caught only by a live
    // run against a real database — every one of these mocked-repository
    // tests passed against the old, buggy save()-based implementation too.

    it('rejects a key outside PAGE_IMAGE_SLOT_KEYS', async () => {
      await expect(
        service.updateSlot('not-a-real-slot' as PageImageSlot, { mediaAssetId: 'asset-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('sets mediaAssetId via a raw column update and busts the cache', async () => {
      repo.findOne.mockResolvedValue(makeSlot({ slotKey: PageImageSlot.ABOUT_HERO }));
      repo.findOneOrFail.mockResolvedValue(makeSlot({ slotKey: PageImageSlot.ABOUT_HERO, mediaAssetId: 'asset-1' }));

      const result = await service.updateSlot(PageImageSlot.ABOUT_HERO, { mediaAssetId: 'asset-1' });

      expect(repo.update).toHaveBeenCalledWith({ slotKey: PageImageSlot.ABOUT_HERO }, { mediaAssetId: 'asset-1' });
      expect(result.mediaAssetId).toBe('asset-1');
      expect(cache.bust).toHaveBeenCalled();
    });

    it('clears mediaAssetId back to null when the body explicitly sends null', async () => {
      repo.findOne.mockResolvedValue(makeSlot({ slotKey: PageImageSlot.ABOUT_HERO, mediaAssetId: 'asset-1' }));
      repo.findOneOrFail.mockResolvedValue(makeSlot({ slotKey: PageImageSlot.ABOUT_HERO, mediaAssetId: null }));

      await service.updateSlot(PageImageSlot.ABOUT_HERO, { mediaAssetId: null });

      expect(repo.update).toHaveBeenCalledWith({ slotKey: PageImageSlot.ABOUT_HERO }, { mediaAssetId: null });
    });

    it('leaves mediaAssetId untouched when the body omits the field entirely', async () => {
      const existing = makeSlot({ slotKey: PageImageSlot.ABOUT_HERO, mediaAssetId: 'asset-1' });
      repo.findOne.mockResolvedValue(existing);
      repo.findOneOrFail.mockResolvedValue(existing);

      const result = await service.updateSlot(PageImageSlot.ABOUT_HERO, {});

      expect(repo.update).not.toHaveBeenCalled();
      expect(result.mediaAssetId).toBe('asset-1');
    });
  });

  describe('getPublicPayload', () => {
    it('returns the cached value without touching the repository', async () => {
      // The cached shape is the MAPPED payload, not raw entities — same
      // Redis/Date reasoning as LegalService.getPublicPage().
      const cached = [{ slotKey: PageImageSlot.ABOUT_HERO, image: null }];
      cache.get.mockResolvedValue(cached);

      const result = await service.getPublicPayload();

      expect(result).toBe(cached);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('fetches, maps, and caches the mapped payload on a miss', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.find.mockResolvedValue(PAGE_IMAGE_SLOT_KEYS.map((slotKey) => makeSlot({ slotKey })));

      const result = await service.getPublicPayload();

      expect(result).toEqual(PAGE_IMAGE_SLOT_KEYS.map((slotKey) => ({ slotKey, image: null })));
      expect(cache.set).toHaveBeenCalledWith(result);
    });
  });
});
