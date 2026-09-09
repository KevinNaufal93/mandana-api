import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { ArticleCategory } from './entities/article-category.entity';
import {
  ArticleStatus,
  PUBLIC_ARTICLE_STATUSES,
} from './enums/article-status.enum';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { QueryArticlesDto } from './dto/query-articles.dto';
import { QueryAdminArticlesDto } from './dto/query-admin-articles.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { User } from '../users/entities/user.entity';
import { resolveUniqueSlug } from '../../common/utils/slugify';
import { richTextToPlain } from '../../common/rich-text';
import { computeReadingMinutes } from './reading-time';
import {
  ArticleMapper,
  ArticleCard,
  ArticleDetail,
  AdminArticleCard,
  AdminArticleDetail,
} from './article.mapper';

const DETAIL_RELATIONS = {
  category: true,
  coverMediaAsset: true,
  author: { photoMediaAsset: true },
} as const;

const RELATED_DEFAULT_LIMIT = 3;
const RELATED_MAX_LIMIT = 12;

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articlesRepo: Repository<Article>,
    @InjectRepository(ArticleCategory)
    private readonly categoriesRepo: Repository<ArticleCategory>,
    private readonly mapper: ArticleMapper,
  ) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  async findAll(
    query: QueryArticlesDto,
  ): Promise<PaginatedResult<ArticleCard>> {
    const { page, limit, categorySlug } = query;

    const qb = this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.category', 'c')
      .leftJoinAndSelect('a.coverMediaAsset', 'cover')
      .leftJoinAndSelect('a.author', 'author')
      .leftJoinAndSelect('author.photoMediaAsset', 'authorPhoto')
      .where('a.status IN (:...statuses)', {
        statuses: PUBLIC_ARTICLE_STATUSES,
      });

    if (categorySlug) {
      qb.andWhere('c.slug = :categorySlug', { categorySlug });
    }

    const offset = (page - 1) * limit;
    qb.orderBy('a.publishedAt', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((a) => this.mapper.toCard(a)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string): Promise<ArticleDetail> {
    const article = await this.articlesRepo.findOne({
      where: { slug, status: In(PUBLIC_ARTICLE_STATUSES) },
      relations: DETAIL_RELATIONS,
    });
    if (!article) throw new NotFoundException(`Article '${slug}' not found`);
    return this.mapper.toDetail(article);
  }

  /**
   * Same category first (newest), falling back to nothing once the category
   * runs out — never other published articles are force-fit in beyond the
   * category match; an unknown/unpublished slug returns `[]` rather than
   * throwing. This deliberately diverges from
   * PropertiesService.findSimilar(), which DOES throw NotFoundException on
   * a missing slug — the two contract docs describe this endpoint as
   * never-404s ("mirrors GET /properties/{slug}/similar"), which is the
   * behavior worth keeping even though findSimilar's own code doesn't
   * actually behave that way. By the time this endpoint is hit the detail
   * page has already 404'd on an unknown/unpublished slug, so a miss here
   * just means "nothing related", not "page doesn't exist".
   */
  async findRelated(
    slug: string,
    limit = RELATED_DEFAULT_LIMIT,
  ): Promise<ArticleCard[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), RELATED_MAX_LIMIT);

    const source = await this.articlesRepo.findOne({
      where: { slug, status: In(PUBLIC_ARTICLE_STATUSES) },
    });
    if (!source) return [];

    const qb = this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.category', 'c')
      .leftJoinAndSelect('a.coverMediaAsset', 'cover')
      .leftJoinAndSelect('a.author', 'author')
      .leftJoinAndSelect('author.photoMediaAsset', 'authorPhoto')
      .addSelect(
        'CASE WHEN a.category_id = :categoryId THEN 1 ELSE 0 END',
        'score',
      )
      .where('a.status IN (:...statuses)', {
        statuses: PUBLIC_ARTICLE_STATUSES,
      })
      .andWhere('a.id <> :id', { id: source.id })
      .orderBy('score', 'DESC')
      .addOrderBy('a.publishedAt', 'DESC')
      .setParameters({ categoryId: source.categoryId })
      .take(boundedLimit);

    const related = await qb.getMany();
    return related.map((a) => this.mapper.toCard(a));
  }

  /** Only categories with >=1 published article — an empty category
   *  shouldn't appear as a dead-end filter chip. */
  findPublicCategories(): Promise<ArticleCategory[]> {
    return this.categoriesRepo
      .createQueryBuilder('c')
      .innerJoin('c.articles', 'a', 'a.status IN (:...statuses)', {
        statuses: PUBLIC_ARTICLE_STATUSES,
      })
      .distinct(true)
      .orderBy('c.name', 'ASC')
      .getMany();
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────

  async adminFindAll(
    query: QueryAdminArticlesDto,
  ): Promise<PaginatedResult<AdminArticleCard>> {
    const { page, limit, status, categoryId, search } = query;

    const qb = this.articlesRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.category', 'c')
      .leftJoinAndSelect('a.coverMediaAsset', 'cover')
      .leftJoinAndSelect('a.author', 'author')
      .leftJoinAndSelect('author.photoMediaAsset', 'authorPhoto');

    if (status) qb.andWhere('a.status = :status', { status });
    if (categoryId) qb.andWhere('a.categoryId = :categoryId', { categoryId });
    if (search) {
      qb.andWhere('(a.title ILIKE :search OR a.excerpt ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const offset = (page - 1) * limit;
    qb.orderBy('a.createdAt', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((a) => this.mapper.toAdminCard(a)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async adminFindOne(id: string): Promise<AdminArticleDetail> {
    const article = await this.articlesRepo.findOne({
      where: { id },
      relations: DETAIL_RELATIONS,
    });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    return this.mapper.toAdminDetail(article);
  }

  async create(
    dto: CreateArticleDto,
    currentUser: User,
  ): Promise<AdminArticleDetail> {
    await this.assertCategoryExists(dto.categoryId);

    const slug = await resolveUniqueSlug(
      this.articlesRepo,
      dto.slug ?? dto.title,
    );
    const bodyText = richTextToPlain(dto.bodyHtml) ?? '';
    const status = dto.status ?? ArticleStatus.DRAFT;

    const article = this.articlesRepo.create({
      slug,
      title: dto.title,
      excerpt: dto.excerpt,
      bodyHtml: dto.bodyHtml,
      bodyText,
      readingMinutes: computeReadingMinutes(bodyText),
      status,
      categoryId: dto.categoryId,
      authorId: dto.authorId ?? currentUser.id,
      coverMediaAssetId: dto.coverMediaAssetId ?? null,
      metaTitle: dto.metaTitle ?? null,
      metaDescription: dto.metaDescription ?? null,
      // A create() that goes straight to PUBLISHED (skipping DRAFT) still
      // needs a publish date — same rule update() uses for the transition.
      publishedAt: status === ArticleStatus.PUBLISHED ? new Date() : null,
    });

    const saved = await this.articlesRepo.save(article);
    return this.adminFindOne(saved.id);
  }

  async update(id: string, dto: UpdateArticleDto): Promise<AdminArticleDetail> {
    const article = await this.adminFindOneRaw(id);
    const wasAlreadyPublished = article.status === ArticleStatus.PUBLISHED;

    if (dto.slug !== undefined && dto.slug !== article.slug) {
      if (wasAlreadyPublished) {
        throw new ConflictException(
          'Cannot change the slug of a published article; unpublish it first',
        );
      }
    }
    const slug =
      dto.slug !== undefined && dto.slug !== article.slug
        ? await resolveUniqueSlug(this.articlesRepo, dto.slug, id)
        : undefined;

    if (dto.categoryId !== undefined) {
      await this.assertCategoryExists(dto.categoryId);
    }

    // Recomputed together whenever bodyHtml is sent at all — not gated on
    // whether the new value actually differs from the old one, so a
    // resend-the-same-body request can't leave readingMinutes stale.
    const bodyText =
      dto.bodyHtml !== undefined
        ? (richTextToPlain(dto.bodyHtml) ?? '')
        : undefined;

    const fieldChanges = {
      ...(slug !== undefined && { slug }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
      ...(dto.bodyHtml !== undefined && {
        bodyHtml: dto.bodyHtml,
        bodyText,
        readingMinutes: computeReadingMinutes(bodyText as string),
      }),
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(dto.authorId !== undefined && { authorId: dto.authorId }),
      ...(dto.coverMediaAssetId !== undefined && {
        coverMediaAssetId: dto.coverMediaAssetId,
      }),
      ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle ?? null }),
      ...(dto.metaDescription !== undefined && {
        metaDescription: dto.metaDescription ?? null,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    // Everything above except a bare `status` transition counts as a
    // content edit — archiving/republishing alone shouldn't stamp editedAt.
    const isContentChange = Object.keys(fieldChanges).some(
      (key) => key !== 'status',
    );

    Object.assign(article, fieldChanges);

    // DRAFT/ARCHIVED -> PUBLISHED, only if never published before: keeps
    // the publish date stable across an unpublish/republish cycle, which
    // is what the sitemap/JSON-LD datePublished reads.
    if (
      dto.status === ArticleStatus.PUBLISHED &&
      article.publishedAt === null
    ) {
      article.publishedAt = new Date();
    }
    if (wasAlreadyPublished && isContentChange) {
      article.editedAt = new Date();
    }

    await this.articlesRepo.save(article);
    return this.adminFindOne(id);
  }

  async remove(id: string): Promise<void> {
    const article = await this.adminFindOneRaw(id);
    await this.articlesRepo.remove(article);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private async adminFindOneRaw(id: string): Promise<Article> {
    const article = await this.articlesRepo.findOne({ where: { id } });
    if (!article) throw new NotFoundException(`Article ${id} not found`);
    return article;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categoriesRepo.exists({
      where: { id: categoryId },
    });
    if (!exists) {
      throw new BadRequestException(`Unknown category id: ${categoryId}`);
    }
  }
}
