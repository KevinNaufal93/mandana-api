import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdatePageImageDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      "Media asset UUID. Send null to clear this slot back to the web app's own hardcoded fallback image.",
  })
  @IsOptional()
  @IsUUID()
  mediaAssetId?: string | null;

  // Only valid on a slot with supportsMobileImage: true
  // (PageImageSlotMeta) — PageImagesService.updateSlot() 400s otherwise.
  // `null` explicitly clears back to "primary image renders at every
  // width". Must be uploaded with purpose=hero_mobile. Mirrors
  // UpdateContentBlockDto.mobileMediaAssetId.
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Media asset UUID for the mobile (<1024px) crop, uploaded with purpose=hero_mobile. ' +
      'Only valid on a slot with supportsMobileImage: true — 400 otherwise. ' +
      'Send null to clear it back to the primary image rendering at every width.',
  })
  @IsOptional()
  @IsUUID()
  mobileMediaAssetId?: string | null;

  // Only meaningful on a slot with supportsHeading: true
  // (PageImageSlotMeta) — PageImagesService.updateSlot() 400s a non-empty
  // value on any other slot. `null` clears back to the web component's
  // own hardcoded fallback copy. Mirrors CreateContentBlockDto.title,
  // but optional here (unlike hero's required title) since page_images
  // always has a hardcoded fallback to fall back to.
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Admin-configurable headline. Only valid on a slot with supportsHeading: true — 400 otherwise. ' +
      "null clears back to the web component's own hardcoded copy.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  heading?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Same rules as heading, for the paragraph under it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle?: string | null;

  // Unconditionally optional (not tri-state — this is a plain boolean,
  // never cleared back to "unset"). Same enforcement as heading/subtitle:
  // PageImagesService.updateSlot() 400s `true` on a non-supporting slot.
  @ApiPropertyOptional({
    description:
      'When true, suppresses the heading/subtitle overlay entirely — for a banner-style upload that already ' +
      'has its own text baked in. Only valid on a slot with supportsHeading: true — 400 otherwise if true.',
  })
  @IsOptional()
  @IsBoolean()
  imageOnly?: boolean;
}
