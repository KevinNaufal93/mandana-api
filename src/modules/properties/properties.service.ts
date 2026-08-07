import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { QueryAdminPropertiesDto } from './dto/query-admin-properties.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { UpdatePropertyImageDto } from './dto/update-property-image.dto';
import { PropertyStatus } from './enums/property-status.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { MediaService } from '../media/media.service';
import { HomepageCacheService } from '../homepage/homepage-cache.service';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepo: Repository<Property>,
    @InjectRepository(PropertyType)
    private readonly propertyTypesRepo: Repository<PropertyType>,
    @InjectRepository(PropertyImage)
    private readonly propertyImagesRepo: Repository<PropertyImage>,
    private readonly mediaService: MediaService,
    @Optional() private readonly cache?: HomepageCacheService,
  ) {}

  // ─── Public endpoints ───────────────────────────────────────────────────────

  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<Property>> {
    const { page, limit, listingType, city, propertyTypeSlug, minPrice, maxPrice, isFeatured } = query;

    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('img.mediaAsset', 'imgAsset')
      .leftJoinAndSelect('p.propertyType', 'pt')
      .where('p.status = :status', { status: PropertyStatus.PUBLISHED });

    if (listingType) qb.andWhere('p.listingType = :listingType', { listingType });
    if (city) qb.andWhere('LOWER(p.city) LIKE :city', { city: `%${city.toLowerCase()}%` });
    if (propertyTypeSlug) qb.andWhere('pt.slug = :propertyTypeSlug', { propertyTypeSlug });
    if (minPrice !== undefined) qb.andWhere('p.price >= :minPrice', { minPrice });
    if (maxPrice !== undefined) qb.andWhere('p.price <= :maxPrice', { maxPrice });
    if (isFeatured !== undefined) qb.andWhere('p.isFeatured = :isFeatured', { isFeatured });

    const offset = (page - 1) * limit;
    qb.orderBy('p.createdAt', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((p) => this.toPropertyResponse(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string): Promise<Property> {
    const property = await this.propertiesRepo.findOne({
      where: { slug, status: PropertyStatus.PUBLISHED },
      relations: { images: { mediaAsset: true }, propertyType: true },
    });
    if (!property) throw new NotFoundException(`Property '${slug}' not found`);
    return this.toPropertyResponse(property);
  }

  findAllTypes(): Promise<PropertyType[]> {
    return this.propertyTypesRepo.find({ order: { name: 'ASC' } });
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────────

  async adminFindAll(query: QueryAdminPropertiesDto): Promise<PaginatedResult<Property>> {
    const { page, limit, status, listingType, search, propertyTypeId } = query;

    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('img.mediaAsset', 'imgAsset')
      .leftJoinAndSelect('p.propertyType', 'pt');

    if (status) qb.andWhere('p.status = :status', { status });
    if (listingType) qb.andWhere('p.listingType = :listingType', { listingType });
    if (search) {
      qb.andWhere('(LOWER(p.title) LIKE :search OR LOWER(p.slug) LIKE :search)', {
        search: `%${search.toLowerCase()}%`,
      });
    }
    if (propertyTypeId) qb.andWhere('p.propertyTypeId = :propertyTypeId', { propertyTypeId });

    const offset = (page - 1) * limit;
    qb.orderBy('p.createdAt', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((p) => this.toPropertyResponse(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async adminFindOne(id: string): Promise<Property> {
    const property = await this.propertiesRepo.findOne({
      where: { id },
      relations: { images: { mediaAsset: true }, propertyType: true },
    });
    if (!property) throw new NotFoundException(`Property ${id} not found`);
    return this.toPropertyResponse(property);
  }

  async create(dto: CreatePropertyDto): Promise<Property> {
    const existing = await this.propertiesRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug '${dto.slug}' already exists`);

    const property = this.propertiesRepo.create({
      slug: dto.slug,
      title: dto.title,
      description: dto.description ?? null,
      listingType: dto.listingType,
      status: dto.status,
      price: dto.price,
      currency: dto.currency ?? 'IDR',
      bedrooms: dto.bedrooms ?? null,
      bathrooms: dto.bathrooms ?? null,
      areaSqm: dto.areaSqm ?? null,
      address: dto.address ?? null,
      area: dto.area ?? null,
      city: dto.city ?? null,
      province: dto.province ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      isFeatured: dto.isFeatured ?? false,
      propertyTypeId: dto.propertyTypeId ?? null,
    });

    const saved = await this.propertiesRepo.save(property);
    await this.cache?.bust();
    return saved;
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.adminFindOneRaw(id);

    if (dto.slug && dto.slug !== property.slug) {
      const conflict = await this.propertiesRepo.findOne({ where: { slug: dto.slug } });
      if (conflict) throw new ConflictException(`Slug '${dto.slug}' already exists`);
    }

    Object.assign(property, {
      ...(dto.slug !== undefined && { slug: dto.slug }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description ?? null }),
      ...(dto.listingType !== undefined && { listingType: dto.listingType }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.bedrooms !== undefined && { bedrooms: dto.bedrooms ?? null }),
      ...(dto.bathrooms !== undefined && { bathrooms: dto.bathrooms ?? null }),
      ...(dto.areaSqm !== undefined && { areaSqm: dto.areaSqm ?? null }),
      ...(dto.address !== undefined && { address: dto.address ?? null }),
      ...(dto.area !== undefined && { area: dto.area ?? null }),
      ...(dto.city !== undefined && { city: dto.city ?? null }),
      ...(dto.province !== undefined && { province: dto.province ?? null }),
      ...(dto.latitude !== undefined && { latitude: dto.latitude ?? null }),
      ...(dto.longitude !== undefined && { longitude: dto.longitude ?? null }),
      ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
      ...(dto.propertyTypeId !== undefined && { propertyTypeId: dto.propertyTypeId ?? null }),
    });

    const saved = await this.propertiesRepo.save(property);
    await this.cache?.bust();
    return saved;
  }

  async remove(id: string): Promise<void> {
    const property = await this.adminFindOneRaw(id);
    await this.propertiesRepo.remove(property);
    await this.cache?.bust();
  }

  // ─── Admin image management ──────────────────────────────────────────────────

  async addImage(
    propertyId: string,
    file: Express.Multer.File,
    dto: AddPropertyImageDto,
  ): Promise<PropertyImage> {
    await this.adminFindOneRaw(propertyId);

    const asset = await this.mediaService.upload(file, { purpose: 'cover', alt: dto.alt });

    const isCover = dto.isCover ?? false;
    if (isCover) {
      await this.propertyImagesRepo.update({ propertyId }, { isCover: false });
    }

    const imageUrl = this.mediaService.buildImageDto(asset).url;

    const image = this.propertyImagesRepo.create({
      propertyId,
      mediaAssetId: asset.id,
      url: imageUrl,
      alt: dto.alt ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isCover,
    });

    const saved = await this.propertyImagesRepo.save(image);
    await this.cache?.bust();
    return this.toImageResponse({ ...saved, mediaAsset: asset });
  }

  async updateImage(
    propertyId: string,
    imageId: string,
    dto: UpdatePropertyImageDto,
  ): Promise<PropertyImage> {
    const image = await this.findImageOrFail(propertyId, imageId);

    if (dto.isCover === true && !image.isCover) {
      await this.propertyImagesRepo.update({ propertyId }, { isCover: false });
    }

    Object.assign(image, {
      ...(dto.alt !== undefined && { alt: dto.alt ?? null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.isCover !== undefined && { isCover: dto.isCover }),
    });

    const saved = await this.propertyImagesRepo.save(image);
    await this.cache?.bust();

    const withAsset = await this.propertyImagesRepo.findOne({
      where: { id: saved.id },
      relations: { mediaAsset: true },
    });
    return this.toImageResponse(withAsset!);
  }

  async removeImage(propertyId: string, imageId: string): Promise<void> {
    const image = await this.findImageOrFail(propertyId, imageId);
    const mediaAssetId = image.mediaAssetId;

    await this.propertyImagesRepo.remove(image);

    if (mediaAssetId) {
      await this.mediaService.delete(mediaAssetId);
    }

    await this.cache?.bust();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async adminFindOneRaw(id: string): Promise<Property> {
    const property = await this.propertiesRepo.findOne({ where: { id } });
    if (!property) throw new NotFoundException(`Property ${id} not found`);
    return property;
  }

  private async findImageOrFail(propertyId: string, imageId: string): Promise<PropertyImage> {
    const image = await this.propertyImagesRepo.findOne({
      where: { id: imageId, propertyId },
    });
    if (!image) throw new NotFoundException(`Image ${imageId} not found on property ${propertyId}`);
    return image;
  }

  private toImageResponse(img: PropertyImage): PropertyImage {
    if (img.mediaAsset) {
      const dto = this.mediaService.buildImageDto(img.mediaAsset);
      return Object.assign(img, { url: dto.url, srcset: dto.srcset, width: dto.width, height: dto.height });
    }
    return img;
  }

  private toPropertyResponse(property: Property): Property {
    if (property.images) {
      property.images = property.images.map((img) => this.toImageResponse(img));
    }
    return property;
  }
}
