import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoSettings } from './entities/seo-settings.entity';
import { PageSeo } from './entities/page-seo.entity';
import {
  SEO_PAGES,
  SEO_PAGE_KEYS,
  SeoPageKey,
} from './enums/seo-page-key.enum';
import { UpdateSeoSettingsDto } from './dto/update-seo-settings.dto';
import { UpdatePageSeoDto } from './dto/update-page-seo.dto';
import { SeoCacheService } from './seo-cache.service';
import { SeoMapper, SeoSettingsPayload, PageSeoPayload } from './seo.mapper';

export interface SeoPublicPayload {
  settings: SeoSettingsPayload;
  pages: PageSeoPayload[];
}

/**
 * Reads/writes the SEO settings singleton and the 8 fixed page_seo rows.
 * Both auto-seed on read — the settings row the same way
 * MovingSettingsService.get() does (a quote must never 500 for missing
 * pricing config; a page must never 500 for missing SEO config), the page
 * rows defensively per-key (the real initial copy comes from the
 * migration's seed — see AddSeo's own comment — this only guards a DB
 * restored before that migration ran, or a page added to SEO_PAGES
 * without a matching migration yet: a row with null fields is safe, since
 * the web app's own buildPageMetadata() falls back to its hardcoded
 * default whenever a field is null).
 */
@Injectable()
export class SeoService {
  constructor(
    @InjectRepository(SeoSettings)
    private readonly settingsRepo: Repository<SeoSettings>,
    @InjectRepository(PageSeo)
    private readonly pageRepo: Repository<PageSeo>,
    private readonly mapper: SeoMapper,
    private readonly cache: SeoCacheService,
  ) {}

  async getSettings(): Promise<SeoSettings> {
    const existing = await this.settingsRepo.findOne({
      where: { singleton: true },
      relations: { defaultOgMediaAsset: true },
    });
    if (existing) return existing;

    const created = this.settingsRepo.create({ singleton: true });
    return this.settingsRepo.save(created);
  }

  async updateSettings(dto: UpdateSeoSettingsDto): Promise<SeoSettings> {
    const settings = await this.getSettings();

    Object.assign(settings, {
      ...(dto.organizationName !== undefined && {
        organizationName: dto.organizationName,
      }),
      ...(dto.contactPhone !== undefined && {
        contactPhone: dto.contactPhone || null,
      }),
      ...(dto.contactEmail !== undefined && {
        contactEmail: dto.contactEmail || null,
      }),
      ...(dto.streetAddress !== undefined && {
        streetAddress: dto.streetAddress || null,
      }),
      ...(dto.addressLocality !== undefined && {
        addressLocality: dto.addressLocality || null,
      }),
      ...(dto.addressRegion !== undefined && {
        addressRegion: dto.addressRegion || null,
      }),
      ...(dto.postalCode !== undefined && {
        postalCode: dto.postalCode || null,
      }),
      ...(dto.socialLinks !== undefined && { socialLinks: dto.socialLinks }),
      ...(dto.googleSiteVerification !== undefined && {
        googleSiteVerification: dto.googleSiteVerification || null,
      }),
      ...(dto.bingSiteVerification !== undefined && {
        bingSiteVerification: dto.bingSiteVerification || null,
      }),
      ...(dto.defaultOgMediaAssetId !== undefined && {
        defaultOgMediaAssetId: dto.defaultOgMediaAssetId || null,
      }),
    });

    const saved = await this.settingsRepo.save(settings);
    await this.cache.bust();

    // Re-fetch: `settings.defaultOgMediaAsset` is stale after changing
    // `defaultOgMediaAssetId` above (still the pre-save relation, or
    // undefined) — the mapper needs the fresh relation loaded.
    return this.settingsRepo.findOneOrFail({
      where: { id: saved.id },
      relations: { defaultOgMediaAsset: true },
    });
  }

  /** All 8 rows, in SEO_PAGES' declared order (not DB order) so the admin
   *  list is stable. Auto-seeds any key missing a row — see this class's
   *  own doc comment. */
  async getPages(): Promise<PageSeo[]> {
    const existing = await this.pageRepo.find({
      relations: { ogMediaAsset: true },
    });
    const existingKeys = new Set(existing.map((p) => p.pageKey));
    const missing = SEO_PAGE_KEYS.filter((key) => !existingKeys.has(key));

    if (missing.length > 0) {
      await this.pageRepo.insert(
        missing.map((pageKey) => ({ pageKey, noIndex: false })),
      );
      return this.getPages();
    }

    const byKey = new Map(existing.map((p) => [p.pageKey, p]));
    return SEO_PAGE_KEYS.map((key) => byKey.get(key)!);
  }

  private assertKnownKey(pageKey: SeoPageKey): void {
    if (!SEO_PAGE_KEYS.includes(pageKey)) {
      throw new NotFoundException(`Unknown SEO page key "${pageKey}"`);
    }
  }

  async getPage(pageKey: SeoPageKey): Promise<PageSeo> {
    this.assertKnownKey(pageKey);

    const existing = await this.pageRepo.findOne({
      where: { pageKey },
      relations: { ogMediaAsset: true },
    });
    if (existing) return existing;

    const created = this.pageRepo.create({ pageKey, noIndex: false });
    return this.pageRepo.save(created);
  }

  async updatePage(
    pageKey: SeoPageKey,
    dto: UpdatePageSeoDto,
  ): Promise<PageSeo> {
    this.assertKnownKey(pageKey);

    // Structurally impossible to accidentally hide the homepage from
    // Google in one click — the one page this module refuses to noindex,
    // regardless of who's asking. See SEO_PAGES' `canHide`.
    const meta = SEO_PAGES.find((p) => p.key === pageKey)!;
    if (dto.noIndex === true && !meta.canHide) {
      throw new BadRequestException(
        `The "${meta.label}" page cannot be hidden from Google.`,
      );
    }

    const page = await this.getPage(pageKey);

    Object.assign(page, {
      ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle || null }),
      ...(dto.metaDescription !== undefined && {
        metaDescription: dto.metaDescription || null,
      }),
      ...(dto.heading !== undefined && { heading: dto.heading || null }),
      ...(dto.noIndex !== undefined && { noIndex: dto.noIndex }),
      ...(dto.ogMediaAssetId !== undefined && {
        ogMediaAssetId: dto.ogMediaAssetId || null,
      }),
    });

    const saved = await this.pageRepo.save(page);
    await this.cache.bust();

    return this.pageRepo.findOneOrFail({
      where: { id: saved.id },
      relations: { ogMediaAsset: true },
    });
  }

  /** The one public read (`GET /seo`) — settings + every page, Redis-cached.
   *  Never throws: both getSettings()/getPages() auto-seed rather than 404,
   *  so this can never be the reason a page fails to render on the web side. */
  async getPublicPayload(): Promise<SeoPublicPayload> {
    const cached = await this.cache.get<SeoPublicPayload>();
    if (cached) return cached;

    const [settings, pages] = await Promise.all([
      this.getSettings(),
      this.getPages(),
    ]);
    const payload: SeoPublicPayload = {
      settings: this.mapper.toSettingsPayload(settings),
      pages: pages.map((p) => this.mapper.toPagePayload(p)),
    };

    await this.cache.set(payload);
    return payload;
  }
}
