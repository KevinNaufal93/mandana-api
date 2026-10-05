import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StorageDurationUnit } from '../enums/storage-duration-unit.enum';
import { ValidStorageDuration } from './storage-duration.validator';

/** Sanity ceiling for a declared goods value — well inside
 *  storage_bookings.declared_value's `numeric(14,0)` precision, which is
 *  only there to rule out a fat-fingered extra digit or two, not to cap a
 *  legitimate declaration. */
export const MAX_DECLARED_VALUE = 10_000_000_000; // Rp 10 miliar

export class QuoteStorageDto {
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
      "Billable count in durationUnit's unit — up to 60 for months, 260 for weeks. Deliberately NOT @IsOptional(): the validator below must run whether or not this field is present, to catch the case where both durationMonths and duration are missing. It performs its own int/range check when this field is the active one.",
  })
  @ValidStorageDuration()
  duration?: number;

  @ApiPropertyOptional({
    example: 50_000_000,
    minimum: 1,
    maximum: MAX_DECLARED_VALUE,
    description:
      'Customer-declared value (Rupiah) of the goods being stored — insurance is a percentage of THIS, not of the rent. Omit to quote with no insurance line regardless of the configured rate.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DECLARED_VALUE)
  declaredValue?: number;
}
