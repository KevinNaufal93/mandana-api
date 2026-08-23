import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuoteEventSupportItemDto {
  @ApiProperty({
    example: 'medium-venue-package',
    description: 'EventItem.slug',
  })
  @IsString()
  slug!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Overrides the cart-level `days` for this line only',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

/** Body for the public POST /event-support/quote — computes an
 * authoritative price for a cart and returns a prefilled WhatsApp message.
 * Writes nothing; the actual booking is made over WhatsApp and later
 * recorded by an admin via POST /admin/event-support/bookings. */
export class QuoteEventSupportDto {
  @ApiProperty({
    example: '2026-03-01',
    description: 'ISO 8601 date (YYYY-MM-DD)',
  })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({
    example: 2,
    minimum: 1,
    description:
      'Default rental length in days, applied to any line without its own `days`',
  })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @ApiPropertyOptional({ example: 'Balai Sarbini, Jakarta Selatan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventLocation?: string;

  @ApiProperty({ type: [QuoteEventSupportItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteEventSupportItemDto)
  items!: QuoteEventSupportItemDto[];
}
