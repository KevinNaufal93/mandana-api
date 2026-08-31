import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  IsNaiveLocalDateTime,
  ValidRentalWindow,
} from './rental-window.validator';

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
    example: '2026-03-01T09:00',
    description:
      'Overrides the cart-level dropoffAt for this line only. Must be paired with pickupAt.',
  })
  @IsOptional()
  @IsNaiveLocalDateTime()
  dropoffAt?: string;

  @ApiPropertyOptional({
    example: '2026-03-01T17:00',
    description:
      'Overrides the cart-level pickupAt for this line only. Must be paired with dropoffAt.',
  })
  @IsOptional()
  @IsNaiveLocalDateTime()
  @ValidRentalWindow()
  pickupAt?: string;
}

/** Body for the public POST /event-support/quote — computes an
 * authoritative price for a cart and returns a prefilled WhatsApp message.
 * Writes nothing; the actual booking is made over WhatsApp and later
 * recorded by an admin via POST /admin/event-support/bookings.
 *
 * Timestamps are naive local datetimes (Asia/Jakarta by convention, no `Z`
 * or offset) — see rental-window.validator.ts. */
export class QuoteEventSupportDto {
  @ApiProperty({
    example: '2026-03-01T09:00',
    description: 'Drop-off timestamp, naive local datetime (Asia/Jakarta)',
  })
  @IsNaiveLocalDateTime()
  dropoffAt!: string;

  @ApiProperty({
    example: '2026-03-01T17:00',
    description: 'Pickup timestamp, naive local datetime (Asia/Jakarta)',
  })
  @IsNaiveLocalDateTime()
  @ValidRentalWindow()
  pickupAt!: string;

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
