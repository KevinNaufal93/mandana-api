import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageBookingStatus } from '../enums/storage-booking-status.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as moving/dto/truck-class-response.dto.ts.
 * Handlers keep returning bare objects; these classes exist only to drive
 * `@ApiOkResponse`. (The two `@Sse()` streams are exempt — OpenAPI has no
 * useful way to describe a `text/event-stream` body, so they're documented
 * via `@ApiOperation` description text instead.)
 */

export class StorageDimensionsDto {
  @ApiProperty() lengthCm!: number;
  @ApiProperty() widthCm!: number;
  @ApiProperty() heightCm!: number;
}

export class StorageImageDto {
  @ApiProperty() url!: string;
  @ApiProperty() srcset!: string;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

// ─── Unit types ─────────────────────────────────────────────────────────────

export class StorageUnitTypeDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) volumeM3!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: StorageDimensionsDto })
  dimensions!: StorageDimensionsDto | null;
  @ApiProperty({ description: 'Rupiah, integer' }) monthlyRate!: number;
  @ApiProperty() minDurationMonths!: number;
  @ApiPropertyOptional({ nullable: true, type: StorageImageDto })
  image!: StorageImageDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class StorageUnitTypeListResponseDto {
  @ApiProperty({ type: [StorageUnitTypeDto] })
  data!: StorageUnitTypeDto[];
}

export class StorageUnitTypeResponseDto {
  @ApiProperty({ type: StorageUnitTypeDto })
  data!: StorageUnitTypeDto;
}

// ─── Facilities ─────────────────────────────────────────────────────────────

export class StorageFacilityDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) address!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) area!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) city!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) province!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) latitude!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) longitude!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: StorageImageDto })
  image!: StorageImageDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class StorageFacilityListResponseDto {
  @ApiProperty({ type: [StorageFacilityDto] })
  data!: StorageFacilityDto[];
}

export class StorageFacilityResponseDto {
  @ApiProperty({ type: StorageFacilityDto })
  data!: StorageFacilityDto;
}

// ─── Inventory (admin) ──────────────────────────────────────────────────────

export class StorageInventoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() facilityId!: string;
  @ApiProperty() facilitySlug!: string;
  @ApiProperty() unitTypeId!: string;
  @ApiProperty() unitTypeSlug!: string;
  @ApiProperty() totalUnits!: number;
  @ApiProperty() occupiedUnits!: number;
  @ApiProperty() availableUnits!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) monthlyRateOverride!:
    number | null;
  @ApiProperty() isActive!: boolean;
}

export class StorageInventoryListResponseDto {
  @ApiProperty({ type: [StorageInventoryDto] })
  data!: StorageInventoryDto[];
}

export class StorageInventoryResponseDto {
  @ApiProperty({ type: StorageInventoryDto })
  data!: StorageInventoryDto;
}

// ─── Availability snapshot (polling + both SSE streams) ────────────────────

export class StorageAvailabilityUnitDto {
  @ApiProperty() unitTypeSlug!: string;
  @ApiProperty() total!: number;
  @ApiProperty() available!: number;
  @ApiProperty({ description: 'Rupiah, integer' }) monthlyRate!: number;
}

export class StorageAvailabilityFacilityDto {
  @ApiProperty() facilitySlug!: string;
  @ApiProperty() facilityName!: string;
  @ApiProperty({ type: [StorageAvailabilityUnitDto] })
  units!: StorageAvailabilityUnitDto[];
}

export class StorageAvailabilitySnapshotDto {
  @ApiProperty({
    description: 'md5 of the snapshot body — also used as the ETag',
  })
  version!: string;
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ type: [StorageAvailabilityFacilityDto] })
  facilities!: StorageAvailabilityFacilityDto[];
}

export class StorageAvailabilityResponseDto {
  @ApiProperty({ type: StorageAvailabilitySnapshotDto })
  data!: StorageAvailabilitySnapshotDto;
}

// ─── Quote ───────────────────────────────────────────────────────────────────

