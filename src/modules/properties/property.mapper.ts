import { Injectable } from '@nestjs/common';
import { Property } from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { MediaService, MediaImageDto } from '../media/media.service';
import { fuzzCoordinates, APPROX_RADIUS_M } from './location-privacy';

export interface PropertyCard {
  id: string;
  slug: string;
  title: string;
  listingType: string;
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
  latitude: number | null;
  longitude: number | null;
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
    if (cover.mediaAsset)
      return this.mediaService.buildImageDto(cover.mediaAsset);
    return { url: cover.url ?? '', alt: cover.alt };
  }

  private buildImage(img: PropertyImage) {
    const base = img.mediaAsset
      ? this.mediaService.buildImageDto(img.mediaAsset)
      : { url: img.url ?? '', srcset: '', alt: img.alt, width: 0, height: 0 };
    return {
      ...base,
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
