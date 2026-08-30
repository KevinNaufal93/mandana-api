import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingAddonKind } from './enums/moving-addon-kind.enum';
import { MovingAddonPricingModel } from './enums/moving-addon-pricing-model.enum';
import { CreateMovingAddonDto } from './dto/create-moving-addon.dto';
import { UpdateMovingAddonDto } from './dto/update-moving-addon.dto';
import { resolveUniqueSlug } from '../../common/utils/slugify';

/**
 * CRUD + lookups for the Moving Support add-on catalog (helper, packaging,
 * waiting, insurance, and the toll estimate). Split out from MovingService
 * so that service doesn't grow a second CRUD surface — mirrors the
 * EventCategoriesService / EventItemsService split.
 */
@Injectable()
export class MovingAddonsService {
  constructor(
    @InjectRepository(MovingAddon)
    private readonly repo: Repository<MovingAddon>,
  ) {}

  /** Public list — always active-only, regardless of any query param. */
  findAllPublic(): Promise<MovingAddon[]> {
    return this.repo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /** Admin list — includes inactive rows; optionally filtered by isActive. */
  findAllAdmin(isActive?: boolean): Promise<MovingAddon[]> {
    const where: FindOptionsWhere<MovingAddon> = {};
    if (isActive !== undefined) where.isActive = isActive;

    return this.repo.find({
      where,
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOneOrFail(id: string): Promise<MovingAddon> {
    const addon = await this.repo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!addon) throw new NotFoundException(`Moving addon ${id} not found`);
    return addon;
  }

  /** Resolves active addons by slug for a quote. Throws naming every slug
   * that didn't resolve to an active row, rather than silently dropping it. */
  async findActiveBySlugs(slugs: string[]): Promise<MovingAddon[]> {
    if (slugs.length === 0) return [];

    const addons = await this.repo.find({
      where: { slug: In(slugs), isActive: true },
    });

    const found = new Set(addons.map((a) => a.slug));
    const missing = slugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Moving addon(s) not found or inactive: ${missing.join(', ')}`,
      );
    }

    return addons;
  }

  /** The single active `kind: toll` row, if any. Applied automatically by
   * MovingService.quote() when the request's tollRoute is true — never
   * selected by slug like a normal addon. */
  findActiveToll(): Promise<MovingAddon | null> {
    return this.repo.findOne({
      where: { kind: MovingAddonKind.TOLL, isActive: true },
    });
  }

  private validatePricingFields(dto: {
    pricingModel?: MovingAddonPricingModel;
    unitPrice?: number;
    percentBps?: number;
    minQty?: number;
    maxQty?: number;
  }): void {
    if (dto.pricingModel === MovingAddonPricingModel.PERCENT) {
      if (dto.percentBps === undefined || dto.percentBps <= 0) {
        throw new BadRequestException(
          'percentBps is required and must be > 0 for the percent pricing model',
        );
      }
    } else if (dto.pricingModel !== undefined) {
      if (dto.unitPrice === undefined || dto.unitPrice <= 0) {
        throw new BadRequestException(
          'unitPrice is required and must be > 0 for the flat/per_unit pricing model',
        );
      }
    }

    if (
      dto.minQty !== undefined &&
      dto.maxQty !== undefined &&
      dto.maxQty < dto.minQty
    ) {
      throw new BadRequestException('maxQty must be >= minQty');
    }
  }

  private async assertSingleActiveToll(
    kind: MovingAddonKind | undefined,
    isActive: boolean | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (kind !== MovingAddonKind.TOLL || isActive === false) return;

    const existing = await this.repo.findOne({
      where: { kind: MovingAddonKind.TOLL, isActive: true },
    });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Another active toll addon already exists ("${existing.name}") — deactivate it first.`,
      );
    }
  }

  async create(dto: CreateMovingAddonDto): Promise<MovingAddon> {
    this.validatePricingFields(dto);
    await this.assertSingleActiveToll(dto.kind, dto.isActive ?? true);

    const slug = await resolveUniqueSlug(this.repo, dto.slug ?? dto.name);

    const addon = this.repo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      kind: dto.kind,
      pricingModel: dto.pricingModel,
      unitPrice: dto.unitPrice ?? 0,
      percentBps: dto.percentBps ?? null,
      minCharge: dto.minCharge ?? null,
      maxCharge: dto.maxCharge ?? null,
      unitLabel: dto.unitLabel ?? null,
      minQty: dto.minQty ?? 1,
      maxQty: dto.maxQty ?? 10,
      doublesOnRoundTrip: dto.doublesOnRoundTrip ?? false,
      mediaAssetId: dto.mediaAssetId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.repo.save(addon);
    return this.findOneOrFail(saved.id);
  }

  async update(id: string, dto: UpdateMovingAddonDto): Promise<MovingAddon> {
    const addon = await this.findOneOrFail(id);

    this.validatePricingFields({
      pricingModel: dto.pricingModel ?? addon.pricingModel,
      unitPrice: dto.unitPrice ?? addon.unitPrice,
      percentBps: dto.percentBps ?? addon.percentBps ?? undefined,
      minQty: dto.minQty ?? addon.minQty,
      maxQty: dto.maxQty ?? addon.maxQty,
    });
    await this.assertSingleActiveToll(
      dto.kind ?? addon.kind,
      dto.isActive ?? addon.isActive,
      id,
    );

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await resolveUniqueSlug(
            this.repo,
            dto.slug ?? dto.name ?? addon.name,
            id,
          )
        : undefined;

    Object.assign(addon, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.kind !== undefined && { kind: dto.kind }),
      ...(dto.pricingModel !== undefined && { pricingModel: dto.pricingModel }),
      ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
      ...(dto.percentBps !== undefined && {
        percentBps: dto.percentBps ?? null,
      }),
      ...(dto.minCharge !== undefined && { minCharge: dto.minCharge ?? null }),
      ...(dto.maxCharge !== undefined && { maxCharge: dto.maxCharge ?? null }),
      ...(dto.unitLabel !== undefined && { unitLabel: dto.unitLabel ?? null }),
      ...(dto.minQty !== undefined && { minQty: dto.minQty }),
      ...(dto.maxQty !== undefined && { maxQty: dto.maxQty }),
      ...(dto.doublesOnRoundTrip !== undefined && {
        doublesOnRoundTrip: dto.doublesOnRoundTrip,
      }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.repo.save(addon);
    return this.findOneOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const addon = await this.findOneOrFail(id);
    await this.repo.remove(addon);
  }
}
