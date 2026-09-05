import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RichText } from '../../../common/rich-text';

export class CreateStorageUnitTypeDto {
  @ApiProperty({ example: 'Medium' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'medium',
    description:
      'URL-safe slug, unique. Auto-generated from name when omitted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  @RichText()
  description?: string;

  @ApiPropertyOptional({ example: 5, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeM3?: number;

  @ApiPropertyOptional({ example: 200, minimum: 0, description: 'cm' })
  @IsOptional()
  @IsInt()
  @Min(0)
  lengthCm?: number;

  @ApiPropertyOptional({ example: 150, minimum: 0, description: 'cm' })
  @IsOptional()
  @IsInt()
  @Min(0)
  widthCm?: number;

  @ApiPropertyOptional({ example: 170, minimum: 0, description: 'cm' })
  @IsOptional()
  @IsInt()
  @Min(0)
  heightCm?: number;

  @ApiProperty({ example: 650000, minimum: 0, description: 'Rupiah, integer' })
  @IsInt()
  @Min(0)
  monthlyRate!: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minDurationMonths?: number;

  @ApiPropertyOptional({
    example: 200000,
    minimum: 0,
    description:
      'Rupiah, integer. Independent of monthlyRate, never derived from it — set explicitly for every unit type opted into weekly pricing.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyRate?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Opts this unit type into weekly pricing. Requires a positive weeklyRate (here or already on the record) — enabling this without one is a 400.',
  })
  @IsOptional()
  @IsBoolean()
  supportsWeekly?: boolean;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Falls back to 1 when unset.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minDurationWeeks?: number;

  @ApiPropertyOptional({
    description:
      'Upload an image first via POST /admin/media/upload, then pass its id',
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;
}
