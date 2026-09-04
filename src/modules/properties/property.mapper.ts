import { Injectable } from '@nestjs/common';
import { Property } from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { PropertyStatus } from './enums/property-status.enum';
import { ConstructionStatus } from './enums/construction-status.enum';
import { MediaService, MediaImageDto } from '../media/media.service';
import { fuzzCoordinates, APPROX_RADIUS_M } from './location-privacy';
import { richTextToPlain } from '../../common/rich-text';
import { PropertyPromoCard } from './property-promo.mapper';

export interface PropertyCard {
  id: string;
  slug: string;
  title: string;
  listingType: string;
  /** Handover/completion date (YYYY-MM-DD). Only meaningful when listingType is "new". */
  handoverDate: string | null;
  /** Only meaningful when listingType is "new". */
  constructionStatus: ConstructionStatus | null;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  area: string | null;
  city: string | null;
  province: string | null;
  propertyType: { id: string; name: string; slug: string } | null;
  cover: { url: string; alt: string | null } | MediaImageDto | null;
}

interface PropertyDetailBase extends PropertyCard {
  description: string | null;
  /** Plain-text derivative of `description` (HTML stripped) — SEO meta, share previews. */
  descriptionText: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Missing from PropertyCard on purpose (the public card list never
   * needs it — every public query already filters to PUBLISHED). Detail
   * responses need it though: the admin detail view gates editing on it,
   * and findBySlug's PUBLISHED-only filter means the public detail
   * response always carries the same literal value, so exposing it there
   * too is harmless.
   */
  status: PropertyStatus;
  isFeatured: boolean;
  images: Array<
    MediaImageDto & { id: string; isCover: boolean; sortOrder: number }
  >;
  amenities: Array<{
    id: string;
    slug: string;
    name: string;
    icon: string | null;
    category: string | null;
  }>;
  agent: {
    id: string;
    name: string;
    title: string | null;
    phone: string | null;
    whatsapp: string | null;
    photo: MediaImageDto | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `exact` (admin) carries the real `address` and unmodified coordinates.
 * `approximate` (public) has no `address` key at all and coordinates are
 * fuzzed within `approximateRadiusM` metres — see `location-privacy.ts`.
 */
export type PropertyDetail =
  | (PropertyDetailBase & {
      locationPrecision: 'exact';
      address: string | null;
    })
  | (PropertyDetailBase & {
      locationPrecision: 'approximate';
      approximateRadiusM: number;
    });

/**
 * The public `GET /properties/:slug` response: `toDetail(..., { exact:
 * false })` plus admin-managed promo cards. Assembled in
 * `PropertiesService.findBySlug` — kept out of `PropertyMapper.toDetail`
 * itself so that method stays synchronous and pure, and so `adminFindOne`
 * (which shares `toDetail` but always passes `{ exact: true }`) never
 * grows a `promoCards` key it has no use for.
 */
export type PublicPropertyDetail = PropertyDetail & {
  promoCards: PropertyPromoCard[];
};

/** Numeric/decimal Postgres columns come back from `pg` as strings — normalize them. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

@Injectable()
export class PropertyMapper {
  constructor(private readonly mediaService: MediaService) {}

  private buildCover(p: Property): PropertyCard['cover'] {
    const images = p.images ?? [];
    const cover = images.find((img) => img.isCover) ?? images[0];
    if (!cover) return null;
    if (cover.mediaAsset) {
      const dto = this.mediaService.buildImageDto(cover.mediaAsset);
      // Prefer this PropertyImage's own alt (property-specific caption) over
      // the underlying MediaAsset's alt (its generic, upload-time default) —
      // otherwise editing an image's alt text via updateImage()/the images
      // batch on PATCH silently never shows up in any read response.
      return { ...dto, alt: cover.alt ?? dto.alt };
    }
    return { url: cover.url ?? '', alt: cover.alt };
  }

  private buildImage(img: PropertyImage) {
    if (img.mediaAsset) {
      const dto = this.mediaService.buildImageDto(img.mediaAsset);
      return {
        ...dto,
        alt: img.alt ?? dto.alt,
        id: img.id,
        isCover: img.isCover,
        sortOrder: img.sortOrder,
      };
    }
    return {
      url: img.url ?? '',
      srcset: '',
      srcsetAvif: '',
      placeholder: null,
      alt: img.alt,
      width: 0,
      height: 0,
      id: img.id,
      isCover: img.isCover,
      sortOrder: img.sortOrder,
    };
  }

  toCard(p: Property): PropertyCard {
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      listingType: p.listingType,
      handoverDate: p.handoverDate,
      constructionStatus: p.constructionStatus,
      price: toNumber(p.price),
      currency: p.currency,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      areaSqm: toNumber(p.areaSqm),
      area: p.area,
      city: p.city,
      province: p.province,
      propertyType: p.propertyType
        ? {
            id: p.propertyType.id,
            name: p.propertyType.name,
            slug: p.propertyType.slug,
          }
        : null,
      cover: this.buildCover(p),
    };
  }

  /**
   * `exact: true` (admin) returns the real address and unmodified coordinates.
   * `exact: false` (public) drops `address` and fuzzes the coordinates within
   * a ~300m radius — see `location-privacy.ts` for why that's real privacy
   * and not just a client-side styling choice.
   */
  toDetail(p: Property, opts: { exact: boolean }): PropertyDetail {
    const base = {
      ...this.toCard(p),
      description: p.description,
      descriptionText: p.descriptionText ?? richTextToPlain(p.description),
      status: p.status,
      isFeatured: p.isFeatured,
      images: (p.images ?? [])
        .slice()
        .sort(
          (a, b) =>
            Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder,
        )
        .map((img) => this.buildImage(img)),
      amenities: (p.amenities ?? []).map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        icon: a.icon,
        category: a.category,
      })),
      agent: p.agent
        ? {
            id: p.agent.id,
            name: p.agent.name,
            title: p.agent.title,
            phone: p.agent.phone,
            whatsapp: p.agent.whatsapp,
            photo: p.agent.photoMediaAsset
              ? this.mediaService.buildImageDto(p.agent.photoMediaAsset)
              : null,
          }
        : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };

    if (opts.exact) {
      return {
        ...base,
        address: p.address,
        latitude: toNumber(p.latitude),
        longitude: toNumber(p.longitude),
        locationPrecision: 'exact',
      };
    }

    const { latitude, longitude } = this.fuzzLocation(p);
    return {
      ...base,
      latitude,
      longitude,
      locationPrecision: 'approximate',
      approximateRadiusM: APPROX_RADIUS_M,
    };
  }

  /**
   * Applies the same public location privacy as `toDetail({ exact: false })`
   * to a raw entity — used by the `GET /properties` list, which (unlike
   * `toCard`) returns full entities rather than the mapped card shape.
   * Mutates and returns `property` so it composes with the image-enrichment
   * mutation `PropertiesService` already does on the same object.
   */
  applyListLocationPrivacy(property: Property): Property {
    const { latitude, longitude } = this.fuzzLocation(property);
    property.latitude = latitude;
    property.longitude = longitude;

    const enriched = property as Property & {
      locationPrecision: 'approximate';
      approximateRadiusM: number;
    };
    enriched.locationPrecision = 'approximate';
    enriched.approximateRadiusM = APPROX_RADIUS_M;

    // Deleting keeps the field genuinely absent from the JSON response
    // (not just null) — the `address` column is typed as required on the
    // entity, so the delete has to go through an untyped view of it.
    delete (property as unknown as Record<string, unknown>).address;

    return property;
  }

  private fuzzLocation(p: Property): {
    latitude: number | null;
    longitude: number | null;
  } {
    const lat = toNumber(p.latitude);
    const lng = toNumber(p.longitude);
    if (lat === null || lng === null)
      return { latitude: null, longitude: null };
    return fuzzCoordinates(lat, lng, p.id);
  }
}
