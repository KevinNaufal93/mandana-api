import { Injectable } from '@nestjs/common';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageBooking } from './entities/storage-booking.entity';
import { MediaService } from '../media/media.service';
import {
  StorageAvailabilityFacilityDto,
  StorageBookingAdminDto,
  StorageBookingCreatedEventDto,
  StorageBookingDto,
  StorageBookingUpdatedEventDto,
  StorageDimensionsDto,
  StorageFacilityDto,
  StorageImageDto,
  StorageInventoryDto,
  StorageUnitTypeDto,
} from './dto/storage-response.dto';

/** Numeric/decimal Postgres columns come back from `pg` as strings — normalize them. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

@Injectable()
export class StorageMapper {
  constructor(private readonly mediaService: MediaService) {}

  private buildImage(
    mediaAsset: StorageUnitType['mediaAsset'],
  ): StorageImageDto | null {
    return mediaAsset ? this.mediaService.buildImageDto(mediaAsset) : null;
  }

  // ─── Unit types ─────────────────────────────────────────────────────────

  private buildDimensions(u: StorageUnitType): StorageDimensionsDto | null {
    if (u.lengthCm === null || u.widthCm === null || u.heightCm === null) {
      return null;
    }
    return { lengthCm: u.lengthCm, widthCm: u.widthCm, heightCm: u.heightCm };
  }

  toUnitTypeDto(u: StorageUnitType): StorageUnitTypeDto {
    return {
      id: u.id,
      slug: u.slug,
      name: u.name,
      description: u.description,
      volumeM3: toNumber(u.volumeM3),
      dimensions: this.buildDimensions(u),
      monthlyRate: u.monthlyRate,
      minDurationMonths: u.minDurationMonths,
      image: this.buildImage(u.mediaAsset),
      isActive: u.isActive,
      sortOrder: u.sortOrder,
    };
  }

  // ─── Facilities ─────────────────────────────────────────────────────────

  toFacilityDto(f: StorageFacility): StorageFacilityDto {
    return {
      id: f.id,
      slug: f.slug,
      name: f.name,
      description: f.description,
      address: f.address,
      area: f.area,
      city: f.city,
      province: f.province,
      latitude: toNumber(f.latitude),
      longitude: toNumber(f.longitude),
      image: this.buildImage(f.mediaAsset),
      isActive: f.isActive,
      sortOrder: f.sortOrder,
    };
  }

  // ─── Inventory (admin) ───────────────────────────────────────────────────

  toInventoryDto(inv: StorageInventory): StorageInventoryDto {
    return {
      id: inv.id,
      facilityId: inv.facilityId,
      facilitySlug: inv.facility.slug,
      unitTypeId: inv.unitTypeId,
      unitTypeSlug: inv.unitType.slug,
      totalUnits: inv.totalUnits,
      occupiedUnits: inv.occupiedUnits,
      availableUnits: Math.max(0, inv.totalUnits - inv.occupiedUnits),
      monthlyRateOverride: inv.monthlyRateOverride,
      isActive: inv.isActive,
    };
  }

  // ─── Availability snapshot — counts only, shared by both public and admin
  // streams, and by the polling endpoint. Never include customer data here;
  // the public stream is @Public() and anyone can open it. ─────────────────

  buildAvailabilityFacilities(
    rows: StorageInventory[],
  ): StorageAvailabilityFacilityDto[] {
    const byFacility = new Map<string, StorageAvailabilityFacilityDto>();

    for (const row of rows) {
      let entry = byFacility.get(row.facility.slug);
      if (!entry) {
        entry = {
          facilitySlug: row.facility.slug,
          facilityName: row.facility.name,
          units: [],
        };
        byFacility.set(row.facility.slug, entry);
      }
      entry.units.push({
        unitTypeSlug: row.unitType.slug,
        total: row.totalUnits,
        available: Math.max(0, row.totalUnits - row.occupiedUnits),
        monthlyRate: row.monthlyRateOverride ?? row.unitType.monthlyRate,
      });
    }

    return [...byFacility.values()];
  }

  // ─── Bookings ─────────────────────────────────────────────────────────────

  /**
   * Indonesian confirmation message, styled after
   * lib/moving/whatsapp.ts's buildMovingWaMessage() in the frontend repo.
   * Plain text, not URL-encoded — the FE combines it with its own
   * NEXT_PUBLIC_MANDANA_WHATSAPP number (see StorageBookingDto.whatsappMessage).
   */
  buildWhatsAppMessage(booking: StorageBooking): string {
    const money = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
    const lines = [
      'Halo Mandana, saya baru saja mengajukan booking Smart Storage.',
      '',
      `No. Referensi: ${booking.reference}`,
      `Lokasi: ${booking.facility.name}`,
      `Ukuran: ${booking.unitType.name} x${booking.quantity}`,
      `Mulai: ${booking.startDate} (${booking.durationMonths} bulan)`,
      `Total: ${money(booking.total)}`,
      '',
      'Mohon konfirmasi ketersediaan dan langkah selanjutnya.',
    ];
    return lines.join('\n');
  }

  toBookingDto(booking: StorageBooking): StorageBookingDto {
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      customerName: booking.customerName,
      email: booking.email,
      phone: booking.phone,
      facilitySlug: booking.facility.slug,
      facilityName: booking.facility.name,
      unitTypeSlug: booking.unitType.slug,
      unitTypeName: booking.unitType.name,
      quantity: booking.quantity,
      startDate: booking.startDate,
      durationMonths: booking.durationMonths,
      endDate: booking.endDate,
      monthlyRate: booking.monthlyRate,
      subtotal: booking.subtotal,
      discountAmount: booking.discountAmount,
      total: booking.total,
      currency: 'IDR',
      createdAt: booking.createdAt,
      whatsappMessage: this.buildWhatsAppMessage(booking),
    };
  }

  toAdminBookingDto(booking: StorageBooking): StorageBookingAdminDto {
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      customerName: booking.customerName,
      email: booking.email,
      phone: booking.phone,
      notes: booking.notes,
      facilitySlug: booking.facility.slug,
      facilityName: booking.facility.name,
      unitTypeSlug: booking.unitType.slug,
      unitTypeName: booking.unitType.name,
      quantity: booking.quantity,
      startDate: booking.startDate,
      durationMonths: booking.durationMonths,
      endDate: booking.endDate,
      monthlyRate: booking.monthlyRate,
      subtotal: booking.subtotal,
      discountAmount: booking.discountAmount,
      total: booking.total,
      adminNote: booking.adminNote,
      confirmedAt: booking.confirmedAt
        ? booking.confirmedAt.toISOString()
        : null,
      confirmedByName: booking.confirmedBy?.name ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  toBookingCreatedEvent(
    booking: StorageBooking,
  ): StorageBookingCreatedEventDto {
    return {
      reference: booking.reference,
      facilitySlug: booking.facility.slug,
      facilityName: booking.facility.name,
      unitTypeSlug: booking.unitType.slug,
      unitTypeName: booking.unitType.name,
      quantity: booking.quantity,
      customerName: booking.customerName,
      total: booking.total,
      createdAt: booking.createdAt.toISOString(),
    };
  }

  toBookingUpdatedEvent(
    booking: StorageBooking,
  ): StorageBookingUpdatedEventDto {
    return {
      reference: booking.reference,
      status: booking.status,
      confirmedByName: booking.confirmedBy?.name ?? null,
      updatedAt: booking.updatedAt.toISOString(),
    };
  }
}
