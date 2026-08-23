import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { EventCategory } from './entities/event-category.entity';
import { EventItem } from './entities/event-item.entity';
import { EventItemStatus } from './enums/event-item-status.enum';
import { CreateEventCategoryDto } from './dto/create-event-category.dto';
import { UpdateEventCategoryDto } from './dto/update-event-category.dto';
import { resolveUniqueSlug, slugify } from '../../common/utils/slugify';

export type EventCategoryWithCount = EventCategory & { itemCount: number };

@Injectable()
export class EventCategoriesService {
  constructor(
    @InjectRepository(EventCategory)
    private readonly categoryRepo: Repository<EventCategory>,
    @InjectRepository(EventItem)
    private readonly itemRepo: Repository<EventItem>,
  ) {}

  /** Attaches `itemCount` — items in `onlyStatus` when given, otherwise all
   * items regardless of status (the admin view). One grouped query for the
   * whole list rather than N+1 counts per category. */
  private async withItemCounts(
    categories: EventCategory[],
    onlyStatus?: EventItemStatus,
  ): Promise<EventCategoryWithCount[]> {
    if (categories.length === 0) return [];

    const qb = this.itemRepo
      .createQueryBuilder('i')
      .select('i.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('i.categoryId IN (:...ids)', { ids: categories.map((c) => c.id) })
      .groupBy('i.categoryId');
    if (onlyStatus) qb.andWhere('i.status = :status', { status: onlyStatus });

    const rows = await qb.getRawMany<{ categoryId: string; count: string }>();
    const counts = new Map(rows.map((r) => [r.categoryId, Number(r.count)]));

    return categories.map((c) =>
      Object.assign(c, { itemCount: counts.get(c.id) ?? 0 }),
    );
  }

  async findAllPublic(): Promise<EventCategoryWithCount[]> {
    const categories = await this.categoryRepo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return this.withItemCounts(categories, EventItemStatus.PUBLISHED);
  }

  async findAllAdmin(isActive?: boolean): Promise<EventCategoryWithCount[]> {
    const where: FindOptionsWhere<EventCategory> = {};
    if (isActive !== undefined) where.isActive = isActive;

    const categories = await this.categoryRepo.find({
      where,
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return this.withItemCounts(categories);
  }

  async findOneOrFail(id: string): Promise<EventCategory> {
    const category = await this.categoryRepo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!category) {
      throw new NotFoundException(`Event category ${id} not found`);
    }
    return category;
  }

  /** Admin single-item view — counts all items regardless of status,
   * matching findAllAdmin()'s definition of `itemCount`. */
  async findOneWithCountOrFail(id: string): Promise<EventCategoryWithCount> {
    const category = await this.findOneOrFail(id);
    const [withCount] = await this.withItemCounts([category]);
    return withCount;
  }

  async findBySlugOrFail(slug: string): Promise<EventCategory> {
    const category = await this.categoryRepo.findOne({
      where: { slug, isActive: true },
      relations: { mediaAsset: true },
    });
    if (!category) {
      throw new NotFoundException(`Event category "${slug}" not found`);
    }
    return category;
  }

  async create(dto: CreateEventCategoryDto): Promise<EventCategoryWithCount> {
    const slug = await resolveUniqueSlug(
      this.categoryRepo,
      dto.slug ?? dto.name,
    );

    const category = this.categoryRepo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      mediaAssetId: dto.mediaAssetId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.categoryRepo.save(category);
    return this.findOneWithCountOrFail(saved.id);
  }

  async update(
    id: string,
    dto: UpdateEventCategoryDto,
  ): Promise<EventCategoryWithCount> {
    const category = await this.findOneOrFail(id);

    const slug =
      dto.slug !== undefined && slugify(dto.slug) !== category.slug
        ? await resolveUniqueSlug(this.categoryRepo, dto.slug, id)
        : undefined;

    Object.assign(category, {
      ...(slug !== undefined && { slug }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.categoryRepo.save(category);
    return this.findOneWithCountOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOneOrFail(id);

    const itemCount = await this.itemRepo.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `Cannot delete "${category.name}" — it still has ${itemCount} item(s). Move or delete them first.`,
      );
    }

    await this.categoryRepo.remove(category);
  }
}
