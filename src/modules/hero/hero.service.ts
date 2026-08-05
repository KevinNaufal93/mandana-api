import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HeroSlide } from './entities/hero-slide.entity';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';
import { HomepageCacheService } from '../homepage/homepage-cache.service';

@Injectable()
export class HeroService {
  constructor(
    @InjectRepository(HeroSlide)
    private readonly repo: Repository<HeroSlide>,
    @Optional() private readonly cache?: HomepageCacheService,
  ) {}

  findAll(): Promise<HeroSlide[]> {
    return this.repo.find({
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  findActive(): Promise<HeroSlide[]> {
    return this.repo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOneOrFail(id: string): Promise<HeroSlide> {
    const slide = await this.repo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!slide) throw new NotFoundException(`Hero slide ${id} not found`);
    return slide;
  }

  async create(dto: CreateHeroSlideDto): Promise<HeroSlide> {
    const slide = this.repo.create({
      mediaAssetId: dto.mediaAssetId,
      title: dto.title ?? null,
      subtitle: dto.subtitle ?? null,
      ctaText: dto.ctaText ?? null,
      ctaLink: dto.ctaLink ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.repo.save(slide);
    await this.cache?.bust();
    return saved;
  }

  async update(id: string, dto: UpdateHeroSlideDto): Promise<HeroSlide> {
    const slide = await this.findOneOrFail(id);
    Object.assign(slide, {
      ...(dto.mediaAssetId !== undefined && { mediaAssetId: dto.mediaAssetId }),
      ...(dto.title !== undefined && { title: dto.title ?? null }),
      ...(dto.subtitle !== undefined && { subtitle: dto.subtitle ?? null }),
      ...(dto.ctaText !== undefined && { ctaText: dto.ctaText ?? null }),
      ...(dto.ctaLink !== undefined && { ctaLink: dto.ctaLink ?? null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    const saved = await this.repo.save(slide);
    await this.cache?.bust();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const slide = await this.findOneOrFail(id);
    await this.repo.remove(slide);
    await this.cache?.bust();
  }
}
