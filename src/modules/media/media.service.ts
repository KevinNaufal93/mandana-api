import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MediaAsset, VariantMap } from './entities/media-asset.entity';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image-processor.service';
import { UploadMediaDto } from './dto/upload-media.dto';

export type MediaImageDto = {
  url: string;
  srcset: string;
  alt: string | null;
  width: number;
  height: number;
};

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    private readonly storage: StorageService,
    private readonly processor: ImageProcessorService,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: UploadMediaDto,
  ): Promise<MediaAsset> {
    this.processor.validate(file.mimetype, file.size);

    const { width, height } = await this.processor.intrinsicSize(file.buffer);
    const id = uuidv4();
    const baseKey = `media/${id}`;

    const processedVariants = await this.processor.generateVariants(
      file.buffer,
      baseKey,
      dto.purpose,
    );

    await Promise.all(
      processedVariants.map((v) =>
        this.storage.put(v.key, v.buffer, v.contentType),
      ),
    );

    const variants: VariantMap = {};
    for (const v of processedVariants) {
      if (!variants[v.format]) variants[v.format] = {};
      variants[v.format][v.width] = v.key;
    }

    const asset = this.mediaRepo.create({
      storageKey: baseKey,
      variants,
      mimeType: file.mimetype,
      width,
      height,
      sizeBytes: file.size,
      alt: dto.alt ?? null,
    });

    return this.mediaRepo.save(asset);
  }

  async delete(id: string): Promise<void> {
    const asset = await this.mediaRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Media asset ${id} not found`);

    const keys = Object.values(asset.variants).flatMap((fmtMap) =>
      Object.values(fmtMap),
    );
    await Promise.allSettled(keys.map((k) => this.storage.delete(k)));
    await this.mediaRepo.remove(asset);
  }

  buildImageDto(asset: MediaAsset): MediaImageDto {
    const webpVariants = asset.variants['webp'] ?? {};
    const sortedWidths = Object.keys(webpVariants)
      .map(Number)
      .sort((a, b) => a - b);

    const srcset = sortedWidths
      .map((w) => `${this.storage.buildUrl(webpVariants[w])} ${w}w`)
      .join(', ');

    const fallbackKey =
      asset.variants['jpeg']?.[sortedWidths[sortedWidths.length - 1]] ??
      asset.variants['webp']?.[sortedWidths[sortedWidths.length - 1]];

    return {
      url: fallbackKey ? this.storage.buildUrl(fallbackKey) : '',
      srcset,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
    };
  }
}
