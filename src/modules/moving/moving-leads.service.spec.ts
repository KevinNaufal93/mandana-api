import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { MovingLeadsService } from './moving-leads.service';
import { MovingService } from './moving.service';
import { MovingLead } from './entities/moving-lead.entity';
import { MovingLeadStop } from './entities/moving-lead-stop.entity';
import { MovingLeadAddon } from './entities/moving-lead-addon.entity';
import { MovingLeadLeg } from './entities/moving-lead-leg.entity';
import { MovingLeadStatus } from './enums/moving-lead-status.enum';
import { CreateMovingLeadDto } from './dto/create-moving-lead.dto';
import { QueryMovingLeadsDto } from './dto/query-moving-leads.dto';
import { MovingQuoteResult } from './moving-pricing';
import { POSTGRES_UNIQUE_VIOLATION } from '../../common/utils/booking-reference';

/** Chainable stand-in for the SelectQueryBuilder findAllAdmin() builds via
 * buildFilteredQb(). That builder is created twice per findAllAdmin() call
 * (once for the count, once for the id page) — each createQueryBuilder()
 * call below returns a fresh QbMock and pushes it onto `qbs`, so a test can
 * assert both halves received identical filters. */
interface QbMock {
  andWhere: jest.Mock;
  select: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getCount: jest.Mock;
  getRawMany: jest.Mock;
}

function makeQb(): QbMock {
  const qb = {} as QbMock;
  const ret = () => qb;
  qb.andWhere = jest.fn(ret);
  qb.select = jest.fn(ret);
  qb.orderBy = jest.fn(ret);
  qb.addOrderBy = jest.fn(ret);
  qb.skip = jest.fn(ret);
  qb.take = jest.fn(ret);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.getRawMany = jest.fn().mockResolvedValue([]);
  return qb;
}

const truck = { slug: 'cdd', name: 'CDD (Colt Diesel Double)' };

const baseResult: MovingQuoteResult = {
  distanceKm: 20,
  includedKm: 5,
  chargeableKm: 15,
  roundTrip: false,
  tripMultiplier: 1,
  baseFare: 850_000,
  distanceFare: 120_000,
  travelSubtotal: 970_000,
  tollRoute: true,
  tollFare: 0,
  addons: [],
  addonsTotal: 0,
  subtotal: 970_000,
  total: 970_000,
  minFareApplied: false,
  lowEstimate: 870_000,
  highEstimate: 1_070_000,
  legs: [
    {
      distanceKm: 20,
      includedKm: 5,
      chargeableKm: 15,
      baseFare: 850_000,
      distanceFare: 120_000,
      subtotal: 970_000,
    },
  ],
};

/** Builds a valid CreateMovingLeadDto: `destinationCount` stops, and a
 * `legs` array sized to match (destinationCount, or +1 when roundTrip is
 * true) by default — so every existing call site keeps satisfying
 * MovingLeadsService.create()'s legs-vs-destinations cross-validation
 * without having to spell out `legs` explicitly. Pass `legs` in overrides
 * to test a deliberate mismatch. */
function makeDto(
  destinationCount: number,
  overrides: Partial<CreateMovingLeadDto> = {},
): CreateMovingLeadDto {
  const roundTrip = overrides.roundTrip === true;
  const legCount =
    overrides.legs?.length ?? destinationCount + (roundTrip ? 1 : 0);
  return {
    truckSlug: 'cdd',
    legs: Array.from({ length: legCount }, () => ({ distanceMeters: 20_000 })),
    pickup: { address: 'Origin', lat: -6.2, lng: 106.8 },
    destinations: Array.from({ length: destinationCount }, (_, i) => ({
      address: `Stop ${i}`,
      lat: -6.2 - i * 0.01,
      lng: 106.8 + i * 0.01,
    })),
    ...overrides,
  };
}

/** The shape MovingLeadsService.create() passes into leadRepo.create()/save()
 * — used only to type the mock's captured call args for assertions below. */
interface CreatedLeadInput {
  reference: string;
  status: MovingLeadStatus;
  truckSlug: string;
  truckName: string;
  notes: string | null;
  stops: {
    stopIndex: number;
    address: string | null;
    lat: number;
    lng: number;
  }[];
  legs: {
    legIndex: number;
    distanceKm: number;
    includedKm: number;
    chargeableKm: number;
    baseFare: number;
    distanceFare: number;
    subtotal: number;
  }[];
}

interface StopInput {
  stopIndex: number;
  address: string | null;
  lat: number;
  lng: number;
}

