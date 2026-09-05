import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StorageDurationUnit } from '../enums/storage-duration-unit.enum';
import { ValidStorageDuration } from './storage-duration.validator';

export class CreateStorageBookingDto {
  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  customerName!: string;

  @ApiProperty({ example: 'budi@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+628123456789' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    example: 'Barang berupa furnitur dan dus, akses akhir pekan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ example: 'bsd-city', description: 'StorageFacility.slug' })
  @IsString()
  facilitySlug!: string;

  @ApiProperty({ example: 'medium', description: 'StorageUnitType.slug' })
  @IsString()
  unitTypeSlug!: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;

  @ApiProperty({
    example: '2026-09-01',
    description: 'ISO 8601 date (YYYY-MM-DD)',
  })
  @IsDateString({ strict: true })
  startDate!: string;

  @ApiPropertyOptional({
    example: 6,
    minimum: 1,
    maximum: 60,
    description:
      'Legacy field, still accepted — equivalent to durationUnit: "month". Provide exactly one of durationMonths or (durationUnit + duration).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  durationMonths?: number;

  @ApiPropertyOptional({
    enum: StorageDurationUnit,
    example: StorageDurationUnit.WEEK,
    description: 'Required together with `duration`.',
  })
  @IsOptional()
  @IsEnum(StorageDurationUnit)
  durationUnit?: StorageDurationUnit;

  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    description:
      "Billable count in durationUnit's unit — up to 60 for months, 260 for weeks. Deliberately NOT @IsOptional() — see QuoteStorageDto.duration.",
  })
  @ValidStorageDuration()
  duration?: number;
}
