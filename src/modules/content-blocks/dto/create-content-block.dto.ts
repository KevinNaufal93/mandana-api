import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
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
import { ListingType } from '../../properties/enums/listing-type.enum';

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
      "Hero: the slide's secondary line. Service card: its description. Promo card: its body copy. Same field, same visual role in all three.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string;

  @ApiPropertyOptional({
    example: 'Lihat Properti',
    description:
      "Hero or promo card: the CTA button's label. Ignored for service_card.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaText?: string;

  @ApiPropertyOptional({
    example: '/properties?listingType=sale',
    description:
      'Hero: the CTA target. Service card: its href. Promo card: its CTA target. Same field.',
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
      'Hero, service card, or promo card: when true, the public site renders just the image (the artwork already has the title/description baked in) and skips the text overlay. Requires mediaAssetId.',
  })
  @IsOptional()
  @IsBoolean()
  imageOnly?: boolean;

  // Unconditionally optional (unlike mediaAssetId, this field has no
  // required case), so plain @IsOptional() is correct here — no
  // @ValidateIf() is needed or appropriate. The "only valid on
  // property_promo" rule is a cross-field check the DTO can't express on
  // its own (it depends on the sibling `type` field's value in a way that
  // must produce a specific 400, not silently skip validation for other
  // types); it lives in ContentBlocksService.create()/update(), mirroring
  // where the hero/imageOnly rules already live.
  @ApiPropertyOptional({
    enum: ListingType,
    isArray: true,
    description:
      'property_promo only: restrict the card to these listing types. Omit or ' +
      'send an empty array for every listing type. 400 if set on any other type.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(ListingType, { each: true })
  listingTypeScope?: ListingType[];
}
