import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HomepageRecommendation } from './entities/homepage-recommendation.entity';
import { HomepageCacheService } from './homepage-cache.service';
import { ContentBlocksService } from '../content-blocks/content-blocks.service';
import { ContentBlockType } from '../content-blocks/enums/content-block-type.enum';
import { CollectionsService } from '../collections/collections.service';
import { MediaService } from '../media/media.service';
import { Property } from '../properties/entities/property.entity';
import { PropertyMapper } from '../properties/property.mapper';
import { SetRecommendationsDto } from './dto/set-recommendations.dto';
import { richTextToPlain } from '../../common/rich-text';
import { PUBLIC_PROPERTY_STATUSES } from '../properties/enums/property-status.enum';

const CAROUSEL_INTERVAL_MS = 5000;
/** Same cap the old hand-picked list had (SetRecommendationsDto). */
const MAX_RECOMMENDATIONS = 12;

@Injectable()
export class HomepageService {
  constructor(
    @InjectRepository(HomepageRecommendation)
    private readonly recRepo: Repository<HomepageRecommendation>,
    @InjectRepository(Property)
    private readonly propertiesRepo: Repository<Property>,
    private readonly contentBlocksService: ContentBlocksService,
    private readonly collectionsService: CollectionsService,
    private readonly mediaService: MediaService,
    private readonly propertyMapper: PropertyMapper,
    private readonly cache: HomepageCacheService,
  ) {}

  async getHomepage() {
    const cached = await this.cache.get<object>();
    if (cached) return cached;

    const [slides, collections, serviceCards, recs] = await Promise.all([
      this.contentBlocksService.findActiveByType(ContentBlockType.HERO),
      this.collectionsService.findHomepage(),
      this.contentBlocksService.findActiveByType(ContentBlockType.SERVICE_CARD),
      this.findRecommended(),
    ]);

    const collectionCounts = await Promise.all(
      collections.map((c) => this.collectionsService.countProperties(c.id)),
    );

    // hero/services both read from the unified content_blocks table now
    // (see ContentBlocksService) — `ctaLink`/`description`/`href` below are
    // remapped from the entity's shared `link`/`subtitle` field names back
    // to their original public response names, so this payload's shape
    // (and any FE already consuming it) is unaffected by that merge.
    const payload = {
      hero: {
        intervalMs: CAROUSEL_INTERVAL_MS,
        slides: slides.map((s) => ({
          id: s.id,
          title: s.title,
          subtitle: s.subtitle,
          ctaText: s.ctaText,
          ctaLink: s.link,
          sortOrder: s.sortOrder,
          imageOnly: s.imageOnly,
          // mediaAsset is guaranteed non-null for a hero-type block — see
          // chk_content_blocks_hero_requires_media in the owning migration.
          image: this.mediaService.buildImageDto(s.mediaAsset!),
          // null (not omitted) when no mobile crop has been uploaded — the
          // web already treats null as "render image alone at every width".
          mobileImage: s.mobileMediaAsset
            ? this.mediaService.buildImageDto(s.mobileMediaAsset)
            : null,
        })),
      },
      collections: collections.map((c, i) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        descriptionText: richTextToPlain(c.description),
        sortOrder: c.sortOrder,
        propertyCount: collectionCounts[i],
        cover: c.coverMediaAsset
          ? this.mediaService.buildImageDto(c.coverMediaAsset)
          : null,
      })),
      services: serviceCards.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.subtitle,
        href: c.link,
        sortOrder: c.sortOrder,
        imageOnly: c.imageOnly,
        icon: c.mediaAsset
          ? this.mediaService.buildImageDto(c.mediaAsset)
          : null,
      })),
      recommendations: recs.map((p, i) => this.mapRecommendation(p, i)),
    };

    await this.cache.set(payload);
    return payload;
  }

  /**
   * Deprecated: writes the old hand-picked `homepage_recommendations`
   * table, which nothing reads any more — the homepage now shows the
   * Unggulan properties (see findRecommended). Kept so existing callers
   * don't 404; drop together with the table once nothing calls it.
   */
  async setRecommendations(
    dto: SetRecommendationsDto,
  ): Promise<HomepageRecommendation[]> {
    await this.recRepo.clear();
    const recs = dto.items.map((item) =>
      this.recRepo.create({
        propertyId: item.propertyId,
        sortOrder: item.sortOrder,
      }),
    );
    const saved = await this.recRepo.save(recs);
    await this.cache.bust();
    return saved;
  }

  async getRecommendations() {
    const recs = await this.findRecommended();
    return recs.map((p, i) => this.mapRecommendation(p, i));
  }

  /**
   * The homepage "Rekomendasi" carousel: every public property ticked
   * Unggulan (isFeatured) in the admin, most recently published first.
   * PropertiesService busts the homepage cache on every property save, so
   * ticking/unticking Unggulan or publishing shows up on the next load.
   */
  private findRecommended(): Promise<Property[]> {
    return this.propertiesRepo.find({
      where: { isFeatured: true, status: In(PUBLIC_PROPERTY_STATUSES) },
      relations: { images: { mediaAsset: true }, propertyType: true },
      order: {
        publishedAt: { direction: 'DESC', nulls: 'LAST' },
        createdAt: 'DESC',
      },
      take: MAX_RECOMMENDATIONS,
    });
  }

  /** Shared shape for a recommended property — public homepage + admin list.
   *  `sortOrder` is kept (as the list position) so the payload shape is
   *  unchanged from the hand-picked list it replaced. */
  private mapRecommendation(p: Property, position: number) {
    return {
      ...this.propertyMapper.toCard(p),
      sortOrder: position,
    };
  }
}
