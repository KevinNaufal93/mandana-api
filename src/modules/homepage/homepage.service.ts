import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HomepageRecommendation } from './entities/homepage-recommendation.entity';
import { HomepageCacheService } from './homepage-cache.service';
import { HeroService } from '../hero/hero.service';
import { CollectionsService } from '../collections/collections.service';
import { MediaService } from '../media/media.service';
import { SetRecommendationsDto } from './dto/set-recommendations.dto';

const CAROUSEL_INTERVAL_MS = 5000;

@Injectable()
export class HomepageService {
  constructor(
    @InjectRepository(HomepageRecommendation)
    private readonly recRepo: Repository<HomepageRecommendation>,
    private readonly heroService: HeroService,
    private readonly collectionsService: CollectionsService,
    private readonly mediaService: MediaService,
    private readonly cache: HomepageCacheService,
  ) {}

  async getHomepage() {
    const cached = await this.cache.get<object>();
    if (cached) return cached;

    const [slides, collections, recs] = await Promise.all([
      this.heroService.findActive(),
      this.collectionsService.findHomepage(),
      this.recRepo.find({
        relations: { property: { images: true, propertyType: true } },
        order: { sortOrder: 'ASC' },
      }),
    ]);

    const collectionCounts = await Promise.all(
      collections.map((c) => this.collectionsService.countProperties(c.id)),
    );

    const payload = {
      hero: {
        intervalMs: CAROUSEL_INTERVAL_MS,
        slides: slides.map((s) => ({
          id: s.id,
          title: s.title,
          subtitle: s.subtitle,
          ctaText: s.ctaText,
          ctaLink: s.ctaLink,
          sortOrder: s.sortOrder,
          image: this.mediaService.buildImageDto(s.mediaAsset),
        })),
      },
      collections: collections.map((c, i) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        sortOrder: c.sortOrder,
        propertyCount: collectionCounts[i],
        cover: c.coverMediaAsset
          ? this.mediaService.buildImageDto(c.coverMediaAsset)
          : null,
      })),
      recommendations: recs.map((r) => {
        const p = r.property;
        const cover = p.images?.find((img) => img.isCover) ?? p.images?.[0];
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          listingType: p.listingType,
          price: p.price,
          currency: p.currency,
          bedrooms: p.bedrooms,
          bathrooms: p.bathrooms,
          areaSqm: p.areaSqm,
          area: p.area,
          city: p.city,
          province: p.province,
          propertyType: p.propertyType
            ? { id: p.propertyType.id, name: p.propertyType.name, slug: p.propertyType.slug }
            : null,
          cover: cover ? { url: cover.url, alt: cover.alt } : null,
        };
      }),
    };

    await this.cache.set(payload);
    return payload;
  }

  async setRecommendations(dto: SetRecommendationsDto): Promise<HomepageRecommendation[]> {
    await this.recRepo.clear();
    const recs = dto.items.map((item) =>
      this.recRepo.create({ propertyId: item.propertyId, sortOrder: item.sortOrder }),
    );
    const saved = await this.recRepo.save(recs);
    await this.cache.bust();
    return saved;
  }

  async getRecommendations(): Promise<HomepageRecommendation[]> {
    return this.recRepo.find({
      relations: { property: true },
      order: { sortOrder: 'ASC' },
    });
  }
}
