import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateEventBookingItemDto {
  @ApiProperty({ description: 'EventItem UUID' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity!: number;

  @ApiProperty({
    example: '2026-03-01',
    description: 'ISO 8601 date (YYYY-MM-DD)',
  })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

/** Body for POST /admin/event-support/bookings — every real booking is made
 * over WhatsApp; this endpoint is how the admin records it afterward. The
 * acting admin is attached server-side from @CurrentUser(), not this body. */
export class CreateEventBookingDto {
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

  @ApiPropertyOptional({ example: 'Balai Sarbini, Jakarta Selatan' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventLocation?: string;

  @ApiPropertyOptional({ example: 'Perlu akses loading dock jam 08:00' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ type: [CreateEventBookingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateEventBookingItemDto)
  items!: CreateEventBookingItemDto[];
}
