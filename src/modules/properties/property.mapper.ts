import { Injectable } from '@nestjs/common';
import { Property } from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { MediaService, MediaImageDto } from '../media/media.service';

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

export interface PropertyDetail extends PropertyCard {
  description: string | null;
  address: string | null;
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

  toDetail(p: Property): PropertyDetail {
    return {
      ...this.toCard(p),
      description: p.description,
      address: p.address,
      latitude: toNumber(p.latitude),
      longitude: toNumber(p.longitude),
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
  }
}