interface AddonLineInput {
  addonSlug: string;
  addonName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface LegInput {
  legIndex: number;
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  baseFare: number;
  distanceFare: number;
  subtotal: number;
}

function makeQuery(
  overrides: Partial<QueryMovingLeadsDto> = {},
): QueryMovingLeadsDto {
  return { page: 1, limit: 12, ...overrides };
}

/** Reads the `leadRepo.save()` argument from a given call, cast once here
 * rather than at every call site — `jest.Mock` (untyped) makes `.mock.calls`
 * an `any[][]`, so this is the one place that leaves `any`. */
function savedLeadArgs(mock: jest.Mock, callIndex = 0): CreatedLeadInput {
  const calls = mock.mock.calls as CreatedLeadInput[][];
  return calls[callIndex][0];
}

describe('MovingLeadsService', () => {
  let service: MovingLeadsService;
  let leadRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let stopRepo: { create: jest.Mock };
  let addonRepo: { create: jest.Mock };
  let legRepo: { create: jest.Mock };
  let movingService: { buildQuote: jest.Mock };
  let qbs: QbMock[];

  beforeEach(async () => {
    qbs = [];
    leadRepo = {
      create: jest.fn((input: CreatedLeadInput) => input),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb();
        qbs.push(qb);
        return qb;
      }),
    };
    stopRepo = { create: jest.fn((input: StopInput) => input) };
    addonRepo = { create: jest.fn((input: AddonLineInput) => input) };
    legRepo = { create: jest.fn((input: LegInput) => input) };
    movingService = { buildQuote: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovingLeadsService,
        { provide: getRepositoryToken(MovingLead), useValue: leadRepo },
        { provide: getRepositoryToken(MovingLeadStop), useValue: stopRepo },
        { provide: getRepositoryToken(MovingLeadAddon), useValue: addonRepo },
        { provide: getRepositoryToken(MovingLeadLeg), useValue: legRepo },
        { provide: MovingService, useValue: movingService },
      ],
    }).compile();

    service = module.get(MovingLeadsService);

