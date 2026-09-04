import { Injectable, Logger } from '@nestjs/common';
import { MediaService, MediaImageDto } from '../media/media.service';
import { ContentBlock } from '../content-blocks/entities/content-block.entity';

/**
 * Public shape of a property_promo content block as it appears in
 * `promoCards` on `GET /properties/:slug`. Field renames follow the same
 * precedent `HomepageService` already set when it re-exposed
 * `content_blocks` rows under their original public names (`subtitle` ->
 * `description`/`body`, `link` -> `href`/`ctaLink`) — a property-detail
 * response naming decision, which is why this mapper lives in
 * `properties/` rather than `content-blocks/`.
 */
export interface PropertyPromoCard {
  id: string;
  title: string | null;
  /** ContentBlock.subtitle, renamed for this surface. */
  body: string | null;
  ctaText: string | null;
  /** ContentBlock.link, renamed for this surface. */
  ctaLink: string | null;
  imageOnly: boolean;
  sortOrder: number;
  image: MediaImageDto | null;
}

/**
 * A dedicated, directly unit-testable class rather than a private method
 * on PropertyMapper or PropertiesService: PropertiesService already has a
 * wide constructor, and the graceful-image-degradation branch below is the
 * highest-risk logic in this feature — it needs a plain
 * `new PropertyPromoMapper(stubbedMediaService)` test, not a full Nest
 * testing module.
 */
@Injectable()
export class PropertyPromoMapper {
  private readonly logger = new Logger(PropertyPromoMapper.name);

  constructor(private readonly mediaService: MediaService) {}

  toCards(blocks: ContentBlock[]): PropertyPromoCard[] {
    return blocks
      .map((b) => this.toCard(b))
      .filter((c): c is PropertyPromoCard => c !== null);
  }

  private toCard(block: ContentBlock): PropertyPromoCard | null {
    let image: MediaImageDto | null = null;
    if (block.mediaAsset) {
      try {
        image = this.mediaService.buildImageDto(block.mediaAsset);
      } catch (err) {
        // buildImageDto() throws InternalServerErrorException when an
        // asset has zero usable variants (a half-failed upload). On
        // GET /homepage that's an acceptable 500 — the whole page is that
        // content, and it's cached. GET /properties/:slug is uncached,
        // SEO-facing, and promo cards are a decorative sidebar element on
        // it — one bad promo image must never take the property page down
        // with it. Log and degrade instead, deliberately diverging from
        // HomepageService's let-it-throw behavior.
        this.logger.error(
          `Dropping image on property_promo block ${block.id}: unusable media asset`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // An image-only card with no renderable image is nothing at all — the
    // same reasoning behind chk_content_blocks_image_only_requires_media.
    if (block.imageOnly && image === null) return null;

    return {
      id: block.id,
      title: block.title,
      body: block.subtitle,
      ctaText: block.ctaText,
      ctaLink: block.link,
      imageOnly: block.imageOnly,
      sortOrder: block.sortOrder,
      image,
    };
  }
}
