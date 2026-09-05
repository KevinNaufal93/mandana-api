import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StorageDurationUnit } from '../enums/storage-duration-unit.enum';
import { ValidStorageDuration } from './storage-duration.validator';

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
}
