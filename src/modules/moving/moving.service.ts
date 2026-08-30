import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { TruckClass } from './entities/truck-class.entity';
import { CreateTruckClassDto } from './dto/create-truck-class.dto';
import { UpdateTruckClassDto } from './dto/update-truck-class.dto';
import { QuoteMovingDto } from './dto/quote-moving.dto';
import { MovingQuoteDto } from './dto/truck-class-response.dto';
import { resolveUniqueSlug } from '../../common/utils/slugify';
import { movingQuote, MovingAddonRate } from './moving-pricing';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { MovingAddon } from './entities/moving-addon.entity';
import { MovingAddonKind } from './enums/moving-addon-kind.enum';
import { MovingAddonPricingModel } from './enums/moving-addon-pricing-model.enum';

/** Adapts a MovingAddon entity to the plain rate shape moving-pricing.ts expects. */
function toAddonRate(addon: MovingAddon): MovingAddonRate {
  return {
    slug: addon.slug,
    name: addon.name,
    kind: addon.kind,
    pricingModel: addon.pricingModel,
    unitPrice: addon.unitPrice,
    percentBps: addon.percentBps,
    minCharge: addon.minCharge,
    maxCharge: addon.maxCharge,
    minQty: addon.minQty,
    maxQty: addon.maxQty,
    doublesOnRoundTrip: addon.doublesOnRoundTrip,
  };
}

@Injectable()
export class MovingService {
  constructor(
    @InjectRepository(TruckClass)
    private readonly repo: Repository<TruckClass>,
    private readonly addonsService: MovingAddonsService,
    private readonly settingsService: MovingSettingsService,
  ) {}

  /** Public list — always active-only, regardless of any query param. */
  findAllPublic(): Promise<TruckClass[]> {
    return this.repo.find({
      where: { isActive: true },
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /** Admin list — includes inactive rows; optionally filtered by isActive. */
  findAllAdmin(isActive?: boolean): Promise<TruckClass[]> {
    const where: FindOptionsWhere<TruckClass> = {};
    if (isActive !== undefined) where.isActive = isActive;

    return this.repo.find({
      where,
      relations: { mediaAsset: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOneOrFail(id: string): Promise<TruckClass> {
    const truck = await this.repo.findOne({
      where: { id },
      relations: { mediaAsset: true },
    });
    if (!truck) throw new NotFoundException(`Truck class ${id} not found`);
    return truck;
  }

  async findActiveBySlugOrFail(slug: string): Promise<TruckClass> {
    const truck = await this.repo.findOne({ where: { slug, isActive: true } });
    if (!truck) throw new NotFoundException(`Truck class '${slug}' not found`);
    return truck;
  }

  async create(dto: CreateTruckClassDto): Promise<TruckClass> {
    const slug = await resolveUniqueSlug(this.repo, dto.slug ?? dto.name);

    const truck = this.repo.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      capacityKg: dto.capacityKg ?? null,
      volumeM3: dto.volumeM3 ?? null,
      lengthCm: dto.lengthCm ?? null,
      widthCm: dto.widthCm ?? null,
      heightCm: dto.heightCm ?? null,
      helperCount: dto.helperCount ?? null,
      baseFare: dto.baseFare,
      perKmFare: dto.perKmFare,
      includedKm: dto.includedKm ?? null,
      minFare: dto.minFare ?? null,
      mediaAssetId: dto.mediaAssetId ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.repo.save(truck);
    return this.findOneOrFail(saved.id);
  }

  async update(id: string, dto: UpdateTruckClassDto): Promise<TruckClass> {
    const truck = await this.findOneOrFail(id);

    const slug =
      dto.slug !== undefined || dto.name !== undefined
        ? await resolveUniqueSlug(
            this.repo,
            dto.slug ?? dto.name ?? truck.name,
            id,
          )
        : undefined;

    Object.assign(truck, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug !== undefined && { slug }),
      ...(dto.description !== undefined && {
        description: dto.description ?? null,
      }),
      ...(dto.capacityKg !== undefined && {
        capacityKg: dto.capacityKg ?? null,
      }),
      ...(dto.volumeM3 !== undefined && { volumeM3: dto.volumeM3 ?? null }),
      ...(dto.lengthCm !== undefined && { lengthCm: dto.lengthCm ?? null }),
      ...(dto.widthCm !== undefined && { widthCm: dto.widthCm ?? null }),
      ...(dto.heightCm !== undefined && { heightCm: dto.heightCm ?? null }),
      ...(dto.helperCount !== undefined && {
        helperCount: dto.helperCount ?? null,
      }),
      ...(dto.baseFare !== undefined && { baseFare: dto.baseFare }),
      ...(dto.perKmFare !== undefined && { perKmFare: dto.perKmFare }),
      ...(dto.includedKm !== undefined && {
        includedKm: dto.includedKm ?? null,
      }),
      ...(dto.minFare !== undefined && { minFare: dto.minFare ?? null }),
      ...(dto.mediaAssetId !== undefined && {
        mediaAssetId: dto.mediaAssetId ?? null,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });

    await this.repo.save(truck);
    return this.findOneOrFail(id);
  }

  async remove(id: string): Promise<void> {
    const truck = await this.findOneOrFail(id);
    await this.repo.remove(truck);
  }

  async quote(dto: QuoteMovingDto): Promise<MovingQuoteDto> {
    const truck = await this.findActiveBySlugOrFail(dto.truckSlug);
    const settings = await this.settingsService.get();

    const requestedAddons = dto.addons ?? [];
    const requestedSlugs = requestedAddons.map((a) => a.slug);
    const duplicateSlug = requestedSlugs.find(
      (slug, i) => requestedSlugs.indexOf(slug) !== i,
    );
    if (duplicateSlug) {
      throw new BadRequestException(`Duplicate addon slug: ${duplicateSlug}`);
    }

    const resolvedAddons =
      await this.addonsService.findActiveBySlugs(requestedSlugs);
    const addonBySlug = new Map(resolvedAddons.map((a) => [a.slug, a]));

    const tollSelectedManually = resolvedAddons.find(
      (a) => a.kind === MovingAddonKind.TOLL,
    );
    if (tollSelectedManually) {
      throw new BadRequestException(
        `"${tollSelectedManually.slug}" is a toll addon — set tollRoute instead of selecting it directly.`,
      );
    }

    const needsDeclaredValue = resolvedAddons.some(
      (a) => a.pricingModel === MovingAddonPricingModel.PERCENT,
    );
    if (needsDeclaredValue && dto.declaredValue === undefined) {
      throw new BadRequestException(
        'declaredValue is required when a percent-priced addon (e.g. insurance) is selected',
      );
    }

    const tollRoute = dto.tollRoute !== false;
    const toll = tollRoute ? await this.addonsService.findActiveToll() : null;

    const result = movingQuote(
      dto.distanceMeters,
      {
        baseFare: truck.baseFare,
        perKmFare: truck.perKmFare,
        includedKm: truck.includedKm,
        minFare: truck.minFare,
      },
      {
        roundToIdr: settings.roundToIdr,
        bandPct: settings.bandPct,
        includedKm: settings.defaultIncludedKm,
      },
      {
        roundTrip: dto.roundTrip === true,
        tollRoute,
        declaredValue: dto.declaredValue,
        toll: toll ? toAddonRate(toll) : null,
        addons: requestedAddons.map((requested) => ({
          rate: toAddonRate(addonBySlug.get(requested.slug)!),
          quantity: requested.quantity ?? 1,
        })),
      },
    );

    return {
      truck: { slug: truck.slug, name: truck.name },
      ...result,
      currency: 'IDR',
    };
  }
}
