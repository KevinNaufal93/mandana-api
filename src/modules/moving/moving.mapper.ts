import { Injectable } from '@nestjs/common';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingLead } from './entities/moving-lead.entity';
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
import {
  MovingLeadAdminDto,
  MovingLeadDto,
} from './dto/moving-lead-response.dto';

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

  // ─── Moving leads ────────────────────────────────────────────────────────
  // Request/response field is `destinations` (matches the product's own
  // language); the DB relation is `stops` (matches EventBookingItem-style
  // internal naming) — this is where that naming bridges. Every lat/lng/km
  // column is `numeric`, so each one routes through toNumber() to undo the
  // pg-returns-strings-for-numeric quirk (same as TruckClass.volumeM3 above).

  toLeadDto(lead: MovingLead): MovingLeadDto {
    return {
      id: lead.id,
      reference: lead.reference,
      status: lead.status,
      truckSlug: lead.truckSlug,
      truckName: lead.truckName,
      pickupAddress: lead.pickupAddress,
      pickupLat: toNumber(lead.pickupLat) ?? lead.pickupLat,
      pickupLng: toNumber(lead.pickupLng) ?? lead.pickupLng,
      destinations: [...lead.stops]
        .sort((a, b) => a.stopIndex - b.stopIndex)
        .map((s) => ({
          stopIndex: s.stopIndex,
          address: s.address,
          lat: toNumber(s.lat) ?? s.lat,
          lng: toNumber(s.lng) ?? s.lng,
        })),
      distanceKm: toNumber(lead.distanceKm) ?? lead.distanceKm,
      includedKm: lead.includedKm,
      chargeableKm: toNumber(lead.chargeableKm) ?? lead.chargeableKm,
      roundTrip: lead.roundTrip,
      tollRoute: lead.tollRoute,
      declaredValue: lead.declaredValue,
      baseFare: lead.baseFare,
      distanceFare: lead.distanceFare,
      travelSubtotal: lead.travelSubtotal,
      tollFare: lead.tollFare,
      addons: lead.addons.map((a) => ({
        slug: a.addonSlug,
        name: a.addonName,
        quantity: a.quantity,
        unitPrice: a.unitPrice,
        amount: a.amount,
      })),
      addonsTotal: lead.addonsTotal,
      subtotal: lead.subtotal,
      total: lead.total,
      minFareApplied: lead.minFareApplied,
      lowEstimate: lead.lowEstimate,
      highEstimate: lead.highEstimate,
      legs: [...lead.legs]
        .sort((a, b) => a.legIndex - b.legIndex)
        .map((l) => ({
          distanceKm: toNumber(l.distanceKm) ?? l.distanceKm,
          includedKm: l.includedKm,
          chargeableKm: toNumber(l.chargeableKm) ?? l.chargeableKm,
          baseFare: l.baseFare,
          distanceFare: l.distanceFare,
          subtotal: l.subtotal,
        })),
      currency: 'IDR',
      customerName: lead.customerName,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
      createdAt: lead.createdAt,
    };
  }

  toLeadAdminDto(lead: MovingLead): MovingLeadAdminDto {
    return {
      ...this.toLeadDto(lead),
      adminNote: lead.adminNote,
      updatedAt: lead.updatedAt,
    };
  }
}
