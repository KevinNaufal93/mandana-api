import { Injectable } from '@nestjs/common';
import { StorageUnitType } from './entities/storage-unit-type.entity';
import { StorageFacility } from './entities/storage-facility.entity';
import { StorageInventory } from './entities/storage-inventory.entity';
import { StorageUnit } from './entities/storage-unit.entity';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageUnitStatus } from './enums/storage-unit-status.enum';
import { MediaService } from '../media/media.service';
import {
  StorageAvailabilityFacilityDto,
  StorageAvailabilityLayoutUnitDto,
  StorageBookingAdminDto,
  StorageBookingCreatedEventDto,
  StorageBookingDto,
  StorageBookingUpdatedEventDto,
  StorageDimensionsDto,
  StorageFacilityDto,
  StorageImageDto,
  StorageInventoryDto,
  StorageUnitDto,
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
      monthlyRateOverride: inv.monthlyRateOverride,
      isActive: inv.isActive,
    };
  }

  // ─── Units (admin) ───────────────────────────────────────────────────────

  toUnitDto(u: StorageUnit): StorageUnitDto {
    return {
      id: u.id,
      facilityId: u.facilityId,
      facilitySlug: u.facility.slug,
      unitTypeId: u.unitTypeId,
      unitTypeSlug: u.unitType.slug,
      code: u.code,
      gridColumn: u.gridColumn,
      gridRow: u.gridRow,
      columnSpan: u.columnSpan,
      rowSpan: u.rowSpan,
      status: u.status,
      bookingId: u.bookingId,
      isActive: u.isActive,
    };
  }

  // ─── Availability snapshot — shared by both public and admin streams, and
  // by the polling endpoint. Never include customer data here (no bookingId,
  // no booking relation read at all) — the public stream is @Public() and
  // anyone can open it. `inventoryRows` drives which facility×type pairs are
  // offered (and at what rate); `unitRows` supplies live per-unit counts and
  // the floor-plan layout. A unit whose pair has no active inventory row is
  // dropped from `layout.units` too, so the two views never disagree. ──────

  buildAvailabilityFacilities(
    inventoryRows: StorageInventory[],
    unitRows: StorageUnit[],
  ): StorageAvailabilityFacilityDto[] {
    const activePairs = new Set(
      inventoryRows.map((inv) => `${inv.facilityId}:${inv.unitTypeId}`),
    );

    const countsByPair = new Map<
      string,
      { available: number; occupied: number; maintenance: number }
    >();
    const layoutUnitsByFacility = new Map<
      string,
      StorageAvailabilityLayoutUnitDto[]
    >();

    for (const unit of unitRows) {
      const pairKey = `${unit.facilityId}:${unit.unitTypeId}`;
      if (!activePairs.has(pairKey)) continue;

      const counts = countsByPair.get(pairKey) ?? {
        available: 0,
        occupied: 0,
        maintenance: 0,
      };
      if (unit.status === StorageUnitStatus.AVAILABLE) counts.available++;
      else if (unit.status === StorageUnitStatus.OCCUPIED) counts.occupied++;
      else if (unit.status === StorageUnitStatus.MAINTENANCE) {
        counts.maintenance++;
      }
      countsByPair.set(pairKey, counts);

      const layoutUnits = layoutUnitsByFacility.get(unit.facilityId) ?? [];
      layoutUnits.push({
        code: unit.code,
        unitTypeSlug: unit.unitType.slug,
        status: unit.status,
        gridColumn: unit.gridColumn,
        gridRow: unit.gridRow,
        columnSpan: unit.columnSpan,
        rowSpan: unit.rowSpan,
      });
      layoutUnitsByFacility.set(unit.facilityId, layoutUnits);
    }

    const byFacility = new Map<string, StorageAvailabilityFacilityDto>();

    for (const inv of inventoryRows) {
      let entry = byFacility.get(inv.facility.slug);
      if (!entry) {
        entry = {
          facilitySlug: inv.facility.slug,
          facilityName: inv.facility.name,
          units: [],
          layout: {
            layoutVersion: inv.facility.layoutVersion.toISOString(),
            columns: null,
            rows: null,
            cellCm: inv.facility.layoutCellCm,
            units: layoutUnitsByFacility.get(inv.facilityId) ?? [],
          },
        };
        byFacility.set(inv.facility.slug, entry);
      }

      const counts = countsByPair.get(
        `${inv.facilityId}:${inv.unitTypeId}`,
      ) ?? { available: 0, occupied: 0, maintenance: 0 };

      entry.units.push({
        unitTypeSlug: inv.unitType.slug,
        total: counts.available + counts.occupied + counts.maintenance,
        available: counts.available,
        occupied: counts.occupied,
        maintenance: counts.maintenance,
        monthlyRate: inv.monthlyRateOverride ?? inv.unitType.monthlyRate,
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
