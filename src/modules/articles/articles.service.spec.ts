// ArticlesService pulls in ArticleMapper -> MediaService, which imports the
// `uuid` package's ESM build — this repo's jest config has no transform for
// it. See property-promo.mapper.spec.ts for the original precedent.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { ArticleMapper } from './article.mapper';
import { Article } from './entities/article.entity';
import { ArticleCategory } from './entities/article-category.entity';
import { ArticleStatus } from './enums/article-status.enum';
import { User } from '../users/entities/user.entity';

/** Chainable stand-in for the SelectQueryBuilder used by findAll/findRelated/
 * adminFindAll/findPublicCategories — modeled on ContentBlocksService's own
 * spec's makeQb(). */
interface QbMock {
  leftJoinAndSelect: jest.Mock;
  innerJoin: jest.Mock;
  distinct: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  addSelect: jest.Mock;
  setParameters: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
}

function makeQb(): QbMock {
  const qb = {} as QbMock;
  const ret = () => qb;
  qb.leftJoinAndSelect = jest.fn(ret);
  qb.innerJoin = jest.fn(ret);
  qb.distinct = jest.fn(ret);
  qb.where = jest.fn(ret);
  qb.andWhere = jest.fn(ret);
  qb.addSelect = jest.fn(ret);
  qb.setParameters = jest.fn(ret);
  qb.orderBy = jest.fn(ret);
  qb.addOrderBy = jest.fn(ret);
  qb.skip = jest.fn(ret);
  qb.take = jest.fn(ret);
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    slug: 'slug-1',
    title: 'Judul',
    excerpt: 'Ringkasan',
    bodyHtml: '<p>Isi</p>',
    bodyText: 'Isi',
    status: ArticleStatus.DRAFT,
    readingMinutes: 1,
    publishedAt: null,
    editedAt: null,
    metaTitle: null,
    metaDescription: null,
    category: { id: 'cat-1', slug: 'cat', name: 'Cat' } as ArticleCategory,
    categoryId: 'cat-1',
    author: null,
    authorId: null,
    coverMediaAsset: null,
    coverMediaAssetId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const currentUser = { id: 'user-1' } as User;

/** Reads the `articlesRepo.create()` argument from a given call, cast once
 * here rather than at every call site — `jest.Mock` (untyped) makes
 * `.mock.calls` an `any[][]`, same reasoning as
 * moving-bookings.service.spec.ts's own savedBookingArgs() helper. */
function createArgs(mock: jest.Mock, callIndex = 0): Partial<Article> {
  const calls = mock.mock.calls as Partial<Article>[][];
  return calls[callIndex][0];
}

describe('ArticlesService', () => {
  let service: ArticlesService;
  let articlesRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let categoriesRepo: { createQueryBuilder: jest.Mock; exists: jest.Mock };
  let articlesQb: QbMock;
  let categoriesQb: QbMock;
  let mapper: {
    toCard: jest.Mock;
    toDetail: jest.Mock;
    toAdminCard: jest.Mock;
    toAdminDetail: jest.Mock;
  };

  beforeEach(async () => {
    articlesQb = makeQb();
    categoriesQb = makeQb();

    articlesRepo = {
      createQueryBuilder: jest.fn(() => articlesQb),
      // Default: a slug-keyed lookup (resolveUniqueSlug) always finds
      // nothing (slug is free); any other (id-keyed) lookup returns a
      // generic stand-in article, so create()'s post-save re-fetch via
      // adminFindOne() doesn't 404 in tests that don't care about its
      // shape. Individual tests override with mockResolvedValueOnce/
      // mockImplementation for the cases that do care.
      findOne: jest.fn((opts: { where?: Record<string, unknown> }) => {
        if (opts?.where && 'slug' in opts.where) return Promise.resolve(null);
        return Promise.resolve(makeArticle());
      }),
      create: jest.fn((entity: Partial<Article>) => entity),
      save: jest.fn((entity: Article) => Promise.resolve(entity)),
      remove: jest.fn(),
    };
    categoriesRepo = {
      createQueryBuilder: jest.fn(() => categoriesQb),
      exists: jest.fn().mockResolvedValue(true),
    };

    mapper = {
      toCard: jest.fn((a: Article) => ({ id: a.id })),
      toDetail: jest.fn((a: Article) => ({ id: a.id })),
      toAdminCard: jest.fn((a: Article) => ({ id: a.id, status: a.status })),
      toAdminDetail: jest.fn((a: Article) => ({ id: a.id, status: a.status })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: articlesRepo },
        {
          provide: getRepositoryToken(ArticleCategory),
          useValue: categoriesRepo,
        },
        { provide: ArticleMapper, useValue: mapper },
      ],
    }).compile();

    service = module.get(ArticlesService);
  });

  describe('findBySlug', () => {
    it('404s on a draft slug — not found, not forbidden, same as a nonexistent one', async () => {
      // status: In(PUBLIC_ARTICLE_STATUSES) in the where clause means a
      // draft row simply never matches; TypeORM returns null exactly as it
      // would for a slug that doesn't exist at all.
      articlesRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findBySlug('a-draft-slug')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the mapped detail for a published slug', async () => {
      const article = makeArticle({ status: ArticleStatus.PUBLISHED });
      articlesRepo.findOne.mockResolvedValueOnce(article);
      const result = await service.findBySlug('slug-1');
      expect(mapper.toDetail).toHaveBeenCalledWith(article);
      expect(result).toEqual({ id: 'article-1' });
    });
  });

  describe('findRelated', () => {
    it('returns [] for an unknown/unpublished slug instead of throwing', async () => {
      articlesRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.findRelated('missing-slug');
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('rejects an unknown categoryId with BadRequestException', async () => {
      categoriesRepo.exists.mockResolvedValueOnce(false);
      await expect(
        service.create(
          {
            title: 'T',
            excerpt: 'E',
            bodyHtml: '<p>x</p>',
            categoryId: 'missing-cat',
          },
          currentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('leaves publishedAt null when status defaults to DRAFT', async () => {
      await service.create(
        {
          title: 'T',
          excerpt: 'E',
          bodyHtml: '<p>x</p>',
          categoryId: 'cat-1',
        },
        currentUser,
      );
      expect(createArgs(articlesRepo.create).publishedAt).toBeNull();
    });

    it('stamps publishedAt when created directly as PUBLISHED', async () => {
      await service.create(
        {
          title: 'T',
          excerpt: 'E',
          bodyHtml: '<p>x</p>',
          categoryId: 'cat-1',
          status: ArticleStatus.PUBLISHED,
        },
        currentUser,
      );
      expect(createArgs(articlesRepo.create).publishedAt).toBeInstanceOf(Date);
    });

    it('recomputes bodyText/readingMinutes from bodyHtml', async () => {
      const words = Array(300).fill('kata').join(' ');
      await service.create(
        {
          title: 'T',
          excerpt: 'E',
          bodyHtml: `<p>${words}</p>`,
          categoryId: 'cat-1',
        },
        currentUser,
      );
      const created = createArgs(articlesRepo.create);
      expect(created.bodyText).toBe(words);
      expect(created.readingMinutes).toBe(2);
    });

    it('defaults authorId to the creating admin when omitted', async () => {
      await service.create(
        {
          title: 'T',
          excerpt: 'E',
          bodyHtml: '<p>x</p>',
          categoryId: 'cat-1',
        },
        currentUser,
      );
      expect(createArgs(articlesRepo.create).authorId).toBe('user-1');
    });
  });

  describe('update', () => {
    function setCurrent(article: Article) {
      articlesRepo.findOne.mockImplementation(
        (opts: { where?: { slug?: string; id?: string } }) => {
          if (opts?.where?.slug !== undefined) return Promise.resolve(null); // slug always free
          if (opts?.where?.id !== undefined) return Promise.resolve(article);
          return Promise.resolve(null);
        },
      );
    }

    it('throws ConflictException when changing the slug of a published article', async () => {
      const article = makeArticle({
        status: ArticleStatus.PUBLISHED,
        slug: 'old-slug',
      });
      setCurrent(article);
      await expect(
        service.update(article.id, { slug: 'new-slug' }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a slug change while still DRAFT', async () => {
      const article = makeArticle({
        status: ArticleStatus.DRAFT,
        slug: 'old-slug',
      });
      setCurrent(article);
      await service.update(article.id, { slug: 'new-slug' });
      expect(article.slug).toBe('new-slug');
    });

    it('recomputes bodyText/readingMinutes when bodyHtml changes', async () => {
      const article = makeArticle();
      setCurrent(article);
      const words = Array(400).fill('kata').join(' ');
      await service.update(article.id, { bodyHtml: `<p>${words}</p>` });
      expect(article.bodyText).toBe(words);
      expect(article.readingMinutes).toBe(2);
    });

    it('stamps publishedAt once on the DRAFT -> PUBLISHED transition and keeps it stable across archive/republish', async () => {
      const article = makeArticle({
        status: ArticleStatus.DRAFT,
        publishedAt: null,
      });
      setCurrent(article);

      await service.update(article.id, { status: ArticleStatus.PUBLISHED });
      const firstPublishedAt = article.publishedAt;
      expect(firstPublishedAt).toBeInstanceOf(Date);

      await service.update(article.id, { status: ArticleStatus.ARCHIVED });
      expect(article.publishedAt).toBe(firstPublishedAt);

      await service.update(article.id, { status: ArticleStatus.PUBLISHED });
      expect(article.publishedAt).toBe(firstPublishedAt);
    });

    it('does not stamp editedAt on a bare status transition', async () => {
      const article = makeArticle({
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date('2026-08-01T00:00:00Z'),
        editedAt: null,
      });
      setCurrent(article);
      await service.update(article.id, { status: ArticleStatus.ARCHIVED });
      expect(article.editedAt).toBeNull();
    });

    it('stamps editedAt when a published article receives a content edit', async () => {
      const article = makeArticle({
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date('2026-08-01T00:00:00Z'),
        editedAt: null,
      });
      setCurrent(article);
      await service.update(article.id, { title: 'Updated title' });
      expect(article.editedAt).toBeInstanceOf(Date);
    });

    it('does not stamp editedAt for a draft that is edited (never published yet)', async () => {
      const article = makeArticle({
        status: ArticleStatus.DRAFT,
        editedAt: null,
      });
      setCurrent(article);
      await service.update(article.id, { title: 'Updated title' });
      expect(article.editedAt).toBeNull();
    });

    it('rejects an unknown categoryId on update', async () => {
      const article = makeArticle();
      setCurrent(article);
      categoriesRepo.exists.mockResolvedValueOnce(false);
      await expect(
        service.update(article.id, { categoryId: 'missing-cat' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('404s when the article does not exist', async () => {
      articlesRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.remove('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
