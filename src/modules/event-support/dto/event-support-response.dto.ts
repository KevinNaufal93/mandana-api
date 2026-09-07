import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventBookingStatus } from '../enums/event-booking-status.enum';
import { EventBookingSource } from '../enums/event-booking-source.enum';
import { EventItemKind } from '../enums/event-item-kind.enum';
import { EventItemStatus } from '../enums/event-item-status.enum';
import { EventBillingMode } from '../enums/event-billing-mode.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` / `{ data, meta }` envelopes the global `TransformInterceptor`
 * wraps handler returns in — same convention as
 * storage/dto/storage-response.dto.ts. Handlers keep returning bare
 * objects; these classes exist only to drive `@ApiOkResponse`.
 */

export class EventPaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

export class EventImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty({
    description:
      'Empty when this asset has no AVIF variants — only hero uploads generate AVIF.',
  })
  srcsetAvif!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      '~20px WebP data: URI for an instant blurred paint; null until backfilled for pre-existing assets.',
  })
  placeholder!: string | null;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

/** The rate actually applicable to an item over a requested window — the
 * web renders this, it never computes which rate applies itself. Omitted
 * (undefined) when no window was given. */
export class EventActiveRateDto {
  @ApiProperty({ description: 'Rupiah, integer' }) amount!: number;
  @ApiProperty({ enum: ['eight_hour', 'day'] }) unit!: 'eight_hour' | 'day';
  @ApiProperty({ example: '8 jam' }) label!: '8 jam' | 'hari';
}

// ─── Categories ─────────────────────────────────────────────────────────────

export class EventCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) descriptionText!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: EventImageDto })
  image!: EventImageDto | null;
  @ApiProperty({ description: 'Count of published items in this category' })
  itemCount!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class EventCategoryListResponseDto {
  @ApiProperty({ type: [EventCategoryDto] })
  data!: EventCategoryDto[];
}

export class EventCategoryResponseDto {
  @ApiProperty({ type: EventCategoryDto })
  data!: EventCategoryDto;
}

// ─── Items — public ─────────────────────────────────────────────────────────

/** Light card shape for the catalog grid — name, price, image only. */
export class EventItemListDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: EventItemKind }) kind!: EventItemKind;
  @ApiProperty({ description: 'Rupiah, integer' }) pricePerDay!: number;
  @ApiPropertyOptional({ nullable: true, type: EventImageDto })
  image!: EventImageDto | null;
  @ApiPropertyOptional({
    type: EventActiveRateDto,
    description:
      'The rate applicable over ?dropoffAt/?pickupAt. Omitted when no window was given.',
  })
  activeRate?: EventActiveRateDto;
}

export class EventItemListResponseDto {
  @ApiProperty({ type: [EventItemListDto] })
  data!: EventItemListDto[];
  @ApiProperty({ type: EventPaginationMetaDto })
  meta!: EventPaginationMetaDto;
}

/** Full detail shape for the item page — includes description HTML. */
export class EventItemDetailDto extends EventItemListDto {
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) descriptionText!:
    string | null;
  @ApiProperty() categorySlug!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty() stockQuantity!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Units still free over the requested ?dropoffAt/?pickupAt window; null when no window was given',
  })
  availableQuantity!: number | null;
}

export class EventItemDetailResponseDto {
  @ApiProperty({ type: EventItemDetailDto })
  data!: EventItemDetailDto;
}

// ─── Items — admin ──────────────────────────────────────────────────────────

export class EventItemAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() categorySlug!: string;
  @ApiProperty() categoryName!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: EventItemKind }) kind!: EventItemKind;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) descriptionText!:
    string | null;
  @ApiProperty({ description: 'Rupiah, integer' }) pricePerDay!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Rupiah, integer — the price for one 8-hour rental block',
  })
  eightHourRate!: number | null;
  @ApiProperty() supportsEightHour!: boolean;
  @ApiProperty() stockQuantity!: number;
  @ApiProperty({ enum: EventItemStatus }) status!: EventItemStatus;
  @ApiPropertyOptional({ nullable: true, type: EventImageDto })
  image!: EventImageDto | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class EventItemAdminListResponseDto {
  @ApiProperty({ type: [EventItemAdminDto] })
  data!: EventItemAdminDto[];
  @ApiProperty({ type: EventPaginationMetaDto })
  meta!: EventPaginationMetaDto;
}

export class EventItemAdminResponseDto {
  @ApiProperty({ type: EventItemAdminDto })
  data!: EventItemAdminDto;
}

// ─── Settings (public pricing-config + admin) ──────────────────────────────

export class EventSupportSettingsDto {
  @ApiProperty({
    description:
      'Whether pricePerDay/eightHourRate already include Jabodetabek delivery',
  })
  priceIncludesJabodetabekDelivery!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String })
  outsideJabodetabekNote!: string | null;
}

export class EventSupportSettingsResponseDto {
  @ApiProperty({ type: EventSupportSettingsDto })
  data!: EventSupportSettingsDto;
}

// ─── Quote (public) ─────────────────────────────────────────────────────────

