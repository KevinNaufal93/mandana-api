import { Injectable } from '@nestjs/common';
import { TruckClass } from './entities/truck-class.entity';
import { MediaService } from '../media/media.service';
import {
  TruckClassDto,
  TruckDimensionsDto,
  TruckImageDto,
} from './dto/truck-class-response.dto';

/** Numeric/decimal Postgres columns come back from `pg` as strings — normalize them. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

@Injectable()
export class MovingMapper {
  constructor(private readonly mediaService: MediaService) {}

  private buildDimensions(t: TruckClass): TruckDimensionsDto | null {
    if (t.lengthCm === null || t.widthCm === null || t.heightCm === null) {
      return null;
    }
    return { lengthCm: t.lengthCm, widthCm: t.widthCm, heightCm: t.heightCm };
  }

  private buildImage(t: TruckClass): TruckImageDto | null {
    return t.mediaAsset ? this.mediaService.buildImageDto(t.mediaAsset) : null;
  }

  toDto(t: TruckClass): TruckClassDto {
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      capacityKg: t.capacityKg,
      volumeM3: toNumber(t.volumeM3),
      dimensions: this.buildDimensions(t),
      helperCount: t.helperCount,
      baseFare: t.baseFare,
      perKmFare: t.perKmFare,
      includedKm: t.includedKm,
      minFare: t.minFare,
      image: this.buildImage(t),
      isActive: t.isActive,
      sortOrder: t.sortOrder,
    };
  }
}
