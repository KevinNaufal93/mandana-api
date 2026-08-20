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

export class CreateTruckClassDto {
  @ApiProperty({ example: 'Pick Up Bak' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'pickup-bak',
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

  @ApiPropertyOptional({ example: 1000, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityKg?: number;

  @ApiPropertyOptional({ example: 3.5, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeM3?: number;

  @ApiPropertyOptional({
    example: 210,
    minimum: 0,
    description: 'Cargo bed length, cm',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  lengthCm?: number;

  @ApiPropertyOptional({
    example: 140,
    minimum: 0,
    description: 'Cargo bed width, cm',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  widthCm?: number;

  @ApiPropertyOptional({
    example: 120,
    minimum: 0,
    description: 'Cargo bed height, cm',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  heightCm?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  helperCount?: number;

  @ApiProperty({ example: 250000, minimum: 0, description: 'Rupiah, integer' })
  @IsInt()
  @Min(0)
  baseFare!: number;

  @ApiProperty({
    example: 4500,
    minimum: 0,
    description: 'Rupiah per km, integer',
  })
  @IsInt()
  @Min(0)
  perKmFare!: number;

  @ApiPropertyOptional({
    example: 5,
    minimum: 0,
    description: 'Km included in baseFare before perKmFare applies',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  includedKm?: number;

  @ApiPropertyOptional({
    example: 250000,
    minimum: 0,
    description: 'Rupiah floor for the total fare',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minFare?: number;

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
