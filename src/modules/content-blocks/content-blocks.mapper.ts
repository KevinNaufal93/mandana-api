import { Injectable } from '@nestjs/common';
import { MediaService, MediaImageDto } from '../media/media.service';
import { ContentBlock } from './entities/content-block.entity';
import { ContentBlockType } from './enums/content-block-type.enum';
import { ListingType } from '../properties/enums/listing-type.enum';

/**
 * Every other module with images (event-support, moving, storage,
 * properties) maps its entity's raw `mediaAsset` relation through
 * MediaService.buildImageDto() before it reaches a response — see
 * EventSupportMapper. This module returned the bare entity instead,
 * which meant its nested `mediaAsset.variants` was raw storage keys
 * (e.g. `media/<id>/400.webp`), not a URL — unusable by a consumer
 * without independently knowing the storage public base. This mapper
 * brings content-blocks in line with the rest of the API.
 */
export type ContentBlockDto = {
  id: string;
  type: ContentBlockType;
  title: string | null;
  subtitle: string | null;
  ctaText: string | null;
  link: string | null;
  mediaAssetId: string | null;
  image: MediaImageDto | null;
  sortOrder: number;
  isActive: boolean;
  imageOnly: boolean;
  listingTypeScope: ListingType[] | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ContentBlocksMapper {
  constructor(private readonly mediaService: MediaService) {}

  toDto(block: ContentBlock): ContentBlockDto {
    return {
      id: block.id,
      type: block.type,
      title: block.title,
      subtitle: block.subtitle,
      ctaText: block.ctaText,
      link: block.link,
      mediaAssetId: block.mediaAssetId,
      image: block.mediaAsset
        ? this.mediaService.buildImageDto(block.mediaAsset)
        : null,
      sortOrder: block.sortOrder,
      isActive: block.isActive,
      imageOnly: block.imageOnly,
      listingTypeScope: block.listingTypeScope,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    };
  }
}
