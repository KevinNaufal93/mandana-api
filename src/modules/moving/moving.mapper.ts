import { Injectable } from '@nestjs/common';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MediaService } from '../media/media.service';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { richTextToPlain } from '../../common/rich-text';
import {
  MovingAddonDto,
  MovingSettingsDto,
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

  private buildImage(asset: MediaAsset | null): TruckImageDto | null {
    return asset ? this.mediaService.buildImageDto(asset) : null;
  }

  toDto(t: TruckClass): TruckClassDto {
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      descriptionText: richTextToPlain(t.description),
      capacityKg: t.capacityKg,
      volumeM3: toNumber(t.volumeM3),
      dimensions: this.buildDimensions(t),
      helperCount: t.helperCount,
      baseFare: t.baseFare,
      perKmFare: t.perKmFare,
      includedKm: t.includedKm,
      minFare: t.minFare,
      image: this.buildImage(t.mediaAsset),
      isActive: t.isActive,
      sortOrder: t.sortOrder,
    };
  }

  toAddonDto(a: MovingAddon): MovingAddonDto {
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      description: a.description,
      descriptionText: richTextToPlain(a.description),
      kind: a.kind,
      pricingModel: a.pricingModel,
      unitPrice: a.unitPrice,
      percentBps: a.percentBps,
      minCharge: a.minCharge,
      maxCharge: a.maxCharge,
      unitLabel: a.unitLabel,
      minQty: a.minQty,
      maxQty: a.maxQty,
      doublesOnRoundTrip: a.doublesOnRoundTrip,
      image: this.buildImage(a.mediaAsset),
      isActive: a.isActive,
      sortOrder: a.sortOrder,
    };
  }

  toSettingsDto(s: MovingSettings): MovingSettingsDto {
    return {
      roundToIdr: s.roundToIdr,
      bandPct: s.bandPct,
      defaultIncludedKm: s.defaultIncludedKm,
    };
  }
}