export class StorageQuoteFacilityDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class StorageQuoteUnitTypeDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class StorageQuoteDto {
  @ApiProperty({ type: StorageQuoteFacilityDto })
  facility!: StorageQuoteFacilityDto;
  @ApiProperty({ type: StorageQuoteUnitTypeDto })
  unitType!: StorageQuoteUnitTypeDto;
  @ApiProperty({ description: 'Rupiah' }) monthlyRate!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() durationMonths!: number;
  @ApiProperty({ description: 'Rupiah' }) subtotal!: number;
  @ApiProperty() discountPct!: number;
  @ApiProperty({ description: 'Rupiah' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty({ example: 'IDR' }) currency!: string;
}

export class StorageQuoteResponseDto {
  @ApiProperty({ type: StorageQuoteDto })
  data!: StorageQuoteDto;
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export class StorageBookingDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: StorageBookingStatus }) status!: StorageBookingStatus;
  @ApiProperty() customerName!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty() facilitySlug!: string;
  @ApiProperty() facilityName!: string;
  @ApiProperty() unitTypeSlug!: string;
  @ApiProperty() unitTypeName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() startDate!: string;
  @ApiProperty() durationMonths!: number;
  @ApiProperty() endDate!: string;
  @ApiProperty({ description: 'Rupiah' }) monthlyRate!: number;
  @ApiProperty({ description: 'Rupiah' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty({ example: 'IDR' }) currency!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({
    description:
      "Pre-built Indonesian message text (not yet URL-encoded). The API has no business WhatsApp number of its own — combine this with the FE's existing NEXT_PUBLIC_MANDANA_WHATSAPP the same way lib/moving/whatsapp.ts's buildMovingWaLink() does: `https://wa.me/<number>?text=${encodeURIComponent(whatsappMessage)}`.",
  })
  whatsappMessage!: string;
}

export class StorageBookingResponseDto {
  @ApiProperty({ type: StorageBookingDto })
  data!: StorageBookingDto;
}

export class StorageBookingAdminDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: StorageBookingStatus }) status!: StorageBookingStatus;
  @ApiProperty() customerName!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() facilitySlug!: string;
  @ApiProperty() facilityName!: string;
  @ApiProperty() unitTypeSlug!: string;
  @ApiProperty() unitTypeName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() startDate!: string;
  @ApiProperty() durationMonths!: number;
  @ApiProperty() endDate!: string;
  @ApiProperty({ description: 'Rupiah' }) monthlyRate!: number;
  @ApiProperty({ description: 'Rupiah' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah' }) discountAmount!: number;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) adminNote!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) confirmedAt!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) confirmedByName!:
    string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class StorageBookingAdminResponseDto {
  @ApiProperty({ type: StorageBookingAdminDto })
  data!: StorageBookingAdminDto;
}

export class PaginationMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalPages!: number;
}

export class StorageBookingAdminListResponseDto {
  @ApiProperty({ type: [StorageBookingAdminDto] })
  data!: StorageBookingAdminDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

// ─── Admin SSE stream ticket ─────────────────────────────────────────────────

export class StorageStreamTicketDto {
  @ApiProperty({ description: 'Pass as ?ticket= on GET /admin/storage/stream' })
  ticket!: string;
  @ApiProperty({ description: 'Seconds until the ticket expires', example: 60 })
  expiresIn!: number;
}

export class StorageStreamTicketResponseDto {
  @ApiProperty({ type: StorageStreamTicketDto })
  data!: StorageStreamTicketDto;
}

// ─── Admin SSE stream events (booking.created / booking.updated) ───────────

export class StorageBookingCreatedEventDto {
  @ApiProperty() reference!: string;
  @ApiProperty() facilitySlug!: string;
  @ApiProperty() facilityName!: string;
  @ApiProperty() unitTypeSlug!: string;
  @ApiProperty() unitTypeName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() customerName!: string;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty() createdAt!: string;
}

export class StorageBookingUpdatedEventDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: StorageBookingStatus }) status!: StorageBookingStatus;
  @ApiPropertyOptional({ nullable: true, type: String }) confirmedByName!:
    string | null;
  @ApiProperty() updatedAt!: string;
}
