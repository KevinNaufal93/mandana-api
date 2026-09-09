// See property-promo.mapper.spec.ts for why this mock is needed: MediaService
// (imported transitively via ArticleMapper) pulls in the `uuid` package's ESM
// build, which this repo's jest config has no transform for.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ArticleMapper } from './article.mapper';
import { Article } from './entities/article.entity';
import { ArticleCategory } from './entities/article-category.entity';
import { ArticleStatus } from './enums/article-status.enum';
import { User } from '../users/entities/user.entity';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { MediaService, MediaImageDto } from '../media/media.service';

/** Directly instantiated (no Test.createTestingModule) — mirrors
 * PropertyPromoMapper's own spec, for the same reason: the
 * buildImageDto-throws degrade branch needs a plain function call. */
function makeMapper(mediaService: Partial<MediaService> = {}) {
  return new ArticleMapper(mediaService as MediaService);
}

const category: ArticleCategory = {
  id: 'cat-1',
  name: 'Panduan Beli',
  slug: 'panduan-beli',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  articles: [],
};

const author: User = {
  id: 'user-1',
  email: 'editor@mandana.test',
  name: 'Jane Doe',
  passwordHash: 'x',
  role: 'editor' as User['role'],
  isActive: true,
  hashedRefreshToken: null,
  title: 'Content Editor',
  phone: null,
  whatsapp: null,
  photoMediaAsset: null,
  photoMediaAssetId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    slug: 'panduan-membeli-rumah-pertama',
    title: 'Panduan Membeli Rumah Pertama',
    excerpt: 'Semua yang perlu Anda tahu sebelum membeli rumah pertama.',
    bodyHtml: '<p>Isi artikel...</p>',
    bodyText: 'Isi artikel...',
    status: ArticleStatus.PUBLISHED,
    readingMinutes: 4,
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    editedAt: null,
    metaTitle: null,
    metaDescription: null,
    category,
    categoryId: category.id,
    author,
    authorId: author.id,
    coverMediaAsset: null,
    coverMediaAssetId: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

const fakeImage: MediaImageDto = {
  url: 'https://cdn.example/img.webp',
  srcset: '',
  srcsetAvif: '',
  placeholder: null,
  alt: null,
  width: 1280,
  height: 720,
};

describe('ArticleMapper', () => {
  describe('toCard / toDetail', () => {
    it('maps a null cover to coverImage: null', () => {
      const mapper = makeMapper();
      const card = mapper.toCard(makeArticle({ coverMediaAsset: null }));
      expect(card.coverImage).toBeNull();
    });

    it('builds coverImage via MediaService when a cover asset is attached', () => {
      const buildImageDto = jest.fn().mockReturnValue(fakeImage);
      const mapper = makeMapper({ buildImageDto });
      const asset = { id: 'asset-1' } as MediaAsset;
      const card = mapper.toCard(makeArticle({ coverMediaAsset: asset }));
      expect(buildImageDto).toHaveBeenCalledWith(asset);
      expect(card.coverImage).toEqual(fakeImage);
    });

    it('degrades coverImage to null (without throwing) when buildImageDto throws', () => {
      const buildImageDto = jest.fn(() => {
        throw new Error('no usable variants');
      });
      const mapper = makeMapper({ buildImageDto });
      const asset = { id: 'asset-1' } as MediaAsset;

      let card!: ReturnType<ArticleMapper['toCard']>;
      expect(() => {
        card = mapper.toCard(makeArticle({ coverMediaAsset: asset }));
      }).not.toThrow();
      expect(card.coverImage).toBeNull();
    });

    it('degrades a null author avatar to null without throwing', () => {
      const mapper = makeMapper();
      const card = mapper.toCard(
        makeArticle({ author: { ...author, photoMediaAsset: null } }),
      );
      expect(card.author.avatar).toBeNull();
    });

    it('degrades author avatar to null when buildImageDto throws', () => {
      const buildImageDto = jest.fn(() => {
        throw new Error('no usable variants');
      });
      const mapper = makeMapper({ buildImageDto });
      const photoAsset = { id: 'avatar-1' } as MediaAsset;

      let card!: ReturnType<ArticleMapper['toCard']>;
      expect(() => {
        card = mapper.toCard(
          makeArticle({
            author: { ...author, photoMediaAsset: photoAsset },
          }),
        );
      }).not.toThrow();
      expect(card.author.avatar).toBeNull();
    });

    it('falls back to a placeholder author when the author has been deleted', () => {
      const mapper = makeMapper();
      const card = mapper.toCard(makeArticle({ author: null, authorId: null }));
      expect(card.author.name).toBe('Tim Editorial');
      expect(card.author.avatar).toBeNull();
    });

    it('maps author.role from User.title', () => {
      const mapper = makeMapper();
      const card = mapper.toCard(makeArticle());
      expect(card.author.role).toBe('Content Editor');
    });

    it('falls back publishedAt to createdAt when publishedAt is null', () => {
      const mapper = makeMapper();
      const card = mapper.toCard(
        makeArticle({
          publishedAt: null,
          createdAt: new Date('2026-05-01T00:00:00Z'),
        }),
      );
      expect(card.publishedAt).toBe('2026-05-01T00:00:00.000Z');
    });

    it('toDetail: updatedAt is null before any post-publish edit', () => {
      const mapper = makeMapper();
      const detail = mapper.toDetail(makeArticle({ editedAt: null }));
      expect(detail.updatedAt).toBeNull();
    });

    it('toDetail: updatedAt reflects editedAt once set', () => {
      const mapper = makeMapper();
      const detail = mapper.toDetail(
        makeArticle({ editedAt: new Date('2026-09-05T00:00:00Z') }),
      );
      expect(detail.updatedAt).toBe('2026-09-05T00:00:00.000Z');
    });
  });

  describe('toAdminCard / toAdminDetail', () => {
    it('exposes status and a nullable publishedAt for a draft', () => {
      const mapper = makeMapper();
      const card = mapper.toAdminCard(
        makeArticle({ status: ArticleStatus.DRAFT, publishedAt: null }),
      );
      expect(card.status).toBe(ArticleStatus.DRAFT);
      expect(card.publishedAt).toBeNull();
    });

    it('toAdminDetail includes bodyHtml and status together', () => {
      const mapper = makeMapper();
      const detail = mapper.toAdminDetail(
        makeArticle({ status: ArticleStatus.ARCHIVED }),
      );
      expect(detail.status).toBe(ArticleStatus.ARCHIVED);
      expect(detail.bodyHtml).toBe('<p>Isi artikel...</p>');
    });
  });
});
