import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Amenity } from '../amenities/entities/amenity.entity';
import { User } from '../users/entities/user.entity';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { QueryAdminPropertiesDto } from './dto/query-admin-properties.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { UpdatePropertyImageDto } from './dto/update-property-image.dto';
import { PropertyImageInputDto } from './dto/property-image-input.dto';
import { PropertyStatus } from './enums/property-status.enum';
import { PropertySort } from './enums/property-sort.enum';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { MediaService } from '../media/media.service';
import { MediaAsset } from '../media/entities/media-asset.entity';
import { HomepageCacheService } from '../homepage/homepage-cache.service';
import {
  PropertyMapper,
  PropertyCard,
  PropertyDetail,
} from './property.mapper';
import { resolveUniqueSlug } from '../../common/utils/slugify';
import { richTextToPlain } from '../../common/rich-text';

/** Plan computed by `planImageReconcile()` before the write transaction opens. */
interface ImageReconcilePlan {
  toCreate: {
    mediaAssetId: string;
    asset: MediaAsset;
    alt: string | null;
    sortOrder: number;
    isCover: boolean;
  }[];
  toUpdate: {
    image: PropertyImage;
    changes: Pick<PropertyImage, 'alt' | 'sortOrder' | 'isCover'>;
  }[];
  toDelete: PropertyImage[];
}

const DETAIL_RELATIONS = {
  images: { mediaAsset: true },
  propertyType: true,
  amenities: true,
  agent: { photoMediaAsset: true },
} as const;

