import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Collection } from './entities/collection.entity';
import { CollectionProperty } from './entities/collection-property.entity';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddCollectionPropertyDto } from './dto/add-collection-property.dto';
import { HomepageCacheService } from '../homepage/homepage-cache.service';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection)
    private readonly repo: Repository<Collection>,
    @InjectRepository(CollectionProperty)
    private readonly cpRepo: Repository<CollectionProperty>,
    @Optional() private readonly cache?: HomepageCacheService,
  ) {}

  findAll(): Promise<Collection[]> {
    return this.repo.find({
      relations: { coverMediaAsset: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  findHomepage(): Promise<Collection[]> {
    return this.repo.find({
      where: { isActive: true, showOnHomepage: true },
      relations: { coverMediaAsset: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findBySlug(slug: string): Promise<Collection> {
    const col = await this.repo.findOne({
      where: { slug, isActive: true },
      relations: {
        coverMediaAsset: true,
        collectionProperties: { property: { images: true, propertyType: true } },
      },
    });
    if (!col) throw new NotFoundException(`Collection '${slug}' not found`);
    return col;
  }

  async findOneOrFail(id: string): Promise<Collection> {
    const col = await this.repo.findOne({
      where: { id },
      relations: { coverMediaAsset: true },
    });
    if (!col) throw new NotFoundException(`Collection ${id} not found`);
    return col;
  }

  async create(dto: CreateCollectionDto): Promise<Collection> {
    const existing = await this.repo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug '${dto.slug}' already exists`);

    const col = this.repo.create({
      slug: dto.slug,
      name: dto.name,
      description: dto.description ?? null,
      coverMediaAssetId: dto.coverMediaAssetId ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      showOnHomepage: dto.showOnHomepage ?? false,
    });
    const saved = await this.repo.save(col);
    await this.cache?.bust();
    return saved;
  }

  async update(id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const col = await this.findOneOrFail(id);
    if (dto.slug && dto.slug !== col.slug) {
      const conflict = await this.repo.findOne({ where: { slug: dto.slug } });
      if (conflict) throw new ConflictException(`Slug '${dto.slug}' already exists`);
    }
    Object.assign(col, {
      ...(dto.slug !== undefined && { slug: dto.slug }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description ?? null }),
      ...(dto.coverMediaAssetId !== undefined && { coverMediaAssetId: dto.coverMediaAssetId ?? null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.showOnHomepage !== undefined && { showOnHomepage: dto.showOnHomepage }),
    });
    const saved = await this.repo.save(col);
    await this.cache?.bust();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const col = await this.findOneOrFail(id);
    await this.repo.remove(col);
    await this.cache?.bust();
  }

  async addProperty(
    collectionId: string,
    dto: AddCollectionPropertyDto,
  ): Promise<CollectionProperty> {
    await this.findOneOrFail(collectionId);
    const existing = await this.cpRepo.findOne({
      where: { collectionId, propertyId: dto.propertyId },
    });
    if (existing) throw new ConflictException('Property already in collection');

    const cp = this.cpRepo.create({
      collectionId,
      propertyId: dto.propertyId,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.cpRepo.save(cp);
    await this.cache?.bust();
    return saved;
  }

  async removeProperty(collectionId: string, propertyId: string): Promise<void> {
    const cp = await this.cpRepo.findOne({ where: { collectionId, propertyId } });
    if (!cp) throw new NotFoundException('Property not in collection');
    await this.cpRepo.remove(cp);
    await this.cache?.bust();
  }

  countProperties(collectionId: string): Promise<number> {
    return this.cpRepo.count({ where: { collectionId } });
  }
}
