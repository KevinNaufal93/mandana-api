import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — no controller in this repo did this before this module, so
 * `npm run gen:api` produced untyped bodies. Handlers keep returning bare
 * entities/objects; these classes exist only to drive `@ApiOkResponse`.
 */

export class TruckImageDto {
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

export class TruckDimensionsDto {
  @ApiProperty() lengthCm!: number;
  @ApiProperty() widthCm!: number;
  @ApiProperty() heightCm!: number;
}

export class TruckClassDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) descriptionText!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) capacityKg!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) volumeM3!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: TruckDimensionsDto })
  dimensions!: TruckDimensionsDto | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) helperCount!:
    number | null;
  @ApiProperty({ description: 'Rupiah, integer' }) baseFare!: number;
  @ApiProperty({ description: 'Rupiah per km, integer' }) perKmFare!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) includedKm!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) minFare!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: TruckImageDto })
  image!: TruckImageDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class TruckClassListResponseDto {
  @ApiProperty({ type: [TruckClassDto] })
  data!: TruckClassDto[];
}

export class TruckClassResponseDto {
  @ApiProperty({ type: TruckClassDto })
  data!: TruckClassDto;
}

// ─── Moving add-ons (helper, packaging, waiting, insurance, toll) ─────────────

export class MovingAddonDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) descriptionText!:
    string | null;
  @ApiProperty({ example: 'helper' }) kind!: string;
  @ApiProperty({ example: 'per_unit' }) pricingModel!: string;
  @ApiProperty({ description: 'Rupiah, integer' }) unitPrice!: number;
  @ApiPropertyOptional({ nullable: true, type: Number }) percentBps!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) minCharge!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) maxCharge!:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) unitLabel!:
    string | null;
  @ApiProperty() minQty!: number;
  @ApiProperty() maxQty!: number;
  @ApiProperty() doublesOnRoundTrip!: boolean;
  @ApiPropertyOptional({ nullable: true, type: TruckImageDto })
  image!: TruckImageDto | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class MovingAddonListResponseDto {
  @ApiProperty({ type: [MovingAddonDto] })
  data!: MovingAddonDto[];
}

export class MovingAddonResponseDto {
  @ApiProperty({ type: MovingAddonDto })
  data!: MovingAddonDto;
}

// ─── Moving pricing settings (roundToIdr / bandPct / defaultIncludedKm) ───────

export class MovingSettingsDto {
  @ApiProperty({ description: 'Rupiah rounding step applied to the total' })
  roundToIdr!: number;
  @ApiProperty({ description: 'The ± percentage band shown to the customer' })
  bandPct!: number;
  @ApiProperty({
    description: 'Fallback included-km when a truck class sets none',
  })
  defaultIncludedKm!: number;
}

export class MovingSettingsResponseDto {
  @ApiProperty({ type: MovingSettingsDto })
  data!: MovingSettingsDto;
}

// ─── Quote ─────────────────────────────────────────────────────────────────────

export class MovingQuoteTruckDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class MovingQuoteAddonLineDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'helper' }) kind!: string;
  @ApiProperty({ example: 'per_unit' }) pricingModel!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ description: 'Rupiah' }) unitPrice!: number;
  @ApiProperty({ description: 'Rupiah' }) amount!: number;
}

export class MovingQuoteLegDto {
  @ApiProperty() distanceKm!: number;
  @ApiProperty() includedKm!: number;
  @ApiProperty() chargeableKm!: number;
  @ApiProperty({ description: 'Rupiah' }) baseFare!: number;
  @ApiProperty({ description: 'Rupiah' }) distanceFare!: number;
  @ApiProperty({
    description: 'Rupiah — baseFare + distanceFare for this leg only',
  })
  subtotal!: number;
}

export class MovingQuoteDto {
  @ApiProperty({ type: MovingQuoteTruckDto }) truck!: MovingQuoteTruckDto;
  @ApiProperty() distanceKm!: number;
  @ApiProperty() includedKm!: number;
  @ApiProperty() chargeableKm!: number;
  @ApiProperty() roundTrip!: boolean;
  @ApiProperty({ description: '1 one-way, 2 round trip' })
  tripMultiplier!: number;
  @ApiProperty({ description: 'Rupiah' }) baseFare!: number;
  @ApiProperty({ description: 'Rupiah' }) distanceFare!: number;
  @ApiProperty({
    description: 'Rupiah — baseFare + distanceFare, after minFare',
  })
  travelSubtotal!: number;
  @ApiProperty({
    description:
      'Whether distanceMeters was computed via a toll-road route (echoes the request flag)',
  })
  tollRoute!: boolean;
  @ApiProperty({
    description: 'Rupiah — 0 unless an active toll addon applies',
  })
  tollFare!: number;
  @ApiProperty({ type: [MovingQuoteAddonLineDto] })
  addons!: MovingQuoteAddonLineDto[];
  @ApiProperty({ description: 'Rupiah' }) addonsTotal!: number;
  @ApiProperty({
    description: 'Rupiah — travelSubtotal + tollFare + addonsTotal',
  })
  subtotal!: number;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty() minFareApplied!: boolean;
  @ApiProperty({ description: 'Rupiah' }) lowEstimate!: number;
  @ApiProperty({ description: 'Rupiah' }) highEstimate!: number;
  @ApiProperty({
    type: [MovingQuoteLegDto],
    description:
      'Per-leg breakdown, in request order. Unrounded — only the top-level total/lowEstimate/highEstimate are rounded. No per-leg minFareApplied by design (minFare floors the trip-wide sum once, not per leg).',
  })
  legs!: MovingQuoteLegDto[];
  @ApiProperty({ example: 'IDR' }) currency!: string;
}

export class MovingQuoteResponseDto {
  @ApiProperty({ type: MovingQuoteDto })
  data!: MovingQuoteDto;
}