export class EventQuoteLineDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() dropoffAt!: string;
  @ApiProperty() pickupAt!: string;
  @ApiProperty({ description: 'Derived calendar span the item is held' })
  startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty({ enum: EventBillingMode }) billingMode!: EventBillingMode;
  @ApiProperty({ description: 'Rupiah, integer — the rate actually applied' })
  unitPrice!: number;
  @ApiProperty({ enum: ['8 jam', 'hari'] }) unitLabel!: '8 jam' | 'hari';
  @ApiProperty({
    description:
      'Always 1 under billingMode "eight_hour" (one block); the whole-day count under "daily".',
  })
  billableUnits!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) lineTotal!: number;
  @ApiProperty({ description: "Units still free over this line's date range" })
  availableQuantity!: number;
}

export class EventQuoteDto {
  @ApiProperty({ type: [EventQuoteLineDto] })
  lines!: EventQuoteLineDto[];
  @ApiProperty() dropoffAt!: string;
  @ApiProperty() pickupAt!: string;
  @ApiProperty({ description: 'Derived cart-wide calendar span' })
  startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty({
    description: 'true when the lines were priced under different billingModes',
  })
  isMixedBilling!: boolean;
  @ApiProperty({ description: 'Rupiah, integer' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) total!: number;
  @ApiProperty({ example: 'IDR' }) currency!: string;
  @ApiProperty({
    description:
      'Prefilled Indonesian WhatsApp message; the FE appends its own number',
  })
  whatsappMessage!: string;
}

export class EventQuoteResponseDto {
  @ApiProperty({ type: EventQuoteDto })
  data!: EventQuoteDto;
}

// ─── Bookings (admin) ───────────────────────────────────────────────────────

export class EventBookingLineDto {
  @ApiProperty() id!: string;
  @ApiProperty() itemId!: string;
  @ApiProperty() itemName!: string;
  @ApiProperty() quantity!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) dropoffAt!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) pickupAt!:
    string | null;
  @ApiProperty() startDate!: string;
  @ApiProperty({ description: 'Calendar days held (endDate - startDate + 1)' })
  days!: number;
  @ApiProperty() endDate!: string;
  @ApiProperty({ enum: EventBillingMode }) billingMode!: EventBillingMode;
  @ApiProperty({ description: 'Rupiah, integer' }) pricePerDay!: number;
  @ApiProperty({ description: 'Rupiah, integer — the rate actually applied' })
  unitPrice!: number;
  @ApiProperty({ enum: ['8 jam', 'hari'] }) unitLabel!: '8 jam' | 'hari';
  @ApiProperty() billableUnits!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) lineTotal!: number;
}

export class EventBookingAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: EventBookingStatus }) status!: EventBookingStatus;
  @ApiProperty({
    enum: EventBookingSource,
    description:
      'Whether the customer submitted this directly or an admin recorded it after a WhatsApp conversation',
  })
  source!: EventBookingSource;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) eventLocation!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) dropoffAt!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) pickupAt!:
    string | null;
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty({ type: [EventBookingLineDto] }) items!: EventBookingLineDto[];
  @ApiProperty({ description: 'Rupiah, integer' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) total!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) adminNote!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) createdByName!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) confirmedAt!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) confirmedByName!:
    string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class EventBookingAdminListResponseDto {
  @ApiProperty({ type: [EventBookingAdminDto] })
  data!: EventBookingAdminDto[];
  @ApiProperty({ type: EventPaginationMetaDto })
  meta!: EventPaginationMetaDto;
}

export class EventBookingAdminResponseDto {
  @ApiProperty({ type: EventBookingAdminDto })
  data!: EventBookingAdminDto;
}

// ─── Bookings (public) ──────────────────────────────────────────────────────

/**
 * Response for POST /event-support/bookings. Reuses EventQuoteLineDto for
 * `lines` (the identical computed shape POST /event-support/quote already
 * returns) rather than EventBookingLineDto — the public flow is quote the
 * cart, then book the same cart, so the two responses stay directly
 * comparable. Deliberately asymmetric with EventBookingAdminDto.items:
 * no adminNote/createdByName/confirmed* here, mirroring how
 * StorageBookingDto trims StorageBookingAdminDto.
 */
export class EventBookingPublicDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'MDN-EVT-A7K92X' }) reference!: string;
  @ApiProperty({ enum: EventBookingStatus }) status!: EventBookingStatus;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) eventLocation!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() dropoffAt!: string;
  @ApiProperty() pickupAt!: string;
  @ApiProperty({ description: 'Derived cart-wide calendar span' })
  startDate!: string;
  @ApiProperty() endDate!: string;
  @ApiProperty({
    description: 'true when the lines were priced under different billingModes',
  })
  isMixedBilling!: boolean;
  @ApiProperty({ type: [EventQuoteLineDto] }) lines!: EventQuoteLineDto[];
  @ApiProperty({ description: 'Rupiah, integer' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) total!: number;
  @ApiProperty({ example: 'IDR' }) currency!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({
    description:
      'Prefilled Indonesian WhatsApp message, including the booking reference; the FE appends its own number',
  })
  whatsappMessage!: string;
}

export class EventBookingPublicResponseDto {
  @ApiProperty({ type: EventBookingPublicDto })
  data!: EventBookingPublicDto;
}
