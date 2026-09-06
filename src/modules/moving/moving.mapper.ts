import { Injectable } from '@nestjs/common';
import { TruckClass } from './entities/truck-class.entity';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingSettings } from './entities/moving-settings.entity';
import { MovingBooking } from './entities/moving-booking.entity';
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
  MovingBookingAdminDto,
  MovingBookingDto,
} from './dto/moving-booking-response.dto';

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
      mediaAssetId: t.mediaAssetId,
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
      mediaAssetId: a.mediaAssetId,
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

  // ─── Moving bookings ────────────────────────────────────────────────────
  // Request/response field is `destinations` (matches the product's own
  // language); the DB relation is `stops` (matches EventBookingItem-style
  // internal naming) — this is where that naming bridges. Every lat/lng/km
  // column is `numeric`, so each one routes through toNumber() to undo the
  // pg-returns-strings-for-numeric quirk (same as TruckClass.volumeM3 above).

  toBookingDto(booking: MovingBooking): MovingBookingDto {
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      truckSlug: booking.truckSlug,
      truckName: booking.truckName,
      pickupAddress: booking.pickupAddress,
      pickupLat: toNumber(booking.pickupLat) ?? booking.pickupLat,
      pickupLng: toNumber(booking.pickupLng) ?? booking.pickupLng,
      destinations: [...booking.stops]
        .sort((a, b) => a.stopIndex - b.stopIndex)
        .map((s) => ({
          stopIndex: s.stopIndex,
          address: s.address,
          lat: toNumber(s.lat) ?? s.lat,
          lng: toNumber(s.lng) ?? s.lng,
        })),
      distanceKm: toNumber(booking.distanceKm) ?? booking.distanceKm,
      includedKm: booking.includedKm,
      chargeableKm: toNumber(booking.chargeableKm) ?? booking.chargeableKm,
      roundTrip: booking.roundTrip,
      tollRoute: booking.tollRoute,
      declaredValue: booking.declaredValue,
      baseFare: booking.baseFare,
      distanceFare: booking.distanceFare,
      travelSubtotal: booking.travelSubtotal,
      tollFare: booking.tollFare,
      addons: booking.addons.map((a) => ({
        slug: a.addonSlug,
        name: a.addonName,
        quantity: a.quantity,
        unitPrice: a.unitPrice,
        amount: a.amount,
      })),
      addonsTotal: booking.addonsTotal,
      subtotal: booking.subtotal,
      total: booking.total,
      minFareApplied: booking.minFareApplied,
      lowEstimate: booking.lowEstimate,
      highEstimate: booking.highEstimate,
      legs: [...booking.legs]
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
      customerName: booking.customerName,
      phone: booking.phone,
      email: booking.email,
      notes: booking.notes,
      createdAt: booking.createdAt,
    };
  }

  toBookingAdminDto(booking: MovingBooking): MovingBookingAdminDto {
    return {
      ...this.toBookingDto(booking),
      adminNote: booking.adminNote,
      confirmedAt: booking.confirmedAt
        ? booking.confirmedAt.toISOString()
        : null,
      confirmedByName: booking.confirmedBy?.name ?? null,
      updatedAt: booking.updatedAt,
    };
  }
}
