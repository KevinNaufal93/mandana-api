import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArticleCategory } from './entities/article-category.entity';
import { Article } from './entities/article.entity';
import { CreateArticleCategoryDto } from './dto/create-article-category.dto';
import { UpdateArticleCategoryDto } from './dto/update-article-category.dto';
import { resolveUniqueSlug } from '../../common/utils/slugify';

@Injectable()
export class ArticleCategoriesService {
  constructor(
    @InjectRepository(ArticleCategory)
    private readonly categoriesRepo: Repository<ArticleCategory>,
    @InjectRepository(Article)
    private readonly articlesRepo: Repository<Article>,
  ) {}

  /** Unfiltered — this is what the admin create/edit form's category
   *  dropdown reads, unlike the public GET /article-categories (which only
   *  returns categories with >=1 published article). Without this, a
   *  freshly created category could never be picked for the first article
   *  that would make it eligible to appear publicly. */
  findAllAdmin(): Promise<ArticleCategory[]> {
    return this.categoriesRepo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<ArticleCategory> {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category)
      throw new NotFoundException(`Article category ${id} not found`);
    return category;
  }

  async create(dto: CreateArticleCategoryDto): Promise<ArticleCategory> {
    const slug = await resolveUniqueSlug(
      this.categoriesRepo,
      dto.slug ?? dto.name,
    );
    const category = this.categoriesRepo.create({ name: dto.name, slug });
    return this.categoriesRepo.save(category);
  }

  async update(
    id: string,
    dto: UpdateArticleCategoryDto,
  ): Promise<ArticleCategory> {
    const category = await this.findOne(id);

    const slug =
      dto.slug !== undefined && dto.slug !== category.slug
        ? await resolveUniqueSlug(this.categoriesRepo, dto.slug, id)
        : undefined;

    Object.assign(category, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
    });

    return this.categoriesRepo.save(category);
  }

  /** The FK is ON DELETE RESTRICT — without this precheck, deleting a
   *  category that still has articles surfaces as a raw Postgres driver
   *  error (500) instead of a clear 409. Same shape as
   *  MediaService.delete()'s reference guard. */
  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    const articleCount = await this.articlesRepo.count({
      where: { categoryId: id },
    });
    if (articleCount > 0) {
      throw new ConflictException(
        `Article category '${category.slug}' is still used by ${articleCount} article(s). Reassign or delete them first.`,
      );
    }
    await this.categoriesRepo.remove(category);
  }
}