    movingService.buildQuote.mockResolvedValue({ truck, result: baseResult });
    leadRepo.save.mockImplementation((lead: CreatedLeadInput) =>
      Promise.resolve({ ...lead, id: 'lead-1' }),
    );
    leadRepo.findOne.mockImplementation((options: unknown) => {
      const { id } = (options as { where: { id: string } }).where;
      return Promise.resolve({
        id,
        reference: 'MDN-MOV-ABC123',
        status: MovingLeadStatus.NEW,
        stops: [],
        addons: [],
        legs: [],
      } as unknown as MovingLead);
    });
  });

  it('persists a single-destination lead with stopIndex 0', async () => {
    await service.create(makeDto(1));

    expect(leadRepo.save).toHaveBeenCalledTimes(1);
    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.stops).toHaveLength(1);
    expect(saved.stops[0]).toMatchObject({ stopIndex: 0, address: 'Stop 0' });
    expect(saved.reference).toMatch(/^MDN-MOV-/);
    expect(saved.status).toBe(MovingLeadStatus.NEW);
    expect(saved.truckSlug).toBe('cdd');
    expect(saved.truckName).toBe('CDD (Colt Diesel Double)');
  });

  it('persists the customer-provided "Additional notes" text when sent', async () => {
    await service.create(
      makeDto(1, { notes: 'Barang mudah pecah, tolong hati-hati.' }),
    );

    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.notes).toBe('Barang mudah pecah, tolong hati-hati.');
  });

  it('defaults notes to null when omitted', async () => {
    await service.create(makeDto(1));

    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.notes).toBeNull();
  });

  it('persists an unlimited, ordered destination list — 3 stops in submitted order', async () => {
    await service.create(makeDto(3));

    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.stops).toHaveLength(3);
    expect(saved.stops.map((s) => s.stopIndex)).toEqual([0, 1, 2]);
    expect(saved.stops[0].address).toBe('Stop 0');
    expect(saved.stops[2].address).toBe('Stop 2');
  });

  it('persists the priced per-leg breakdown from result.legs, in order', async () => {
    movingService.buildQuote.mockResolvedValue({
      truck,
      result: {
        ...baseResult,
        legs: [
          { ...baseResult.legs[0], distanceKm: 5 },
          { ...baseResult.legs[0], distanceKm: 10 },
        ],
      },
    });

    await service.create(makeDto(2));

    const saved = savedLeadArgs(leadRepo.save);
    expect(saved.legs).toHaveLength(2);
    expect(saved.legs.map((l) => l.legIndex)).toEqual([0, 1]);
    expect(saved.legs[0].distanceKm).toBe(5);
    expect(saved.legs[1].distanceKm).toBe(10);
  });

  it('never trusts a client-sent price — always recomputes via MovingService.buildQuote', async () => {
    await service.create(makeDto(1));
    expect(movingService.buildQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        truckSlug: 'cdd',
        legs: [{ distanceMeters: 20_000 }],
      }),
    );
  });

  describe('legs.length vs destinations.length validation', () => {
    it('accepts legs.length === destinations.length', async () => {
      await expect(service.create(makeDto(3))).resolves.toBeDefined();
    });

    it('accepts legs.length === destinations.length + 1 when roundTrip is true', async () => {
      await expect(
        service.create(makeDto(2, { roundTrip: true })),
      ).resolves.toBeDefined();
    });

    it('accepts legs.length === destinations.length even when roundTrip is true (the +1 is optional)', async () => {
      await expect(
        service.create(
          makeDto(2, {
            roundTrip: true,
            legs: [{ distanceMeters: 20_000 }, { distanceMeters: 20_000 }],
          }),
        ),
      ).resolves.toBeDefined();
    });

    it('rejects a legs/destinations count mismatch with 400', async () => {
      await expect(
        service.create(makeDto(3, { legs: [{ distanceMeters: 20_000 }] })),
      ).rejects.toThrow(BadRequestException);
      expect(leadRepo.save).not.toHaveBeenCalled();
    });

    it('rejects legs.length === destinations.length + 2 even when roundTrip is true', async () => {
      await expect(
        service.create(
          makeDto(1, {
            roundTrip: true,
            legs: [
              { distanceMeters: 20_000 },
              { distanceMeters: 20_000 },
              { distanceMeters: 20_000 },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllAdmin', () => {
    it('applies no filter clause when the query has none', async () => {
      await service.findAllAdmin(makeQuery());

      expect(qbs).toHaveLength(2); // count phase, then the id-page phase
      expect(qbs[0].andWhere).not.toHaveBeenCalled();
      expect(qbs[1].andWhere).not.toHaveBeenCalled();
    });

    it('filters by status', async () => {
      await service.findAllAdmin(makeQuery({ status: MovingLeadStatus.NEW }));

      expect(qbs[0].andWhere).toHaveBeenCalledWith('l.status = :status', {
        status: MovingLeadStatus.NEW,
      });
    });

    it('binds the Jakarta-day-shifted from/to bounds', async () => {
      await service.findAllAdmin(
        makeQuery({ from: '2026-09-01', to: '2026-09-03' }),
      );

      const andWhereCalls = qbs[0].andWhere.mock.calls as [
        string,
        Record<string, unknown>,
      ][];
      const fromCall = andWhereCalls.find((c) => c[0].includes('>='));
      expect(fromCall).toEqual([
        "l.createdAt >= :from::date - INTERVAL '7 hours'",
        { from: '2026-09-01' },
      ]);

      const toCall = andWhereCalls.find((c) =>
        c[0].includes("INTERVAL '1 day'"),
      );
      expect(toCall).toEqual([
        "l.createdAt < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'",
        { to: '2026-09-03' },
      ]);
    });

    it('ORs search across reference/customerName/phone in a single andWhere', async () => {
      await service.findAllAdmin(makeQuery({ search: 'budi' }));

      expect(qbs[0].andWhere).toHaveBeenCalledWith(
        '(l.reference ILIKE :search OR l.customerName ILIKE :search OR l.phone ILIKE :search)',
        { search: '%budi%' },
      );
      // exactly one andWhere call for this filter — splitting the OR across
      // three separate andWhere()s would silently turn it into an AND.
      expect(qbs[0].andWhere).toHaveBeenCalledTimes(1);
    });

    it('applies identical filters to both the count and id-page query', async () => {
      await service.findAllAdmin(
        makeQuery({ status: MovingLeadStatus.CONTACTED, search: 'MDN' }),
      );

      expect(qbs[0].andWhere.mock.calls).toEqual(qbs[1].andWhere.mock.calls);
    });

    it('short-circuits without hydrating when the id page is empty', async () => {
      const result = await service.findAllAdmin(makeQuery());

      expect(leadRepo.find).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 0,
      });
    });

    it('preserves id-page order through the byId hydration re-sort', async () => {
      leadRepo.createQueryBuilder = jest
        .fn()
        .mockImplementationOnce(() => {
          const qb = makeQb();
          qb.getCount.mockResolvedValue(2);
          qbs.push(qb);
          return qb;
        })
        .mockImplementationOnce(() => {
          const qb = makeQb();
          qb.getRawMany.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
          qbs.push(qb);
          return qb;
        });
      leadRepo.find.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      const result = await service.findAllAdmin(makeQuery());

      expect(result.data.map((d) => d.id)).toEqual(['b', 'a']);
    });
  });

  it('retries with a fresh reference on a unique-constraint collision, then succeeds', async () => {
    const collision = new QueryFailedError(
      'INSERT INTO "moving_leads" ...',
      [],
      {
        code: POSTGRES_UNIQUE_VIOLATION,
        message: 'duplicate key value violates unique constraint',
      } as unknown as Error,
    );
    leadRepo.save
      .mockRejectedValueOnce(collision)
      .mockImplementationOnce((lead: CreatedLeadInput) =>
        Promise.resolve({ ...lead, id: 'lead-2' }),
      );

    await service.create(makeDto(1));

    expect(leadRepo.save).toHaveBeenCalledTimes(2);
    const firstRef = savedLeadArgs(leadRepo.save, 0).reference;
    const secondRef = savedLeadArgs(leadRepo.save, 1).reference;
    expect(firstRef).not.toBe(secondRef);
  });

  it('rethrows a non-collision error immediately, without retrying', async () => {
    leadRepo.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.create(makeDto(1))).rejects.toThrow('connection lost');
    expect(leadRepo.save).toHaveBeenCalledTimes(1);
  });
});
