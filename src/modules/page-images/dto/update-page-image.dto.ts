import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

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
}
