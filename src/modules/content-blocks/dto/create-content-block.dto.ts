import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ContentBlockType } from '../enums/content-block-type.enum';

export class CreateContentBlockDto {
  @ApiProperty({ enum: ContentBlockType })
  @IsEnum(ContentBlockType)
  type!: ContentBlockType;

  @ApiProperty({ description: 'Required regardless of type.' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    description:
      "Hero: the slide's secondary line. Service card: its description. Same field, same visual role either way.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional({
    example: 'Lihat Properti',
    description: "Hero-only: the CTA button's label. Ignored for other types.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaText?: string;

  @ApiPropertyOptional({
    example: '/properties?listingType=sale',
    description: 'Hero: the CTA target. Service card: its href. Same field.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  link?: string;

  @ApiPropertyOptional({
    description:
      'MediaAsset UUID (upload first via POST /admin/media). Required when type=hero, or when imageOnly=true — either case renders nothing without an image. Optional otherwise.',
  })
  @ValidateIf(
    (o: CreateContentBlockDto) =>
      o.type === ContentBlockType.HERO ||
      o.imageOnly === true ||
      o.mediaAssetId !== undefined,
  )
  @IsUUID()
  mediaAssetId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      "Service card only: when true, the public site renders just the image (the artwork already has the title/description baked in) and skips the text overlay. Requires mediaAssetId.",
  })
  @IsOptional()
  @IsBoolean()
  imageOnly?: boolean;
}
