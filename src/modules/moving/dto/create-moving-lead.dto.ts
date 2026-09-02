import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { QuoteMovingDto } from './quote-moving.dto';
import { MovingPointDto } from './moving-point.dto';

/**
 * Body for `POST /moving/leads`. Extends QuoteMovingDto to inherit
 * `truckSlug`/`distanceMeters`/`roundTrip`/`tollRoute`/`declaredValue`/`addons`
 * — and their validators — verbatim, so the exact same request that would be
 * sent to `/moving/quote` also captures a lead by adding `pickup` and
 * `destinations`. Pricing itself still runs on the single `distanceMeters`
 * total (see MovingService.buildQuote()) — `destinations` is captured for
 * the record, not priced per leg.
 */
export class CreateMovingLeadDto extends QuoteMovingDto {
  @ApiProperty({ type: MovingPointDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MovingPointDto)
  pickup!: MovingPointDto;

  @ApiProperty({
    type: [MovingPointDto],
    minItems: 1,
    maxItems: 25,
    description:
      'Ordered drop-off stops — 1 or more, no product limit. The 25 cap is an abuse guard, mirroring the `addons` field’s own ArrayMaxSize convention.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => MovingPointDto)
  destinations!: MovingPointDto[];

  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description:
      'Not collected by the Moving Support page today — optional, future-proofing.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @ApiPropertyOptional({ example: '+628123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'budi@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
