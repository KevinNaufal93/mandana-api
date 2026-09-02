import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { MovingLead } from './entities/moving-lead.entity';
import { MovingLeadStop } from './entities/moving-lead-stop.entity';
import { MovingLeadAddon } from './entities/moving-lead-addon.entity';
import { MovingLeadStatus } from './enums/moving-lead-status.enum';
import { CreateMovingLeadDto } from './dto/create-moving-lead.dto';
import { QueryMovingLeadsDto } from './dto/query-moving-leads.dto';
import { UpdateMovingLeadDto } from './dto/update-moving-lead.dto';
import { MovingService } from './moving.service';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import {
  generateBookingReference,
  MAX_REFERENCE_ATTEMPTS,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../common/utils/booking-reference';

@Injectable()
export class MovingLeadsService {
  constructor(
    @InjectRepository(MovingLead)
    private readonly leadRepo: Repository<MovingLead>,
    @InjectRepository(MovingLeadStop)
    private readonly stopRepo: Repository<MovingLeadStop>,
    @InjectRepository(MovingLeadAddon)
    private readonly addonRepo: Repository<MovingLeadAddon>,
    private readonly movingService: MovingService,
  ) {}

  async findOneOrFail(id: string): Promise<MovingLead> {
    const lead = await this.leadRepo.findOne({
      where: { id },
      relations: { stops: true, addons: true },
    });
    if (!lead) throw new NotFoundException(`Moving lead ${id} not found`);
    return lead;
  }

  /** Filters shared by the count and id-page queries below — split out so
   * neither query carries the joined `stops`/`addons` collections:
   * paginating a query-builder with a joined one-to-many multiplies rows and
   * corrupts both `skip`/`take` and the total count (same hazard
   * EventBookingsService.findAllAdmin() documents — unlike Storage's admin
   * listing, whose joins are all many-to-one, MovingLead has *two*
   * one-to-many children). Fetch matching ids first, then load the full
   * entity graph for just that page. */
  private buildFilteredQb(query: QueryMovingLeadsDto) {
    const qb = this.leadRepo.createQueryBuilder('l');
    if (query.status) {
      qb.andWhere('l.status = :status', { status: query.status });
    }
    return qb;
  }

  async findAllAdmin(
    query: QueryMovingLeadsDto,
  ): Promise<PaginatedResult<MovingLead>> {
    const { page, limit } = query;

    const total = await this.buildFilteredQb(query).getCount();

    const idRows = await this.buildFilteredQb(query)
      .select('l.id', 'id')
      .orderBy('l.createdAt', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany<{ id: string }>();

    const ids = idRows.map((r) => r.id);
    const rows =
      ids.length === 0
        ? []
        : await this.leadRepo.find({
            where: { id: In(ids) },
            relations: { stops: true, addons: true },
          });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((r): r is MovingLead => !!r);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Persists the order a customer configured, the moment they click "Pesan
   * via WhatsApp" — before the real conversation/confirmation happens over
   * WhatsApp with a human. Always recomputes the price server-side via
   * `MovingService.buildQuote()` (the exact same validated path
   * `POST /moving/quote` uses) rather than trusting anything the client
   * sends — this is the third module using the reference-collision retry
   * loop from `booking-reference.ts` (Storage, Event Support, now Moving),
   * copied verbatim.
   */
  async create(dto: CreateMovingLeadDto): Promise<MovingLead> {
    const { truck, result } = await this.movingService.buildQuote(dto);

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      const lead = this.leadRepo.create({
        reference: generateBookingReference('MDN-MOV'),
        status: MovingLeadStatus.NEW,
        truckSlug: truck.slug,
        truckName: truck.name,
        pickupAddress: dto.pickup.address ?? null,
        pickupLat: dto.pickup.lat,
        pickupLng: dto.pickup.lng,
        distanceKm: result.distanceKm,
        includedKm: result.includedKm,
        chargeableKm: result.chargeableKm,
        roundTrip: result.roundTrip,
        tollRoute: result.tollRoute,
        declaredValue: dto.declaredValue ?? null,
        baseFare: result.baseFare,
        distanceFare: result.distanceFare,
        travelSubtotal: result.travelSubtotal,
        tollFare: result.tollFare,
        addonsTotal: result.addonsTotal,
        subtotal: result.subtotal,
        total: result.total,
        lowEstimate: result.lowEstimate,
        highEstimate: result.highEstimate,
        minFareApplied: result.minFareApplied,
        customerName: dto.customerName ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
        // Array order -> stopIndex: this is the "unlimited destinations"
        // piece — see MovingLeadStop's doc comment.
        stops: dto.destinations.map((d, i) =>
          this.stopRepo.create({
            stopIndex: i,
            address: d.address ?? null,
            lat: d.lat,
            lng: d.lng,
          }),
        ),
        // Snapshotted from the already-priced/validated addon lines — no
        // separate lookup needed, result.addons already has name/unitPrice.
        addons: result.addons.map((line) =>
          this.addonRepo.create({
            addonSlug: line.slug,
            addonName: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
          }),
        ),
      });

      try {
        const saved = await this.leadRepo.save(lead); // cascades stops + addons
        return this.findOneOrFail(saved.id);
      } catch (err) {
        const isReferenceCollision =
          err instanceof QueryFailedError &&
          (err as unknown as { code?: string }).code ===
            POSTGRES_UNIQUE_VIOLATION;
        if (!isReferenceCollision || attempt === MAX_REFERENCE_ATTEMPTS - 1) {
          throw err;
        }
        // else: loop and try again with a freshly generated reference
      }
    }
    /* istanbul ignore next -- unreachable: the loop above always returns or throws */
    throw new Error('Failed to generate a unique moving lead reference');
  }

  async update(id: string, dto: UpdateMovingLeadDto): Promise<MovingLead> {
    const lead = await this.findOneOrFail(id);
    Object.assign(lead, {
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
    });
    await this.leadRepo.save(lead);
    return this.findOneOrFail(id);
  }
}
