import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovingBookingStatus } from '../enums/moving-booking-status.enum';

/**
 * Response-shape DTOs for the Moving Support bookings surface, declared
 * purely so Swagger/OpenAPI can describe the `{ data }` / `{ data, meta }`
 * envelopes the global `TransformInterceptor` wraps handler returns in —
 * same convention as truck-class-response.dto.ts. Handlers keep returning
 * bare objects; these classes exist only to drive `@ApiOkResponse`/
 * `@ApiCreatedResponse`.
 *
 * Kept in a dedicated file rather than folded into truck-class-response.dto.ts
 * — bookings is a meaningfully larger DTO surface (2 nested shapes + 2
 * top-level shapes + a pagination-meta shape) and this scopes imports
 * cleanly for the two booking-only controllers.
 */

export class MovingBookingStopDto {
  @ApiProperty({ description: '0-based route order' })
  stopIndex!: number;
  @ApiPropertyOptional({ nullable: true, type: String })
  address!: string | null;
  @ApiProperty()
  lat!: number;
  @ApiProperty()
  lng!: number;
}

export class MovingBookingAddonLineDto {
  @ApiProperty()
  slug!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  quantity!: number;
  @ApiProperty({ description: 'Rupiah' })
  unitPrice!: number;
  @ApiProperty({ description: 'Rupiah' })
  amount!: number;
}

export class MovingBookingLegDto {
  @ApiProperty()
  distanceKm!: number;
  @ApiProperty()
  includedKm!: number;
  @ApiProperty()
  chargeableKm!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Whole 500 m steps billed on this leg. null on a leg captured before 500 m step pricing shipped.',
  })
  chargeableSteps!: number | null;
  @ApiProperty({ description: 'Rupiah' })
  baseFare!: number;
  @ApiProperty({ description: 'Rupiah' })
  distanceFare!: number;
  @ApiProperty({ description: 'Rupiah' })
  subtotal!: number;
}

/**
 * Public shape — returned by `POST /moving/bookings`. No `adminNote`,
 * mirroring StorageBookingDto's omission of admin-only fields. No
 * `whatsappMessage` either, unlike StorageBookingDto/EventQuoteDto — for
 * Moving Support the WA message is still built entirely client-side
 * (buildMovingWaMessage()) and this call fires fire-and-forget alongside
 * it, not before it.
 */
export class MovingBookingDto {
  @ApiProperty()
  id!: string;
  @ApiProperty({ example: 'MDN-MOV-A7K92X' })
  reference!: string;
  @ApiProperty({ enum: MovingBookingStatus })
  status!: MovingBookingStatus;
  @ApiProperty()
  truckSlug!: string;
  @ApiProperty()
  truckName!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  pickupAddress!: string | null;
  @ApiProperty()
  pickupLat!: number;
  @ApiProperty()
  pickupLng!: number;
  @ApiProperty({ type: [MovingBookingStopDto] })
  destinations!: MovingBookingStopDto[];
  @ApiProperty()
  distanceKm!: number;
  @ApiProperty()
  includedKm!: number;
  @ApiProperty()
  chargeableKm!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description:
      'Sum of every leg\'s chargeableSteps. null on a booking captured before 500 m step pricing shipped.',
  })
  chargeableSteps!: number | null;
  @ApiProperty()
  roundTrip!: boolean;
  @ApiProperty()
  tollRoute!: boolean;
  @ApiPropertyOptional({ nullable: true, type: Number })
  declaredValue!: number | null;
  @ApiProperty({ description: 'Rupiah' })
  baseFare!: number;
  @ApiProperty({ description: 'Rupiah' })
  distanceFare!: number;
  @ApiProperty({ description: 'Rupiah' })
  travelSubtotal!: number;
  @ApiProperty({ description: 'Rupiah' })
  tollFare!: number;
  @ApiProperty({ type: [MovingBookingAddonLineDto] })
  addons!: MovingBookingAddonLineDto[];
  @ApiProperty({ description: 'Rupiah' })
  addonsTotal!: number;
  @ApiProperty({ description: 'Rupiah' })
  subtotal!: number;
  @ApiProperty({ description: 'Rupiah' })
  total!: number;
  @ApiProperty()
  minFareApplied!: boolean;
  @ApiProperty({ description: 'Rupiah' })
  lowEstimate!: number;
  @ApiProperty({ description: 'Rupiah' })
  highEstimate!: number;
  @ApiProperty({ type: [MovingBookingLegDto] })
  legs!: MovingBookingLegDto[];
  @ApiProperty({ example: 'IDR' })
  currency!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  customerName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  email!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Customer-provided additional notes/instructions',
  })
  notes!: string | null;
  @ApiProperty()
  createdAt!: Date;
}

export class MovingBookingResponseDto {
  @ApiProperty({ type: MovingBookingDto })
  data!: MovingBookingDto;
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export class MovingBookingAdminDto extends MovingBookingDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  adminNote!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  confirmedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  confirmedByName!: string | null;
  @ApiProperty()
  updatedAt!: Date;
}

export class MovingBookingAdminResponseDto {
  @ApiProperty({ type: MovingBookingAdminDto })
  data!: MovingBookingAdminDto;
}

// Not named `PaginationMetaDto` — that name is already owned by
// storage-response.dto.ts; mirrors event-support-response.dto.ts's
// EventPaginationMetaDto precedent to avoid an OpenAPI schema-name collision
// (two distinct classes cannot share one component name).
export class MovingBookingPaginationMetaDto {
  @ApiProperty()
  total!: number;
  @ApiProperty()
  page!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  totalPages!: number;
}

export class MovingBookingAdminListResponseDto {
  @ApiProperty({ type: [MovingBookingAdminDto] })
  data!: MovingBookingAdminDto[];
  @ApiProperty({ type: MovingBookingPaginationMetaDto })
  meta!: MovingBookingPaginationMetaDto;
}
