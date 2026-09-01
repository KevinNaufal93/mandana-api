import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentBlock } from './entities/content-block.entity';
import { ContentBlockType } from './enums/content-block-type.enum';
import { CreateContentBlockDto } from './dto/create-content-block.dto';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';
import { QueryContentBlocksDto } from './dto/query-content-blocks.dto';
import { HomepageCacheService } from '../homepage/homepage-cache.service';

@Injectable()
export class ContentBlocksService {
  constructor(
    @InjectRepository(ContentBlock)
    private readonly repo: Repository<ContentBlock>,
    @Optional() private readonly cache?: HomepageCacheService,
  ) {}

  findAll(query: QueryContentBlocksDto): Promise<ContentBlock[]> {
    return this.repo.find({
      where: query.type ? { type: query.type } : {},
      relations: { mediaAsset: true },
      order: { type: 'ASC', sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  findActiveByType(type: ContentBlockType): Promise<ContentBlock[]> {
    return this.repo.find({
      where: { type, isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOneOrFail(id: string): Promise<ContentBlock> {
    const block = await this.repo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!block) throw new NotFoundException(`Content block ${id} not found`);
    return block;
  }

  async create(dto: CreateContentBlockDto): Promise<ContentBlock> {
    // Belt-and-suspenders with the DTO's @ValidateIf + the DB CHECK
    // constraint (chk_content_blocks_hero_requires_media): catching it
    // here too means a hero-with-no-image request fails with this
    // specific message rather than whichever of the other two happens to
    // run first.
    if (dto.type === ContentBlockType.HERO && !dto.mediaAssetId) {
      throw new BadRequestException(
        'A hero content block requires an image (mediaAssetId).',
      );
    }
    if (dto.imageOnly && !dto.mediaAssetId) {
      throw new BadRequestException(
        'A service card in image-only mode requires an image (mediaAssetId).',
      );
    }

    const block = this.repo.create({
      type: dto.type,
      mediaAssetId: dto.mediaAssetId ?? null,
      title: dto.title,
      subtitle: dto.subtitle ?? null,
      ctaText: dto.ctaText ?? null,
      link: dto.link ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      imageOnly: dto.imageOnly ?? false,
    });
    const saved = await this.repo.save(block);
    await this.cache?.bust();
    return saved;
  }

  async update(id: string, dto: UpdateContentBlockDto): Promise<ContentBlock> {
    const block = await this.findOneOrFail(id);

    // Resolve what type/mediaAssetId the row would have AFTER this patch,
    // to check the hero-requires-image rule against the actual resulting
    // state rather than just the (possibly partial) incoming fields — the
    // DTO alone can't do this cross-field check because it doesn't know
    // the row's current values.
    const nextType = dto.type ?? block.type;
    const nextMediaAssetId =
      dto.mediaAssetId !== undefined ? dto.mediaAssetId : block.mediaAssetId;
    if (nextType === ContentBlockType.HERO && !nextMediaAssetId) {
      throw new BadRequestException(
        'A hero content block requires an image (mediaAssetId) — either keep the existing one or attach a replacement before removing it.',
      );
    }
    const nextImageOnly = dto.imageOnly ?? block.imageOnly;
    if (nextImageOnly && !nextMediaAssetId) {
      throw new BadRequestException(
        'A service card in image-only mode requires an image (mediaAssetId) — either keep the existing one or attach a replacement before removing it.',
      );
    }

    Object.assign(block, {
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.subtitle !== undefined && { subtitle: dto.subtitle ?? null }),
      ...(dto.ctaText !== undefined && { ctaText: dto.ctaText ?? null }),
      ...(dto.link !== undefined && { link: dto.link ?? null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.imageOnly !== undefined && { imageOnly: dto.imageOnly }),
    });
    const saved = await this.repo.save(block);
    await this.cache?.bust();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const block = await this.findOneOrFail(id);
    await this.repo.remove(block);
    await this.cache?.bust();
  }
}
