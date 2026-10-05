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
import { MAX_DECLARED_VALUE } from './quote-storage.dto';

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

  @ApiPropertyOptional({
    example: 50_000_000,
    minimum: 1,
    maximum: MAX_DECLARED_VALUE,
    description:
      'Customer-declared value (Rupiah) of the goods being stored — insurance is a percentage of THIS, not of the rent. A cart with several sizes becomes several sibling booking requests (see primaryBookingReference); send this ONLY on the first one — it becomes the "primary" booking and carries the insurance for the whole cart. Mutually exclusive with primaryBookingReference.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DECLARED_VALUE)
  declaredValue?: number;

  @ApiPropertyOptional({
    example: 'MDN-STG-A1B2C3',
    description:
      'Reference of an already-created PENDING booking from the same cart (same email, same facility) to link this one to as a sibling — see declaredValue above. That booking carries the declaredValue/insurance for the cart; this one is priced with no insurance of its own. Mutually exclusive with declaredValue.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  primaryBookingReference?: string;
}
