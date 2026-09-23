import { Injectable } from '@nestjs/common';
import { MediaService, MediaImageDto } from '../media/media.service';
import { PageImage } from './entities/page-image.entity';

export type PageImagePayload = {
  slotKey: string;
  image: MediaImageDto | null;
  mobileImage: MediaImageDto | null;
  heading: string | null;
  subtitle: string | null;
  imageOnly: boolean;
};

/** Same reasoning as SeoMapper/ContentBlocksMapper: entities carry a raw
 *  `mediaAsset` relation (storage keys, not URLs) — every response goes
 *  through MediaService.buildImageDto() first. */
@Injectable()
export class PageImagesMapper {
  constructor(private readonly mediaService: MediaService) {}

  toPayload(row: PageImage): PageImagePayload {
    return {
      slotKey: row.slotKey,
      image: row.mediaAsset
        ? this.mediaService.buildImageDto(row.mediaAsset)
        : null,
      mobileImage: row.mobileMediaAsset
        ? this.mediaService.buildImageDto(row.mobileMediaAsset)
        : null,
      heading: row.heading,
      subtitle: row.subtitle,
      imageOnly: row.imageOnly,
    };
  }
}
