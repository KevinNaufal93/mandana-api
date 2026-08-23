import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EventItem } from './entities/event-item.entity';
import { EventCategory } from './entities/event-category.entity';
import { EventBookingItem } from './entities/event-booking-item.entity';
import { EventItemStatus } from './enums/event-item-status.enum';
import { EventBookingStatus } from './enums/event-booking-status.enum';
import { CreateEventItemDto } from './dto/create-event-item.dto';
import { UpdateEventItemDto } from './dto/update-event-item.dto';
import { TransitionEventItemStatusDto } from './dto/transition-event-item-status.dto';
import { QueryEventItemsDto } from './dto/query-event-items.dto';
import { QueryAdminEventItemsDto } from './dto/query-admin-event-items.dto';
import { QuoteEventSupportDto } from './dto/quote-event-support.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { resolveUniqueSlug, slugify } from '../../common/utils/slugify';
import { EventAvailabilityService } from './event-availability.service';
import {
  addDaysToDateString,
  aggregateEventQuote,
  computeLine,
} from './event-pricing';

export interface EventQuoteLineComputation {
  item: EventItem;
  quantity: number;
  startDate: string;
  days: number;
  endDate: string;
  pricePerDay: number;
  lineTotal: number;
  availableQuantity: number;
}

export interface EventQuoteComputation {
  lines: EventQuoteLineComputation[];
  startDate: string;
  endDate: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  eventLocation: string | null;
}

/** Legal status transitions — enforced so an item can always be pulled back
 * to draft for editing, per the product requirement that only draft items
 * are editable. There is deliberately no `archived -> published` shortcut:
 * an archived item must go through draft on its way back to publication. */
const ALLOWED_TRANSITIONS: Record<EventItemStatus, EventItemStatus[]> = {
  [EventItemStatus.DRAFT]: [
    EventItemStatus.PUBLISHED,
    EventItemStatus.ARCHIVED,
  ],
  [EventItemStatus.PUBLISHED]: [
    EventItemStatus.DRAFT,
    EventItemStatus.ARCHIVED,
  ],
  [EventItemStatus.ARCHIVED]: [EventItemStatus.DRAFT],
};

@Injectable()
export class EventItemsService {
  constructor(
    @InjectRepository(EventItem)
    private readonly itemRepo: Repository<EventItem>,
    @InjectRepository(EventCategory)
    private readonly categoryRepo: Repository<EventCategory>,
    @InjectRepository(EventBookingItem)
    private readonly bookingItemRepo: Repository<EventBookingItem>,
    private readonly availability: EventAvailabilityService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────

  async findAllPublic(
    query: QueryEventItemsDto,
  ): Promise<PaginatedResult<EventItem>> {
    const { page, limit, categorySlug, kind } = query;

    const qb = this.itemRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.category', 'category')
      .leftJoinAndSelect('i.mediaAsset', 'mediaAsset')
      .where('i.status = :status', { status: EventItemStatus.PUBLISHED });

    if (categorySlug)
      qb.andWhere('category.slug = :categorySlug', { categorySlug });
    if (kind) qb.andWhere('i.kind = :kind', { kind });

    qb.orderBy('i.sortOrder', 'ASC')
      .addOrderBy('i.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneBySlugPublicOrFail(slug: string): Promise<EventItem> {
    const item = await this.itemRepo.findOne({
      where: { slug, status: EventItemStatus.PUBLISHED },
      relations: { category: true, mediaAsset: true },
    });
    if (!item) throw new NotFoundException(`Event item "${slug}" not found`);
    return item;
  }

  /** Used by POST /event-support/quote — published items only, in the same
   * order as `slugs` isn't guaranteed, so the caller must index by slug. */
  async findManyPublishedBySlugs(slugs: string[]): Promise<EventItem[]> {
    if (slugs.length === 0) return [];
    return this.itemRepo.find({
      where: { slug: In(slugs), status: EventItemStatus.PUBLISHED },
      relations: { category: true },
    });
  }

  /**
   * Public POST /event-support/quote — writes nothing, computes an
   * authoritative price for a cart and each line's live availability over
   * its date range. All lines share `dto.startDate`; a line may override
   * the cart-level `days` (e.g. a DJ set rented for only 1 of a 2-day event).
   */
  async quote(dto: QuoteEventSupportDto): Promise<EventQuoteComputation> {
    const slugs = dto.items.map((l) => l.slug);
    const items = await this.findManyPublishedBySlugs(slugs);
    const itemBySlug = new Map(items.map((i) => [i.slug, i]));

    const missing = slugs.filter((s) => !itemBySlug.has(s));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Event item(s) not found or not published: ${missing.join(', ')}`,
      );
    }

    const lines: EventQuoteLineComputation[] = [];
    for (const lineDto of dto.items) {
      const item = itemBySlug.get(lineDto.slug)!;
      const days = lineDto.days ?? dto.days;
      const computed = computeLine({
        pricePerDay: item.pricePerDay,
        quantity: lineDto.quantity,
        days,
      });
      const endDate = addDaysToDateString(dto.startDate, computed.days);
      const availableQuantity = await this.availability.getAvailableQuantity(
        item.id,
        item.stockQuantity,
        dto.startDate,
        endDate,
      );

      lines.push({
        item,
        quantity: computed.quantity,
        startDate: dto.startDate,
        days: computed.days,
        endDate,
        pricePerDay: computed.pricePerDay,
        lineTotal: computed.lineTotal,
        availableQuantity,
      });
    }

    const quote = aggregateEventQuote(lines);
    const endDate = lines.reduce(
      (max, l) => (l.endDate > max ? l.endDate : max),
      lines[0].endDate,
    );

    return {
      lines,
      startDate: dto.startDate,
      endDate,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      total: quote.total,
      eventLocation: dto.eventLocation ?? null,
    };
  }

  // ── Admin ─────────────────────────────────────────────────────────────

  async findAllAdmin(
    query: QueryAdminEventItemsDto,
  ): Promise<PaginatedResult<EventItem>> {
    const { page, limit, categoryId, kind, status, search } = query;

    const qb = this.itemRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.category', 'category')
      .leftJoinAndSelect('i.mediaAsset', 'mediaAsset');

    if (categoryId) qb.andWhere('i.categoryId = :categoryId', { categoryId });
    if (kind) qb.andWhere('i.kind = :kind', { kind });
    if (status) qb.andWhere('i.status = :status', { status });
    if (search) qb.andWhere('i.name ILIKE :search', { search: `%${search}%` });

    qb.orderBy('category.sortOrder', 'ASC')
      .addOrderBy('i.sortOrder', 'ASC')
      .addOrderBy('i.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneOrFail(id: string): Promise<EventItem> {
    const item = await this.itemRepo.findOne({
      where: { id },
      relations: { category: true, mediaAsset: true },
    });
    if (!item) throw new NotFoundException(`Event item ${id} not found`);
    return item;
  }

  /** Used by EventBookingsService when recording a booking — only published
   * items can be booked, same as the public quote endpoint. */
  async findManyPublishedByIdsOrFail(ids: string[]): Promise<EventItem[]> {
    const items = await this.itemRepo.find({
      where: { id: In(ids), status: EventItemStatus.PUBLISHED },
      relations: { category: true },
    });
    if (items.length !== new Set(ids).size) {
      const found = new Set(items.map((i) => i.id));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Event item(s) not found or not published: ${missing.join(', ')}`,
      );
    }
    return items;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categoryRepo.exists({
      where: { id: categoryId },
    });
    if (!exists) {
      throw new NotFoundException(`Event category ${categoryId} not found`);
    }
  }

