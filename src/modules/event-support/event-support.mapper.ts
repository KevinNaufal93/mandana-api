import { Injectable } from '@nestjs/common';
import { EventItem } from './entities/event-item.entity';
import { EventBooking } from './entities/event-booking.entity';
import { EventSupportSettings } from './entities/event-support-settings.entity';
import { EventCategoryWithCount } from './event-categories.service';
import { EventQuoteComputation } from './event-items.service';
import { MediaService } from '../media/media.service';
import { richTextToPlain } from '../../common/rich-text';
import {
  EventBookingAdminDto,
  EventCategoryDto,
  EventImageDto,
  EventItemAdminDto,
  EventItemDetailDto,
  EventItemListDto,
  EventQuoteDto,
  EventSupportSettingsDto,
} from './dto/event-support-response.dto';

/** Numeric Postgres columns come back from `pg` as strings — normalize them
 * (same quirk as TruckClass.volumeM3, see moving.mapper.ts's toNumber). */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

@Injectable()
export class EventSupportMapper {
  constructor(private readonly mediaService: MediaService) {}

  private buildImage(
    mediaAsset: EventItem['mediaAsset'],
  ): EventImageDto | null {
    return mediaAsset ? this.mediaService.buildImageDto(mediaAsset) : null;
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  toCategoryDto(category: EventCategoryWithCount): EventCategoryDto {
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      descriptionText: richTextToPlain(category.description),
      image: this.buildImage(category.mediaAsset),
      itemCount: category.itemCount,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    };
  }

  // ─── Items — public ─────────────────────────────────────────────────────

