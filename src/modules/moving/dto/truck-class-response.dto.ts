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

export class MovingQuoteTruckDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class MovingQuoteDto {
  @ApiProperty({ type: MovingQuoteTruckDto }) truck!: MovingQuoteTruckDto;
  @ApiProperty() distanceKm!: number;
  @ApiProperty() includedKm!: number;
  @ApiProperty() chargeableKm!: number;
  @ApiProperty({ description: 'Rupiah' }) baseFare!: number;
  @ApiProperty({ description: 'Rupiah' }) distanceFare!: number;
  @ApiProperty({ description: 'Rupiah' }) subtotal!: number;
  @ApiProperty({ description: 'Rupiah' }) total!: number;
  @ApiProperty() minFareApplied!: boolean;
  @ApiProperty({ description: 'Rupiah' }) lowEstimate!: number;
  @ApiProperty({ description: 'Rupiah' }) highEstimate!: number;
  @ApiProperty({ example: 'IDR' }) currency!: string;
}

export class MovingQuoteResponseDto {
  @ApiProperty({ type: MovingQuoteDto })
  data!: MovingQuoteDto;
}
