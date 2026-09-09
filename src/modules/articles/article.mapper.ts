import { Injectable, Logger } from '@nestjs/common';
import { MediaService, MediaImageDto } from '../media/media.service';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { Article } from './entities/article.entity';
import { ArticleStatus } from './enums/article-status.enum';

export interface ArticleAuthorDto {
  id: string;
  name: string;
  /** User.title, e.g. "Content Editor" — shown under the byline. Null
   *  renders no role line. */
  role: string | null;
  avatar: MediaImageDto | null;
}

export interface ArticleCategoryRef {
  id: string;
  slug: string;
  name: string;
}

/** List/related-article shape. */
export interface ArticleCard {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: MediaImageDto | null;
  category: ArticleCategoryRef;
  author: ArticleAuthorDto;
  /** ISO 8601. */
  publishedAt: string;
  readingMinutes: number;
}

/** GET /articles/{slug} shape — everything above, plus: */
export interface ArticleDetail extends ArticleCard {
  bodyHtml: string;
  /** Null until the article is edited post-publish — see Article.editedAt. */
  updatedAt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** Admin list row: same fields as the public card, but `publishedAt` can be
 *  null (a draft has never published) and `status` is visible — the public
 *  card shape can't represent a draft. */
export interface AdminArticleCard extends Omit<ArticleCard, 'publishedAt'> {
  status: ArticleStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/** Admin detail row: same as the public detail, but `publishedAt` can be
 *  null and `status` is visible. */
export interface AdminArticleDetail extends Omit<ArticleDetail, 'publishedAt'> {
  status: ArticleStatus;
  publishedAt: string | null;
  createdAt: string;
}

@Injectable()
export class ArticleMapper {
  private readonly logger = new Logger(ArticleMapper.name);

  constructor(private readonly mediaService: MediaService) {}

  /** buildImageDto() throws InternalServerErrorException when an asset has
   *  zero usable variants (a half-failed upload). A bad cover or author
   *  avatar must not take down an otherwise-fine article list/detail
   *  response — log and degrade to null instead, same pattern as
   *  PropertyPromoMapper.toCard(). */
  private buildImage(
    asset: MediaAsset | null,
    context: string,
  ): MediaImageDto | null {
    if (!asset) return null;
    try {
      return this.mediaService.buildImageDto(asset);
    } catch (err) {
      this.logger.error(
        `Dropping image on ${context}: unusable media asset ${asset.id}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }

  private buildCategory(article: Article): ArticleCategoryRef {
    return {
      id: article.category.id,
      slug: article.category.slug,
      name: article.category.name,
    };
  }

  private buildAuthor(article: Article): ArticleAuthorDto {
    const author = article.author;
    if (!author) {
      // authorId is nullable (ON DELETE SET NULL — see Article.author):
      // the User who wrote this can be deleted later via
      // UsersService.remove(). The public contract's ArticleAuthorDto has
      // no null variant, so fall back to a neutral placeholder rather than
      // an empty/blank byline.
      return {
        id: article.authorId ?? '',
        name: 'Tim Editorial',
        role: null,
        avatar: null,
      };
    }
    return {
      id: author.id,
      name: author.name,
      role: author.title,
      avatar: this.buildImage(
        author.photoMediaAsset ?? null,
        `article ${article.id} author avatar`,
      ),
    };
  }

  toCard(article: Article): ArticleCard {
    return {
      id: article.id,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      coverImage: this.buildImage(
        article.coverMediaAsset,
        `article ${article.id} cover`,
      ),
      category: this.buildCategory(article),
      author: this.buildAuthor(article),
      publishedAt: (article.publishedAt ?? article.createdAt).toISOString(),
      readingMinutes: article.readingMinutes,
    };
  }

  toDetail(article: Article): ArticleDetail {
    return {
      ...this.toCard(article),
      bodyHtml: article.bodyHtml,
      updatedAt: article.editedAt ? article.editedAt.toISOString() : null,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
    };
  }

  toAdminCard(article: Article): AdminArticleCard {
    // Spreads toCard()'s result (including its non-null `publishedAt`) and
    // then overrides `publishedAt` below — simpler than destructuring it
    // out first, since a later key in the same object literal always wins.
    return {
      ...this.toCard(article),
      status: article.status,
      publishedAt: article.publishedAt
        ? article.publishedAt.toISOString()
        : null,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.editedAt ? article.editedAt.toISOString() : null,
    };
  }

  toAdminDetail(article: Article): AdminArticleDetail {
    return {
      ...this.toDetail(article),
      status: article.status,
      publishedAt: article.publishedAt
        ? article.publishedAt.toISOString()
        : null,
      createdAt: article.createdAt.toISOString(),
    };
  }
}
