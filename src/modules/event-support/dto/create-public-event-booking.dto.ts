import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { QuoteEventSupportDto } from './quote-event-support.dto';

/**
 * Body for the public POST /event-support/bookings — extends the quote DTO
 * rather than redeclaring it, so the cart shape (slug-keyed items, rental
 * window, per-line overrides, and their validators) stays wire-compatible
 * with POST /event-support/quote forever: the actual product flow is
 * "quote the cart, then book the same cart". Adds only the contact fields
 * a quote doesn't need. Pricing is always recomputed server-side via the
 * same EventItemsService.quote() the quote endpoint calls — never trusted
 * from the request.
 */
export class CreatePublicEventBookingDto extends QuoteEventSupportDto {
  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  customerName!: string;

  @ApiPropertyOptional({ example: '+628123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'budi@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Perlu akses loading dock jam 08:00' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
