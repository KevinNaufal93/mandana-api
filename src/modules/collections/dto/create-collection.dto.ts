import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { RichText } from '../../../common/rich-text';

export class CreateCollectionDto {
  @ApiProperty({ example: 'bsd-city', description: 'URL-safe slug, unique' })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @ApiProperty({ example: 'BSD City' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @RichText()
  description?: string;

  @ApiPropertyOptional({ description: 'MediaAsset UUID for the cover image' })
  @IsOptional()
  @IsUUID()
  coverMediaAssetId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  showOnHomepage?: boolean;
}
