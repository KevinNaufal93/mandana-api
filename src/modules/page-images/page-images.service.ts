import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageImage } from './entities/page-image.entity';
import { PAGE_IMAGE_SLOT_KEYS, PageImageSlot } from './enums/page-image-slot.enum';
import { UpdatePageImageDto } from './dto/update-page-image.dto';
import { PageImagesCacheService } from './page-images-cache.service';
import { PageImagesMapper, PageImagePayload } from './page-images.mapper';

/**
 * Reads/writes the fixed page_images rows (one per PAGE_IMAGE_SLOT_KEYS
 * entry). Auto-seeds on read like SeoService/LegalService — a row with a
 * null mediaAssetId is safe (the web app falls back to its own hardcoded
 * static image), so a DB restored before the seeding migration ran, or a
 * slot added to PAGE_IMAGE_SLOTS without a matching migration yet,
 * degrades gracefully instead of 500ing. The real initial rows
 * (mediaAssetId: null) come from each migration's seed — see
 * AddPageImages/AddHomePageImages' own comments.
 */
@Injectable()
export class PageImagesService {
  constructor(
    @InjectRepository(PageImage)
    private readonly repo: Repository<PageImage>,
    private readonly mapper: PageImagesMapper,
    private readonly cache: PageImagesCacheService,
  ) {}

  private assertKnownKey(slotKey: PageImageSlot): void {
    if (!PAGE_IMAGE_SLOT_KEYS.includes(slotKey)) {
      throw new NotFoundException(`Unknown page image slot "${slotKey}"`);
    }
  }

  /** All rows, in PAGE_IMAGE_SLOTS' declared order, so the admin list is
   *  stable. Auto-seeds any key missing a row. */
  async getSlots(): Promise<PageImage[]> {
    const existing = await this.repo.find({ relations: { mediaAsset: true } });
    const existingKeys = new Set(existing.map((s) => s.slotKey));
    const missing = PAGE_IMAGE_SLOT_KEYS.filter((key) => !existingKeys.has(key));

    if (missing.length > 0) {
      await this.repo.insert(missing.map((slotKey) => ({ slotKey })));
      return this.getSlots();
    }

    const byKey = new Map(existing.map((s) => [s.slotKey, s]));
    return PAGE_IMAGE_SLOT_KEYS.map((key) => byKey.get(key)!);
  }

  async getSlot(slotKey: PageImageSlot): Promise<PageImage> {
    this.assertKnownKey(slotKey);

    const existing = await this.repo.findOne({
      where: { slotKey },
      relations: { mediaAsset: true },
    });
    if (existing) return existing;

    const created = this.repo.create({ slotKey });
    return this.repo.save(created);
  }

  async updateSlot(slotKey: PageImageSlot, dto: UpdatePageImageDto): Promise<PageImage> {
    // Ensures the row exists (auto-seeds if missing) before the update
    // below, which would otherwise silently affect zero rows.
    await this.getSlot(slotKey);

    // A raw column update, not load-mutate-save: getSlot() above loads
    // the `mediaAsset` relation, and saving an entity that still carries
    // that stale relation object alongside a directly-assigned
    // `mediaAssetId` lets TypeORM re-derive the FK from the relation on
    // write, silently discarding an explicit `null` clear. `repo.update()`
    // touches only the column, sidestepping that entirely — confirmed
    // live: the load-mutate-save version passed every automated test
    // (which mocks the repository) but failed to actually clear a slot
    // against a real database.
    if (dto.mediaAssetId !== undefined) {
      await this.repo.update({ slotKey }, { mediaAssetId: dto.mediaAssetId });
    }

    await this.cache.bust();

    return this.repo.findOneOrFail({
      where: { slotKey },
      relations: { mediaAsset: true },
    });
  }

  /** The one public read (`GET /page-images`) — every slot, Redis-cached.
   *  Never throws: getSlots() auto-seeds rather than 404s, so this can
   *  never be the reason a page fails to render on the web side. Caches
   *  the MAPPED payload, not the raw entity — see LegalService's own
   *  comment on why: a Date-through-Redis bug already shipped once from
   *  caching a raw entity instead. */
  async getPublicPayload(): Promise<PageImagePayload[]> {
    const cached = await this.cache.get<PageImagePayload[]>();
    if (cached) return cached;

    const slots = await this.getSlots();
    const payload = slots.map((s) => this.mapper.toPayload(s));

    await this.cache.set(payload);
    return payload;
  }
}