  /** Always creates a `draft` item — status moves only via updateStatus(). */
  async create(dto: CreateEventItemDto): Promise<EventItem> {
    await this.assertCategoryExists(dto.categoryId);
    const slug = await resolveUniqueSlug(this.itemRepo, dto.slug ?? dto.name);

    const item = this.itemRepo.create({
      categoryId: dto.categoryId,
      name: dto.name,
      slug,
      kind: dto.kind ?? undefined,
      description: dto.description ?? null,
      pricePerDay: dto.pricePerDay,
      stockQuantity: dto.stockQuantity,
      mediaAssetId: dto.mediaAssetId ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.itemRepo.save(item);
    return this.findOneOrFail(saved.id);
  }

  /** Only accepted while the item is `draft` — the product requirement is
   * that a published/archived item must first be moved back to draft via
   * PATCH .../status before any of its fields can change. */
  async update(id: string, dto: UpdateEventItemDto): Promise<EventItem> {
    const item = await this.findOneOrFail(id);
    if (item.status !== EventItemStatus.DRAFT) {
      throw new ConflictException(
        `"${item.name}" is ${item.status}; only draft items can be edited. Move it back to draft first.`,
      );
    }

    if (dto.categoryId !== undefined)
      await this.assertCategoryExists(dto.categoryId);

    const slug =
      dto.slug !== undefined && slugify(dto.slug) !== item.slug
        ? await resolveUniqueSlug(this.itemRepo, dto.slug, id)
        : undefined;

    Object.assign(item, {
      ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      ...(slug !== undefined && { slug }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.pricePerDay !== undefined && { pricePerDay: dto.pricePerDay }),
      ...(dto.stockQuantity !== undefined && {
        stockQuantity: dto.stockQuantity,
      }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.itemRepo.save(item);
    return this.findOneOrFail(id);
  }

  async updateStatus(
    id: string,
    dto: TransitionEventItemStatusDto,
  ): Promise<EventItem> {
    const item = await this.findOneOrFail(id);

    if (item.status === dto.status) return item;
    if (!ALLOWED_TRANSITIONS[item.status].includes(dto.status)) {
      throw new ConflictException(
        `Cannot move "${item.name}" from ${item.status} to ${dto.status}`,
      );
    }

    if (dto.status === EventItemStatus.ARCHIVED) {
      const today = new Date().toISOString().slice(0, 10);
      const activeBookingCount = await this.bookingItemRepo
        .createQueryBuilder('bi')
        .innerJoin('bi.booking', 'b')
        .where('bi.itemId = :id', { id })
        .andWhere('b.status IN (:...statuses)', {
          statuses: [EventBookingStatus.PENDING, EventBookingStatus.CONFIRMED],
        })
        .andWhere('bi.endDate >= :today', { today })
        .getCount();

      if (activeBookingCount > 0) {
        throw new ConflictException(
          `Cannot archive "${item.name}" — it has ${activeBookingCount} upcoming or active booking(s)`,
        );
      }
    }

    item.status = dto.status;
    await this.itemRepo.save(item);
    return this.findOneOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOneOrFail(id);

    const bookingLineCount = await this.bookingItemRepo.count({
      where: { itemId: id },
    });
    if (bookingLineCount > 0) {
      throw new ConflictException(
        `Cannot delete "${item.name}" — it is referenced by ${bookingLineCount} booking(s). Archive it instead.`,
      );
    }

    await this.itemRepo.remove(item);
  }
}
