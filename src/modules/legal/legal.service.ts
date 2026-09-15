import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalPage } from './entities/legal-page.entity';
import { LEGAL_PAGE_KEYS, LegalPageKey } from './enums/legal-page-key.enum';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';
import { LegalCacheService } from './legal-cache.service';
import { LegalMapper, LegalPagePayload } from './legal.mapper';
import { richTextToPlain } from '../../common/rich-text';

/**
 * Reads/writes the two fixed legal_pages rows. Auto-seeds on read like
 * SeoService — a row with empty placeholder text is safe (the web app
 * just renders it), so a DB restored before the seeding migration ran, or
 * a key added to LEGAL_PAGES without a matching migration, degrades
 * gracefully instead of 500ing. The real initial copy (the section
 * skeleton) comes from the migration's seed — see AddLegal's own comment.
 */
@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(LegalPage)
    private readonly repo: Repository<LegalPage>,
    private readonly mapper: LegalMapper,
    private readonly cache: LegalCacheService,
  ) {}

  private assertKnownKey(pageKey: LegalPageKey): void {
    if (!LEGAL_PAGE_KEYS.includes(pageKey)) {
      throw new NotFoundException(`Unknown legal page key "${pageKey}"`);
    }
  }

  /** All rows, in LEGAL_PAGES' declared order, so the admin list is stable. */
  async getPages(): Promise<LegalPage[]> {
    const existing = await this.repo.find();
    const existingKeys = new Set(existing.map((p) => p.pageKey));
    const missing = LEGAL_PAGE_KEYS.filter((key) => !existingKeys.has(key));

    if (missing.length > 0) {
      await this.repo.insert(
        missing.map((pageKey) => ({ pageKey, title: '', bodyHtml: '', bodyText: '' })),
      );
      return this.getPages();
    }

    const byKey = new Map(existing.map((p) => [p.pageKey, p]));
    return LEGAL_PAGE_KEYS.map((key) => byKey.get(key)!);
  }

  async getPage(pageKey: LegalPageKey): Promise<LegalPage> {
    this.assertKnownKey(pageKey);

    const existing = await this.repo.findOne({ where: { pageKey } });
    if (existing) return existing;

    const created = this.repo.create({ pageKey, title: '', bodyHtml: '', bodyText: '' });
    return this.repo.save(created);
  }

  /**
   * Cached mirror of getPage() for the public GET legal/:pageKey read —
   * same reasoning as SeoService.getPublicPayload(), and caches the
   * MAPPED payload rather than the raw entity for the same reason that
   * method does: cache-manager's Redis store round-trips every value
   * through JSON, which silently turns `updatedAt` (a real Date on the
   * entity) into a plain string on a cache hit. Mapping before caching
   * means every path — cache hit or miss — returns the same already-a-
   * string shape, so there's no second, cache-only code path that can
   * call `.toISOString()` on something that's no longer a Date.
   */
  async getPublicPage(pageKey: LegalPageKey): Promise<LegalPagePayload> {
    this.assertKnownKey(pageKey);

    const cached = await this.cache.get<LegalPagePayload>(pageKey);
    if (cached) return cached;

    const page = await this.getPage(pageKey);
    const payload = this.mapper.toPayload(page);
    await this.cache.set(pageKey, payload);
    return payload;
  }

  async updatePage(pageKey: LegalPageKey, dto: UpdateLegalPageDto): Promise<LegalPage> {
    const page = await this.getPage(pageKey);

    Object.assign(page, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.bodyHtml !== undefined && {
        bodyHtml: dto.bodyHtml,
        bodyText: richTextToPlain(dto.bodyHtml) ?? '',
      }),
    });

    const saved = await this.repo.save(page);
    await this.cache.bust(pageKey);
    return saved;
  }
}
