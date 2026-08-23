import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventBookingStatus } from '../enums/event-booking-status.enum';
import { EventItemKind } from '../enums/event-item-kind.enum';
import { EventItemStatus } from '../enums/event-item-status.enum';

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
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
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
      'Units still free over the requested ?startDate/?days window; null when no window was given',
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

// ─── Quote (public) ─────────────────────────────────────────────────────────

export class EventQuoteLineDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() startDate!: string;
  @ApiProperty() days!: number;
  @ApiProperty() endDate!: string;
  @ApiProperty({ description: 'Rupiah, integer' }) pricePerDay!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) lineTotal!: number;
  @ApiProperty({ description: "Units still free over this line's date range" })
  availableQuantity!: number;
}

export class EventQuoteDto {
  @ApiProperty({ type: [EventQuoteLineDto] })
  lines!: EventQuoteLineDto[];
  @ApiProperty() startDate!: string;
  @ApiProperty() endDate!: string;
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
  @ApiProperty() startDate!: string;
  @ApiProperty() days!: number;
  @ApiProperty() endDate!: string;
  @ApiProperty({ description: 'Rupiah, integer' }) pricePerDay!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) lineTotal!: number;
}

export class EventBookingAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: EventBookingStatus }) status!: EventBookingStatus;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) eventLocation!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
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