const SIMILAR_DEFAULT_LIMIT = 4;
const SIMILAR_MAX_LIMIT = 12;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepo: Repository<Property>,
    @InjectRepository(PropertyType)
    private readonly propertyTypesRepo: Repository<PropertyType>,
    @InjectRepository(PropertyImage)
    private readonly propertyImagesRepo: Repository<PropertyImage>,
    @InjectRepository(Amenity)
    private readonly amenitiesRepo: Repository<Amenity>,
    private readonly mediaService: MediaService,
    private readonly mapper: PropertyMapper,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Optional() private readonly cache?: HomepageCacheService,
  ) {}

  // ─── Public endpoints ───────────────────────────────────────────────────────

  async findAll(query: QueryPropertiesDto): Promise<PaginatedResult<Property>> {
    const {
      page,
      limit,
      listingType,
      city,
      propertyTypeSlug,
      minPrice,
      maxPrice,
      isFeatured,
      minBedrooms,
      sort,
      search,
    } = query;

    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('img.mediaAsset', 'imgAsset')
      .leftJoinAndSelect('p.propertyType', 'pt')
      .where('p.status = :status', { status: PropertyStatus.PUBLISHED });

    if (search) {
      qb.andWhere(
        `to_tsvector('simple', COALESCE(p.title,'') || ' ' || COALESCE(p.city,'') || ' ' || COALESCE(p.province,'') || ' ' || COALESCE(p.area,'') || ' ' || COALESCE(p.address,'') || ' ' || COALESCE(p.description_text,'')) @@ websearch_to_tsquery('simple', :search)`,
        { search },
      );
    }
    if (listingType)
      qb.andWhere('p.listingType = :listingType', { listingType });
    if (city)
      qb.andWhere('LOWER(p.city) LIKE :city', {
        city: `%${city.toLowerCase()}%`,
      });
    if (propertyTypeSlug)
      qb.andWhere('pt.slug = :propertyTypeSlug', { propertyTypeSlug });
    if (minPrice !== undefined)
      qb.andWhere('p.price >= :minPrice', { minPrice });
    if (maxPrice !== undefined)
      qb.andWhere('p.price <= :maxPrice', { maxPrice });
    if (isFeatured !== undefined)
      qb.andWhere('p.isFeatured = :isFeatured', { isFeatured });
    if (minBedrooms !== undefined)
      qb.andWhere('p.bedrooms >= :minBedrooms', { minBedrooms });

    const orderMap = {
      [PropertySort.NEWEST]: ['p.createdAt', 'DESC'],
      [PropertySort.OLDEST]: ['p.createdAt', 'ASC'],
      [PropertySort.PRICE_ASC]: ['p.price', 'ASC'],
      [PropertySort.PRICE_DESC]: ['p.price', 'DESC'],
    } as const;

    const [col, dir] = orderMap[sort ?? PropertySort.NEWEST];
    const offset = (page - 1) * limit;
    qb.orderBy(col, dir).skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((p) => this.toPublicListResponse(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string): Promise<PropertyDetail> {
    const property = await this.propertiesRepo.findOne({
      where: { slug, status: PropertyStatus.PUBLISHED },
      relations: DETAIL_RELATIONS,
    });
    if (!property) throw new NotFoundException(`Property '${slug}' not found`);
    return this.mapper.toDetail(property, { exact: false });
  }

  findAllTypes(): Promise<PropertyType[]> {
    return this.propertyTypesRepo.find({ order: { name: 'ASC' } });
  }

  async findSimilar(
    slug: string,
    limit = SIMILAR_DEFAULT_LIMIT,
  ): Promise<PropertyCard[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), SIMILAR_MAX_LIMIT);

    const source = await this.propertiesRepo.findOne({
      where: { slug, status: PropertyStatus.PUBLISHED },
    });
    if (!source) throw new NotFoundException(`Property '${slug}' not found`);

    // TypeORM's paginated (take + joined relations) query builder can only
    // ORDER BY an aliased SELECT expression, not an arbitrary raw fragment —
    // so the score has to be `addSelect`-ed under an alias first.
    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('img.mediaAsset', 'imgAsset')
      .leftJoinAndSelect('p.propertyType', 'pt')
      .addSelect(
        `(
          CASE WHEN :typeId::uuid IS NOT NULL AND p.propertyTypeId = :typeId THEN 3 ELSE 0 END
          + CASE WHEN :city::text IS NOT NULL AND LOWER(p.city) = LOWER(:city) THEN 2 ELSE 0 END
          + CASE WHEN :area::text IS NOT NULL AND LOWER(p.area) = LOWER(:area) THEN 1 ELSE 0 END
          + CASE WHEN p.price BETWEEN :priceLow AND :priceHigh THEN 2 ELSE 0 END
        )`,
        'score',
      )
      .where('p.status = :status', { status: PropertyStatus.PUBLISHED })
      .andWhere('p.id <> :id', { id: source.id })
      .andWhere('p.listingType = :listingType', {
        listingType: source.listingType,
      })
      .orderBy('score', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .setParameters({
        typeId: source.propertyTypeId,
        city: source.city,
        area: source.area,
        priceLow: Number(source.price) * 0.7,
        priceHigh: Number(source.price) * 1.3,
      })
      .take(boundedLimit);

    const similar = await qb.getMany();
    return similar.map((p) => this.mapper.toCard(p));
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────────

  async adminFindAll(
    query: QueryAdminPropertiesDto,
  ): Promise<PaginatedResult<Property>> {
    const { page, limit, status, listingType, search, propertyTypeId } = query;

    const qb = this.propertiesRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'img')
      .leftJoinAndSelect('img.mediaAsset', 'imgAsset')
      .leftJoinAndSelect('p.propertyType', 'pt');

    if (status) qb.andWhere('p.status = :status', { status });
    if (listingType)
      qb.andWhere('p.listingType = :listingType', { listingType });
    if (search) {
      qb.andWhere(
        `to_tsvector('simple', COALESCE(p.title,'') || ' ' || COALESCE(p.city,'') || ' ' || COALESCE(p.province,'') || ' ' || COALESCE(p.area,'') || ' ' || COALESCE(p.address,'') || ' ' || COALESCE(p.description_text,'')) @@ websearch_to_tsquery('simple', :search)`,
        { search },
      );
    }
    if (propertyTypeId)
      qb.andWhere('p.propertyTypeId = :propertyTypeId', { propertyTypeId });

    const offset = (page - 1) * limit;
    qb.orderBy('p.createdAt', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((p) => this.toPropertyResponse(p)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async adminFindOne(id: string): Promise<PropertyDetail> {
    const property = await this.propertiesRepo.findOne({
      where: { id },
      relations: DETAIL_RELATIONS,
    });
    if (!property) throw new NotFoundException(`Property ${id} not found`);
    return this.mapper.toDetail(property, { exact: true });
  }

  async create(dto: CreatePropertyDto, currentUser: User): Promise<Property> {
    const slug = await resolveUniqueSlug(
      this.propertiesRepo,
      dto.slug ?? dto.title,
    );
    const amenities = await this.resolveAmenities(dto.amenityIds);

    const property = this.propertiesRepo.create({
      slug,
      title: dto.title,
      description: dto.description ?? null,
      descriptionText: richTextToPlain(dto.description),
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
      agentId: dto.agentId ?? currentUser.id,
      ...(amenities !== undefined && { amenities }),
    });

    const saved = await this.propertiesRepo.save(property);
    await this.cache?.bust();
    return saved;
  }

  /**
   * Updates scalar property fields and, optionally, the property's complete
   * image set in one call. When `dto.images` is present, the field save and
   * the image add/update/delete reconcile commit together in a single
   * transaction (all-or-nothing) — see `planImageReconcile`/
   * `applyImageReconcile` below. When it's absent, images are left
   * untouched and this behaves exactly as before (a plain `save()`, which
   * TypeORM already wraps in its own internal transaction together with
   * the `amenities` join-table sync).
   *
   * Returns the full detail shape (same as `adminFindOne`/`GET :id`) rather
   * than the raw saved entity, so callers don't need a follow-up fetch to
   * see current images/propertyType/agent.
   */
  async update(id: string, dto: UpdatePropertyDto): Promise<PropertyDetail> {
    const property = await this.adminFindOneRaw(id);

    if (dto.slug !== undefined && dto.slug !== property.slug) {
      if (property.status === PropertyStatus.PUBLISHED) {
        throw new ConflictException(
          'Cannot change the slug of a published property; unpublish it first',
        );
      }
    }
    const slug =
      dto.slug !== undefined && dto.slug !== property.slug
        ? await resolveUniqueSlug(this.propertiesRepo, dto.slug, id)
        : undefined;

    const amenities = await this.resolveAmenities(dto.amenityIds);

    const fieldChanges = {
      ...(slug !== undefined && { slug }),
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
        descriptionText: richTextToPlain(dto.description),
      }),
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
      ...(dto.propertyTypeId !== undefined && {
        propertyTypeId: dto.propertyTypeId ?? null,
      }),
      ...(dto.agentId !== undefined && { agentId: dto.agentId }),
      ...(amenities !== undefined && { amenities }),
    };

    if (dto.images === undefined) {
      Object.assign(property, fieldChanges);
      await this.propertiesRepo.save(property);
      await this.cache?.bust();
      return this.adminFindOne(id);
    }

    // Images are part of this request: validate the whole batch (pure
    // reads — safe outside a transaction under Postgres's default READ
    // COMMITTED) before opening the transaction that actually writes.
    const imagePlan = await this.planImageReconcile(id, dto.images);
    const orphanedMediaAssetIds = imagePlan.toDelete
      .map((img) => img.mediaAssetId)
      .filter((assetId): assetId is string => assetId !== null);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const propertyRepo = queryRunner.manager.getRepository(Property);
      Object.assign(property, fieldChanges);
      await propertyRepo.save(property);
      await this.applyImageReconcile(queryRunner.manager, id, imagePlan);
      await queryRunner.commitTransaction();
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.cache?.bust();

    // Best-effort, post-commit: an S3 delete can't be rolled back, so it
    // must never run inside the DB transaction above. A leftover
    // unreferenced MediaAsset row is a recoverable state; aborting an
    // otherwise-successful save because this cleanup call failed would not
    // be — so failures here are logged and swallowed, not thrown.
    if (orphanedMediaAssetIds.length > 0) {
      const results = await Promise.allSettled(
        orphanedMediaAssetIds.map((assetId) =>
          this.mediaService.delete(assetId),
        ),
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          this.logger.error(
            `Failed to clean up orphaned media asset ${orphanedMediaAssetIds[i]} after property ${id} update`,
            r.reason,
          );
        }
      });
    }

    return this.adminFindOne(id);
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

    const asset = await this.mediaService.upload(file, {
      purpose: 'cover',
      alt: dto.alt,
    });

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

  private async findImageOrFail(
    propertyId: string,
    imageId: string,
  ): Promise<PropertyImage> {
    const image = await this.propertyImagesRepo.findOne({
      where: { id: imageId, propertyId },
    });
    if (!image)
      throw new NotFoundException(
        `Image ${imageId} not found on property ${propertyId}`,
      );
    return image;
  }

  /** Loads amenities by id and validates every id exists; returns undefined when not supplied. */
  private async resolveAmenities(
    amenityIds?: string[],
  ): Promise<Amenity[] | undefined> {
    if (amenityIds === undefined) return undefined;
    if (amenityIds.length === 0) return [];

    const found = await this.amenitiesRepo.findBy({ id: In(amenityIds) });
    if (found.length !== amenityIds.length) {
      const foundIds = new Set(found.map((a) => a.id));
      const missing = amenityIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `Unknown amenity id(s): ${missing.join(', ')}`,
      );
    }
    return found;
  }

  /**
   * Diffs the incoming `images` array against the property's current
   * `PropertyImage` rows and validates every referenced id, without
   * writing anything. `PropertyImageInputDto`'s validator already
   * guarantees each entry has exactly one of `id`/`mediaAssetId` and that
   * at most one entry has `isCover: true`, so this only needs to check
   * that every *referenced* id/mediaAssetId actually exists.
   *
   * Deliberately does not assign `property.images = [...]` and save the
   * parent: `Property.images` is `{ cascade: true }` without
   * `orphanedRowAction: 'delete'`, so TypeORM would cascade inserts/updates
   * but silently skip deleting rows dropped from the array. Reconciling
   * `PropertyImage` rows directly (via `applyImageReconcile`) avoids that.
   */
  private async planImageReconcile(
    propertyId: string,
    incoming: PropertyImageInputDto[],
  ): Promise<ImageReconcilePlan> {
    const existing = await this.propertyImagesRepo.find({
      where: { propertyId },
    });
    const existingById = new Map(existing.map((img) => [img.id, img]));

    const unknownIds = incoming
      .filter((e) => e.id !== undefined && !existingById.has(e.id))
      .map((e) => e.id!);
    if (unknownIds.length > 0) {
      throw new BadRequestException(
        `Unknown image id(s): ${unknownIds.join(', ')}`,
      );
    }

    // Two entries referencing the same existing row would otherwise both
    // land in toUpdate below and silently last-write-wins onto one row.
    const idCounts = new Map<string, number>();
    incoming.forEach((e) => {
      if (e.id !== undefined) idCounts.set(e.id, (idCounts.get(e.id) ?? 0) + 1);
    });
    const duplicateIds = [...idCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    if (duplicateIds.length > 0) {
      throw new BadRequestException(
        `Duplicate image id(s) in images: ${duplicateIds.join(', ')}`,
      );
    }

    const assetIds = incoming
      .filter((e) => e.mediaAssetId !== undefined)
      .map((e) => e.mediaAssetId!);
    const assetById = new Map(
      (await this.mediaService.findManyByIds(assetIds)).map((a) => [a.id, a]),
    );
    const unknownAssetIds = assetIds.filter((id) => !assetById.has(id));
    if (unknownAssetIds.length > 0) {
      throw new BadRequestException(
        `Unknown media asset id(s): ${unknownAssetIds.join(', ')}`,
      );
    }

    const keepIds = new Set(
      incoming.filter((e) => e.id !== undefined).map((e) => e.id!),
    );
    const toDelete = existing.filter((img) => !keepIds.has(img.id));

    const toUpdate: ImageReconcilePlan['toUpdate'] = [];
    const toCreate: ImageReconcilePlan['toCreate'] = [];

    incoming.forEach((entry, index) => {
      // Full replacement, not merge: an omitted field takes its default
      // rather than inheriting the stored value, consistent across both
      // existing (id) and new (mediaAssetId) entries.
      const alt = entry.alt ?? null;
      const sortOrder = entry.sortOrder ?? index;
      const isCover = entry.isCover ?? false;

      if (entry.id !== undefined) {
        const image = existingById.get(entry.id)!;
        const changed =
          image.alt !== alt ||
          image.sortOrder !== sortOrder ||
          image.isCover !== isCover;
        // Skip true no-ops so an unrelated field-only save doesn't bump
        // every image's updatedAt.
        if (changed)
          toUpdate.push({ image, changes: { alt, sortOrder, isCover } });
      } else {
        const asset = assetById.get(entry.mediaAssetId!)!;
        toCreate.push({
          mediaAssetId: entry.mediaAssetId!,
          asset,
          alt,
          sortOrder,
          isCover,
        });
      }
    });

    return { toCreate, toUpdate, toDelete };
  }

  /** Applies a plan from `planImageReconcile` via the transactional manager. */
  private async applyImageReconcile(
    manager: EntityManager,
    propertyId: string,
    plan: ImageReconcilePlan,
  ): Promise<void> {
    const imagesRepo = manager.getRepository(PropertyImage);

    if (plan.toDelete.length > 0) {
      await imagesRepo.remove(plan.toDelete);
    }
    if (plan.toUpdate.length > 0) {
      await imagesRepo.save(
        plan.toUpdate.map(({ image, changes }) =>
          Object.assign(image, changes),
        ),
      );
    }
    if (plan.toCreate.length > 0) {
      const newImages = plan.toCreate.map((c) =>
        imagesRepo.create({
          propertyId,
          mediaAssetId: c.mediaAssetId,
          url: this.mediaService.buildImageDto(c.asset).url,
          alt: c.alt,
          sortOrder: c.sortOrder,
          isCover: c.isCover,
        }),
      );
      await imagesRepo.save(newImages);
    }
  }

  private toImageResponse(img: PropertyImage): PropertyImage {
    if (img.mediaAsset) {
      const dto = this.mediaService.buildImageDto(img.mediaAsset);
      return Object.assign(img, {
        url: dto.url,
        srcset: dto.srcset,
        width: dto.width,
        height: dto.height,
      });
    }
    return img;
  }

  private toPropertyResponse(property: Property): Property {
    if (property.images) {
      property.images = property.images.map((img) => this.toImageResponse(img));
    }
    return property;
  }

  /** Public list rows: image enrichment plus the same coordinate/address privacy as the detail endpoint. */
  private toPublicListResponse(property: Property): Property {
    return this.mapper.applyListLocationPrivacy(
      this.toPropertyResponse(property),
    );
  }
}
