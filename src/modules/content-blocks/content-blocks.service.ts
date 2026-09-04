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
import { ListingType } from '../properties/enums/listing-type.enum';

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

  /**
   * Active `property_promo` cards applicable to `listingType`, in admin
   * sort order. A card with a NULL `listingTypeScope` (create()/update()
   * below normalize an empty array to NULL, so the `cardinality(...) = 0`
   * branch is defence in depth, not the primary path) applies to every
   * listing type. Served by `idx_content_blocks_type_active_sort` — `type`
   * and `isActive` are its two leading equality columns and `sortOrder`
   * its third, so no extra index is warranted for the scope filter.
   *
   * QueryBuilder (rather than `repo.find()`) is needed because the
   * three-way "NULL or empty or contains" condition doesn't express as a
   * `find()` where-clause. The explicit cast on `:listingType` mirrors the
   * `::uuid`/`::text` casts already used elsewhere in this codebase for
   * bound parameters compared against a typed column — a bare parameter
   * arrives as `unknown`/`text`, which has no `= ANY(enum[])` operator.
   */
  findActivePropertyPromos(listingType: ListingType): Promise<ContentBlock[]> {
    return this.repo
      .createQueryBuilder('cb')
      .leftJoinAndSelect('cb.mediaAsset', 'mediaAsset')
      .where('cb.type = :type', { type: ContentBlockType.PROPERTY_PROMO })
      .andWhere('cb.isActive = true')
      .andWhere(
        `(cb.listingTypeScope IS NULL
          OR cardinality(cb.listingTypeScope) = 0
          OR :listingType::"public"."properties_listing_type_enum" = ANY(cb.listingTypeScope))`,
        { listingType },
      )
      .orderBy('cb.sortOrder', 'ASC')
      .addOrderBy('cb.createdAt', 'ASC')
      .getMany();
  }

  async findOneOrFail(id: string): Promise<ContentBlock> {
    const block = await this.repo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!block) throw new NotFoundException(`Content block ${id} not found`);
    return block;
  }

  /** `[]` and `null` both mean "every listing type" for a property_promo
   *  card — collapse to the single canonical NULL so the read query never
   *  has to distinguish them and a PATCH can clear the scope with either. */
  private normalizeScope(
    scope: ListingType[] | null | undefined,
  ): ListingType[] | null {
    if (scope === undefined || scope === null || scope.length === 0)
      return null;
    return scope;
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
        'An image-only content block requires an image (mediaAssetId).',
      );
    }

    // Same belt-and-suspenders relationship with
    // chk_content_blocks_scope_promo_only. Normalizing before checking
    // means `{ type: 'hero', listingTypeScope: [] }` is accepted as a
    // no-op rather than rejected — an empty array carries no information
    // to reject, and this keeps update()'s post-patch-state check (below)
    // consistent with create()'s.
    const listingTypeScope = this.normalizeScope(dto.listingTypeScope);
    if (listingTypeScope && dto.type !== ContentBlockType.PROPERTY_PROMO) {
      throw new BadRequestException(
        'listingTypeScope is only valid on a property_promo content block.',
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
      listingTypeScope,
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
        'An image-only content block requires an image (mediaAssetId) — either keep the existing one or attach a replacement before removing it.',
      );
    }

    // Same post-patch-state pattern: this is what catches PATCHing
    // { type: 'hero' } onto a row that still carries a listingTypeScope —
    // without it, that request would reach Postgres and surface as a bare
    // 23514 CHECK violation via AllExceptionsFilter's generic backstop
    // instead of this specific message.
    const nextListingTypeScope =
      dto.listingTypeScope !== undefined
        ? this.normalizeScope(dto.listingTypeScope)
        : block.listingTypeScope;
    if (nextListingTypeScope && nextType !== ContentBlockType.PROPERTY_PROMO) {
      throw new BadRequestException(
        'listingTypeScope is only valid on a property_promo content block — clear it (send listingTypeScope: null) in the same request before changing type.',
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
      ...(dto.listingTypeScope !== undefined && {
        listingTypeScope: nextListingTypeScope,
      }),
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