  toItemListDto(
    item: EventItem,
    activeRate?: {
      amount: number;
      unit: 'hour' | 'day';
      label: 'jam' | 'hari';
    },
  ): EventItemListDto {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      kind: item.kind,
      pricePerDay: item.pricePerDay,
      image: this.buildImage(item.mediaAsset),
      ...(activeRate !== undefined && { activeRate }),
    };
  }

  toItemDetailDto(
    item: EventItem,
    availableQuantity: number | null,
    activeRate?: {
      amount: number;
      unit: 'hour' | 'day';
      label: 'jam' | 'hari';
    },
  ): EventItemDetailDto {
    return {
      ...this.toItemListDto(item, activeRate),
      description: item.description,
      descriptionText: richTextToPlain(item.description),
      categorySlug: item.category.slug,
      categoryName: item.category.name,
      stockQuantity: item.stockQuantity,
      availableQuantity,
    };
  }

  // ─── Items — admin ──────────────────────────────────────────────────────

  toItemAdminDto(item: EventItem): EventItemAdminDto {
    return {
      id: item.id,
      categoryId: item.categoryId,
      categorySlug: item.category.slug,
      categoryName: item.category.name,
      name: item.name,
      slug: item.slug,
      kind: item.kind,
      description: item.description,
      descriptionText: richTextToPlain(item.description),
      pricePerDay: item.pricePerDay,
      hourlyRate: item.hourlyRate,
      supportsHourly: item.supportsHourly,
      minimumHours: item.minimumHours,
      stockQuantity: item.stockQuantity,
      status: item.status,
      image: this.buildImage(item.mediaAsset),
      sortOrder: item.sortOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  // ─── Settings ───────────────────────────────────────────────────────────

  toSettingsDto(settings: EventSupportSettings): EventSupportSettingsDto {
    return {
      hourlyThresholdHours: settings.hourlyThresholdHours,
      hourlyThresholdInclusive: settings.hourlyThresholdInclusive,
      defaultMinimumHours: settings.defaultMinimumHours,
      roundingUnitMinutes: settings.roundingUnitMinutes,
      capHourlyAtDailyRate: settings.capHourlyAtDailyRate,
      overThresholdMode: settings.overThresholdMode,
      priceIncludesJabodetabekDelivery:
        settings.priceIncludesJabodetabekDelivery,
      outsideJabodetabekNote: settings.outsideJabodetabekNote,
    };
  }

  // ─── Quote (public) ─────────────────────────────────────────────────────

  /**
   * Indonesian cart-confirmation message, styled after
   * StorageMapper.buildWhatsAppMessage() / lib/moving/whatsapp.ts in the
   * frontend repo. Plain text, not URL-encoded — the FE combines it with
   * its own NEXT_PUBLIC_MANDANA_WHATSAPP number.
   */
  private buildWhatsAppMessage(
    quote: EventQuoteComputation,
    settings: EventSupportSettings,
  ): string {
    const money = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
    const lines = [
      'Halo Mandana, saya ingin menyewa perlengkapan acara.',
      '',
      ...quote.lines.map((l) => {
        const durationLabel =
          l.unitLabel === 'jam'
            ? `${l.billableUnits} jam`
            : `${l.billableUnits} hari`;
        return `- ${l.item.name} x${l.quantity} (${durationLabel}, ${l.dropoffAt} s/d ${l.pickupAt}): ${money(l.lineTotal)}`;
      }),
      '',
      `Waktu sewa: ${quote.dropoffAt} s/d ${quote.pickupAt}`,
      ...(quote.eventLocation ? [`Lokasi: ${quote.eventLocation}`] : []),
      `Total: ${money(quote.total)}`,
      ...(settings.priceIncludesJabodetabekDelivery
        ? ['Harga sudah termasuk ongkir Jabodetabek.']
        : []),
      '',
      'Mohon konfirmasi ketersediaan dan langkah selanjutnya.',
    ];
    return lines.join('\n');
  }

  toQuoteDto(
    quote: EventQuoteComputation,
    settings: EventSupportSettings,
  ): EventQuoteDto {
    return {
      lines: quote.lines.map((l) => ({
        slug: l.item.slug,
        name: l.item.name,
        quantity: l.quantity,
        dropoffAt: l.dropoffAt,
        pickupAt: l.pickupAt,
        startDate: l.startDate,
        endDate: l.endDate,
        billingMode: l.billingMode,
        unitPrice: l.unitPrice,
        unitLabel: l.unitLabel,
        billableUnits: toNumber(l.billableUnits) ?? l.billableUnits,
        extraHours: toNumber(l.extraHours),
        extraHoursTotal: toNumber(l.extraHoursTotal),
        lineTotal: l.lineTotal,
        availableQuantity: l.availableQuantity,
      })),
      dropoffAt: quote.dropoffAt,
      pickupAt: quote.pickupAt,
      startDate: quote.startDate,
      endDate: quote.endDate,
      isMixedBilling: quote.isMixedBilling,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      total: quote.total,
      currency: 'IDR',
      whatsappMessage: this.buildWhatsAppMessage(quote, settings),
    };
  }

  // ─── Bookings (admin) ───────────────────────────────────────────────────

  toBookingAdminDto(booking: EventBooking): EventBookingAdminDto {
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      customerName: booking.customerName,
      phone: booking.phone,
      email: booking.email,
      eventLocation: booking.eventLocation,
      notes: booking.notes,
      dropoffAt: booking.dropoffAt,
      pickupAt: booking.pickupAt,
      startDate: booking.startDate,
      endDate: booking.endDate,
      items: booking.items.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        quantity: line.quantity,
        dropoffAt: line.dropoffAt,
        pickupAt: line.pickupAt,
        startDate: line.startDate,
        days: line.days,
        endDate: line.endDate,
        billingMode: line.billingMode,
        pricePerDay: line.pricePerDay,
        unitPrice: line.unitPrice,
        unitLabel: line.unitLabel,
        billableUnits: toNumber(line.billableUnits) ?? line.billableUnits,
        extraHours: toNumber(line.extraHours),
        extraHoursTotal: line.extraHoursTotal,
        lineTotal: line.lineTotal,
      })),
      subtotal: booking.subtotal,
      discountAmount: booking.discountAmount,
      total: booking.total,
      adminNote: booking.adminNote,
      createdByName: booking.createdBy?.name ?? null,
      confirmedAt: booking.confirmedAt
        ? booking.confirmedAt.toISOString()
        : null,
      confirmedByName: booking.confirmedBy?.name ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}
