import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateHeroSlideDto {
  @ApiProperty({ description: 'MediaAsset UUID (upload first via POST /admin/media)' })
  @IsUUID()
  mediaAssetId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Lihat Properti' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaText?: string;

  @ApiPropertyOptional({ example: '/properties?listingType=sale' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaLink?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
