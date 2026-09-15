import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { LegalPage } from './entities/legal-page.entity';
import { LegalCacheService } from './legal-cache.service';
import { LegalMapper } from './legal.mapper';
import { LegalPageKey, LEGAL_PAGE_KEYS } from './enums/legal-page-key.enum';

function makePage(overrides: Partial<LegalPage> = {}): LegalPage {
  return {
    id: 'page-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    pageKey: LegalPageKey.PRIVACY,
    title: 'Kebijakan Privasi',
    bodyHtml: '<p>Isi</p>',
    bodyText: 'Isi',
    ...overrides,
  };
}

describe('LegalService', () => {
  let service: LegalService;
  let repo: {
    find: jest.Mock<Promise<LegalPage[]>, [unknown?]>;
    findOne: jest.Mock<Promise<LegalPage | null>, [unknown?]>;
    create: jest.Mock<LegalPage, [Partial<LegalPage>]>;
    save: jest.Mock<Promise<LegalPage>, [LegalPage]>;
    insert: jest.Mock;
  };
  let cache: { get: jest.Mock; set: jest.Mock; bust: jest.Mock };

  beforeEach(async () => {
    repo = {
      find: jest.fn<Promise<LegalPage[]>, [unknown?]>(),
      findOne: jest.fn<Promise<LegalPage | null>, [unknown?]>(),
      create: jest.fn((entity: Partial<LegalPage>) => makePage(entity)),
      save: jest.fn((entity: LegalPage) => Promise.resolve(entity)),
      insert: jest.fn(),
    };
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      bust: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalService,
        LegalMapper,
        { provide: getRepositoryToken(LegalPage), useValue: repo },
        { provide: LegalCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get(LegalService);
  });

  describe('getPages', () => {
    it('auto-seeds every missing page key and returns both in LEGAL_PAGE_KEYS order', async () => {
      repo.find.mockResolvedValueOnce([]);
      repo.find.mockResolvedValueOnce(LEGAL_PAGE_KEYS.map((pageKey) => makePage({ pageKey })));

      const result = await service.getPages();

      expect(repo.insert).toHaveBeenCalledWith(
        LEGAL_PAGE_KEYS.map((pageKey) => ({ pageKey, title: '', bodyHtml: '', bodyText: '' })),
      );
      expect(result.map((p) => p.pageKey)).toEqual(LEGAL_PAGE_KEYS);
    });

    it('does not re-insert keys that already have a row', async () => {
      repo.find.mockResolvedValue(LEGAL_PAGE_KEYS.map((pageKey) => makePage({ pageKey })));

      await service.getPages();

      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('getPage', () => {
    it('rejects a key outside LEGAL_PAGE_KEYS', async () => {
      await expect(service.getPage('not-a-real-page' as LegalPageKey)).rejects.toThrow(NotFoundException);
    });

    it('returns the existing row when one exists', async () => {
      const existing = makePage({ pageKey: LegalPageKey.TERMS });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.getPage(LegalPageKey.TERMS);

      expect(result).toBe(existing);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('auto-seeds a placeholder row when none exists — a page must never 500 for missing legal config', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.getPage(LegalPageKey.PRIVACY);

      expect(repo.create).toHaveBeenCalledWith({
        pageKey: LegalPageKey.PRIVACY,
        title: '',
        bodyHtml: '',
        bodyText: '',
      });
      expect(result.pageKey).toBe(LegalPageKey.PRIVACY);
    });
  });

  describe('updatePage', () => {
    it('recomputes bodyText from bodyHtml and busts the cache', async () => {
      repo.findOne.mockResolvedValue(makePage({ pageKey: LegalPageKey.PRIVACY }));

      const result = await service.updatePage(LegalPageKey.PRIVACY, {
        bodyHtml: '<p>Konten <strong>baru</strong></p>',
      });

      expect(result.bodyText).toBe('Konten baru');
      expect(cache.bust).toHaveBeenCalledWith(LegalPageKey.PRIVACY);
    });

    it('leaves bodyHtml/bodyText untouched when the request only sends a title', async () => {
      repo.findOne.mockResolvedValue(
        makePage({ pageKey: LegalPageKey.TERMS, bodyHtml: '<p>Lama</p>', bodyText: 'Lama' }),
      );

      const result = await service.updatePage(LegalPageKey.TERMS, { title: 'Judul Baru' });

      expect(result.title).toBe('Judul Baru');
      expect(result.bodyHtml).toBe('<p>Lama</p>');
      expect(result.bodyText).toBe('Lama');
    });
  });

  describe('getPublicPage', () => {
    it('returns the cached value without touching the repository', async () => {
      // The cached shape is the MAPPED payload (updatedAt already a
      // string), not the raw entity — see this method's own doc comment
      // on why: a cache hit round-trips through Redis' JSON store, which
      // would otherwise turn a real Date into a plain string invisibly.
      const cached = { pageKey: LegalPageKey.PRIVACY, title: 'x', bodyHtml: '', bodyText: '', updatedAt: '2026-01-01T00:00:00.000Z' };
      cache.get.mockResolvedValue(cached);

      const result = await service.getPublicPage(LegalPageKey.PRIVACY);

      expect(result).toBe(cached);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('fetches, maps, and caches the mapped payload on a miss', async () => {
      cache.get.mockResolvedValue(undefined);
      const fresh = makePage({ pageKey: LegalPageKey.TERMS, title: 'Terms' });
      repo.findOne.mockResolvedValue(fresh);

      const result = await service.getPublicPage(LegalPageKey.TERMS);

      expect(result).toEqual({
        pageKey: LegalPageKey.TERMS,
        title: 'Terms',
        bodyHtml: fresh.bodyHtml,
        bodyText: fresh.bodyText,
        updatedAt: fresh.updatedAt.toISOString(),
      });
      expect(cache.set).toHaveBeenCalledWith(LegalPageKey.TERMS, result);
    });
  });
});
