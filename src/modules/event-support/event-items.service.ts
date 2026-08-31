import {
  BadRequestException,
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
import { EventBillingMode } from './enums/event-billing-mode.enum';
import { CreateEventItemDto } from './dto/create-event-item.dto';
import { UpdateEventItemDto } from './dto/update-event-item.dto';
import { TransitionEventItemStatusDto } from './dto/transition-event-item-status.dto';
import { QueryEventItemsDto } from './dto/query-event-items.dto';
import { QueryAdminEventItemsDto } from './dto/query-admin-event-items.dto';
import { QuoteEventSupportDto } from './dto/quote-event-support.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { resolveUniqueSlug, slugify } from '../../common/utils/slugify';
import { EventAvailabilityService } from './event-availability.service';
import { EventSupportSettingsService } from './event-support-settings.service';
import {
  aggregateEventQuote,
  computeLine,
  resolveActiveRate,
  todayInJakarta,
} from './event-pricing';

export interface EventQuoteLineComputation {
  item: EventItem;
  quantity: number;
  dropoffAt: string;
  pickupAt: string;
  startDate: string;
  endDate: string;
  billingMode: EventBillingMode;
  unitPrice: number;
  unitLabel: 'jam' | 'hari';
  billableUnits: number;
  extraHours: number | null;
  extraHoursTotal: number | null;
  lineTotal: number;
  availableQuantity: number;
}

export interface EventQuoteComputation {
  lines: EventQuoteLineComputation[];
  dropoffAt: string;
  pickupAt: string;
  startDate: string;
  endDate: string;
  isMixedBilling: boolean;
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
    private readonly settingsService: EventSupportSettingsService,
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

  /** The rate applicable to each item over the given window, for the
   * catalog endpoints' `activeRate` — see resolveActiveRate() in
   * event-pricing.ts. Returns an empty map (no `activeRate`) when no
   * window was given, so the controller/mapper can distinguish "no window"
   * from "day-only item". */
  async resolveActiveRates(
    items: EventItem[],
    dropoffAt?: string,
    pickupAt?: string,
  ): Promise<
    Map<string, { amount: number; unit: 'hour' | 'day'; label: 'jam' | 'hari' }>
  > {
    const result = new Map<
      string,
      { amount: number; unit: 'hour' | 'day'; label: 'jam' | 'hari' }
    >();
    if (!dropoffAt || !pickupAt) return result;

    const policy = this.settingsService.toPricingPolicy(
      await this.settingsService.get(),
    );
    for (const item of items) {
      result.set(
        item.id,
        resolveActiveRate(
          {
            pricePerDay: item.pricePerDay,
            hourlyRate: item.hourlyRate,
            supportsHourly: item.supportsHourly,
          },
          dropoffAt,
          pickupAt,
          policy,
        ),
      );
    }
    return result;
  }

  /**
   * Public POST /event-support/quote — writes nothing, computes an
   * authoritative price for a cart and each line's live availability over
   * its rental window. All lines share the cart-level window unless a line
   * carries its own `dropoffAt`/`pickupAt` override.
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

    const policy = this.settingsService.toPricingPolicy(
      await this.settingsService.get(),
    );

    const priced = dto.items.map((lineDto) => {
      const item = itemBySlug.get(lineDto.slug)!;
      const dropoffAt = lineDto.dropoffAt ?? dto.dropoffAt;
      const pickupAt = lineDto.pickupAt ?? dto.pickupAt;
      const computed = computeLine(
        {
          pricePerDay: item.pricePerDay,
          hourlyRate: item.hourlyRate,
          supportsHourly: item.supportsHourly,
          minimumHours: item.minimumHours,
          quantity: lineDto.quantity,
          dropoffAt,
          pickupAt,
        },
        policy,
      );
      return { item, computed };
    });

    // Availability is peak-per-day over a calendar span, batched per
    // distinct (startDate, endDate) pair instead of once per line —
    // EventAvailabilityService.getPeakBooked already takes an array of
    // item ids, so a cart with several lines sharing a window costs one
    // round trip, not N.
    const spanKey = (start: string, end: string) => `${start}|${end}`;
    const itemIdsBySpan = new Map<string, Set<string>>();
    for (const { item, computed } of priced) {
      const key = spanKey(computed.startDate, computed.endDate);
      if (!itemIdsBySpan.has(key)) itemIdsBySpan.set(key, new Set());
      itemIdsBySpan.get(key)!.add(item.id);
    }
    const peakBySpan = new Map<string, Map<string, number>>();
    for (const [key, ids] of itemIdsBySpan) {
      const [startDate, endDate] = key.split('|');
      peakBySpan.set(
        key,
        await this.availability.getPeakBooked([...ids], startDate, endDate),
      );
    }

    const lines: EventQuoteLineComputation[] = priced.map(
      ({ item, computed }) => {
        const key = spanKey(computed.startDate, computed.endDate);
        const peak = peakBySpan.get(key)?.get(item.id) ?? 0;
        return {
          item,
          quantity: computed.quantity,
          dropoffAt: computed.dropoffAt,
          pickupAt: computed.pickupAt,
          startDate: computed.startDate,
          endDate: computed.endDate,
          billingMode: computed.billingMode,
          unitPrice: computed.unitPrice,
          unitLabel: computed.unitLabel,
          billableUnits: computed.billableUnits,
          extraHours: computed.extraHours,
          extraHoursTotal: computed.extraHoursTotal,
          lineTotal: computed.lineTotal,
          availableQuantity: Math.max(0, item.stockQuantity - peak),
        };
      },
    );

    const quote = aggregateEventQuote(lines);
    const startDate = lines.reduce(
      (min, l) => (l.startDate < min ? l.startDate : min),
      lines[0].startDate,
    );
    const endDate = lines.reduce(
      (max, l) => (l.endDate > max ? l.endDate : max),
      lines[0].endDate,
    );
    const isMixedBilling = lines.some(
      (l) => l.billingMode !== lines[0].billingMode,
    );

    return {
      lines,
      dropoffAt: dto.dropoffAt,
      pickupAt: dto.pickupAt,
      startDate,
      endDate,
      isMixedBilling,
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

  /** §9 invariant: an item with `supportsHourly: true` must always carry a
   * positive `hourlyRate` — otherwise a later `computeLine()` call would
   * silently fall back to daily pricing and the admin's "hourly" toggle
   * would lie. Checked against the resolved (post-merge) values, so a
   * PATCH that sets `supportsHourly: true` without ever sending
   * `hourlyRate` on an item that has none is caught too. */
  private assertHourlyRateInvariant(
    supportsHourly: boolean,
    hourlyRate: number | null,
  ): void {
    if (supportsHourly && !(hourlyRate !== null && hourlyRate > 0)) {
      throw new BadRequestException(
        'supportsHourly requires a positive hourlyRate',
      );
    }
  }

  /** Always creates a `draft` item — status moves only via updateStatus(). */
  async create(dto: CreateEventItemDto): Promise<EventItem> {
    await this.assertCategoryExists(dto.categoryId);
    const slug = await resolveUniqueSlug(this.itemRepo, dto.slug ?? dto.name);

    const hourlyRate = dto.hourlyRate ?? null;
    const supportsHourly = dto.supportsHourly ?? false;
    this.assertHourlyRateInvariant(supportsHourly, hourlyRate);

    const item = this.itemRepo.create({
      categoryId: dto.categoryId,
      name: dto.name,
      slug,
      kind: dto.kind ?? undefined,
      description: dto.description ?? null,
      pricePerDay: dto.pricePerDay,
      stockQuantity: dto.stockQuantity,
      hourlyRate,
      supportsHourly,
      minimumHours: dto.minimumHours ?? null,
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

    const resolvedHourlyRate =
      dto.hourlyRate !== undefined ? dto.hourlyRate : item.hourlyRate;
    const resolvedSupportsHourly =
      dto.supportsHourly !== undefined
        ? dto.supportsHourly
        : item.supportsHourly;
    this.assertHourlyRateInvariant(resolvedSupportsHourly, resolvedHourlyRate);

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
      ...(dto.hourlyRate !== undefined && {
        hourlyRate: dto.hourlyRate ?? null,
      }),
      ...(dto.supportsHourly !== undefined && {
        supportsHourly: dto.supportsHourly,
      }),
      ...(dto.minimumHours !== undefined && {
        minimumHours: dto.minimumHours ?? null,
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
      const today = todayInJakarta();
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
