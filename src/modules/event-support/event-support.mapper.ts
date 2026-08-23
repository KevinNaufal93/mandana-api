import { Injectable } from '@nestjs/common';
import { EventItem } from './entities/event-item.entity';
import { EventBooking } from './entities/event-booking.entity';
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
} from './dto/event-support-response.dto';

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

  toItemListDto(item: EventItem): EventItemListDto {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      kind: item.kind,
      pricePerDay: item.pricePerDay,
      image: this.buildImage(item.mediaAsset),
    };
  }

  toItemDetailDto(
    item: EventItem,
    availableQuantity: number | null,
  ): EventItemDetailDto {
    return {
      ...this.toItemListDto(item),
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
      stockQuantity: item.stockQuantity,
      status: item.status,
      image: this.buildImage(item.mediaAsset),
      sortOrder: item.sortOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  // ─── Quote (public) ─────────────────────────────────────────────────────

  /**
   * Indonesian cart-confirmation message, styled after
   * StorageMapper.buildWhatsAppMessage() / lib/moving/whatsapp.ts in the
   * frontend repo. Plain text, not URL-encoded — the FE combines it with
   * its own NEXT_PUBLIC_MANDANA_WHATSAPP number.
   */
  private buildWhatsAppMessage(quote: EventQuoteComputation): string {
    const money = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
    const lines = [
      'Halo Mandana, saya ingin menyewa perlengkapan acara.',
      '',
      ...quote.lines.map(
        (l) =>
          `- ${l.item.name} x${l.quantity} (${l.days} hari, ${l.startDate} s/d ${l.endDate}): ${money(l.lineTotal)}`,
      ),
      '',
      `Tanggal acara: ${quote.startDate} s/d ${quote.endDate}`,
      ...(quote.eventLocation ? [`Lokasi: ${quote.eventLocation}`] : []),
      `Total: ${money(quote.total)}`,
      '',
      'Mohon konfirmasi ketersediaan dan langkah selanjutnya.',
    ];
    return lines.join('\n');
  }

  toQuoteDto(quote: EventQuoteComputation): EventQuoteDto {
    return {
      lines: quote.lines.map((l) => ({
        slug: l.item.slug,
        name: l.item.name,
        quantity: l.quantity,
        startDate: l.startDate,
        days: l.days,
        endDate: l.endDate,
        pricePerDay: l.pricePerDay,
        lineTotal: l.lineTotal,
        availableQuantity: l.availableQuantity,
      })),
      startDate: quote.startDate,
      endDate: quote.endDate,
      subtotal: quote.subtotal,
      discountAmount: quote.discountAmount,
      total: quote.total,
      currency: 'IDR',
      whatsappMessage: this.buildWhatsAppMessage(quote),
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
      startDate: booking.startDate,
      endDate: booking.endDate,
      items: booking.items.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.itemName,
        quantity: line.quantity,
        startDate: line.startDate,
        days: line.days,
        endDate: line.endDate,
        pricePerDay: line.pricePerDay,
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
