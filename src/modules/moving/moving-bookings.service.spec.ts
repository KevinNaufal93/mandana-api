import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { MovingBookingsService } from './moving-bookings.service';
import { MovingService } from './moving.service';
import { MovingBooking } from './entities/moving-booking.entity';
import { MovingBookingStop } from './entities/moving-booking-stop.entity';
import { MovingBookingAddon } from './entities/moving-booking-addon.entity';
import { MovingBookingLeg } from './entities/moving-booking-leg.entity';
import { MovingBookingStatus } from './enums/moving-booking-status.enum';
import { MovingBookingSort } from './enums/moving-booking-sort.enum';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { CreateMovingBookingDto } from './dto/create-moving-booking.dto';
import { QueryMovingBookingsDto } from './dto/query-moving-bookings.dto';
import { MovingQuoteResult } from './moving-pricing';
import { POSTGRES_UNIQUE_VIOLATION } from '../../common/utils/booking-reference';
import { User } from '../users/entities/user.entity';

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

/** Builds a valid CreateMovingBookingDto: `destinationCount` stops, and a
 * `legs` array sized to match (destinationCount, or +1 when roundTrip is
 * true) by default — so every existing call site keeps satisfying
 * MovingBookingsService.create()'s legs-vs-destinations cross-validation
 * without having to spell out `legs` explicitly. Pass `legs` in overrides
 * to test a deliberate mismatch. */
function makeDto(
  destinationCount: number,
  overrides: Partial<CreateMovingBookingDto> = {},
): CreateMovingBookingDto {
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

/** The shape MovingBookingsService.create() passes into bookingRepo.create()/
 * save() — used only to type the mock's captured call args for assertions
 * below. */
interface CreatedBookingInput {
  reference: string;
  status?: MovingBookingStatus;
  truckSlug: string;
  truckName: string;
  notes: string | null;
  adminNote?: string | null;
  confirmedAt?: Date | null;
  confirmedById?: string | null;
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
  overrides: Partial<QueryMovingBookingsDto> = {},
): QueryMovingBookingsDto {
  return {
    page: 1,
    limit: 12,
    sortBy: MovingBookingSort.CREATED_AT,
    sortOrder: SortOrder.DESC,
    ...overrides,
  };
}

/** Reads the `bookingRepo.save()` argument from a given call, cast once here
 * rather than at every call site — `jest.Mock` (untyped) makes `.mock.calls`
 * an `any[][]`, so this is the one place that leaves `any`. */
function savedBookingArgs(mock: jest.Mock, callIndex = 0): CreatedBookingInput {
  const calls = mock.mock.calls as CreatedBookingInput[][];
  return calls[callIndex][0];
}

describe('MovingBookingsService', () => {
  let service: MovingBookingsService;
  let bookingRepo: {
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
    bookingRepo = {
      create: jest.fn((input: CreatedBookingInput) => input),
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
        MovingBookingsService,
        { provide: getRepositoryToken(MovingBooking), useValue: bookingRepo },
        { provide: getRepositoryToken(MovingBookingStop), useValue: stopRepo },
        {
          provide: getRepositoryToken(MovingBookingAddon),
          useValue: addonRepo,
        },
        { provide: getRepositoryToken(MovingBookingLeg), useValue: legRepo },
        { provide: MovingService, useValue: movingService },
      ],
    }).compile();

    service = module.get(MovingBookingsService);

    movingService.buildQuote.mockResolvedValue({ truck, result: baseResult });
    bookingRepo.save.mockImplementation((booking: CreatedBookingInput) =>
      Promise.resolve({ ...booking, id: 'booking-1' }),
    );
    bookingRepo.findOne.mockImplementation((options: unknown) => {
      const { id } = (options as { where: { id: string } }).where;
      return Promise.resolve({
        id,
        reference: 'MDN-MOV-ABC123',
        status: MovingBookingStatus.PENDING,
        stops: [],
        addons: [],
        legs: [],
      } as unknown as MovingBooking);
    });
  });

  /** Points `bookingRepo.findOne` at a booking with the given status, for
   * the transition tests below. */
  function mockBookingWithStatus(status: MovingBookingStatus) {
    bookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      reference: 'MDN-MOV-ABC123',
      status,
      stops: [],
      addons: [],
      legs: [],
    });
  }

  const admin = { id: 'admin-1' } as User;

  it('persists a single-destination booking with stopIndex 0', async () => {
    await service.create(makeDto(1));

    expect(bookingRepo.save).toHaveBeenCalledTimes(1);
    const saved = savedBookingArgs(bookingRepo.save);
    expect(saved.stops).toHaveLength(1);
    expect(saved.stops[0]).toMatchObject({ stopIndex: 0, address: 'Stop 0' });
    expect(saved.reference).toMatch(/^MDN-MOV-/);
    expect(saved.status).toBe(MovingBookingStatus.PENDING);
    expect(saved.truckSlug).toBe('cdd');
    expect(saved.truckName).toBe('CDD (Colt Diesel Double)');
  });

  it('persists the customer-provided "Additional notes" text when sent', async () => {
    await service.create(
      makeDto(1, { notes: 'Barang mudah pecah, tolong hati-hati.' }),
    );

    const saved = savedBookingArgs(bookingRepo.save);
    expect(saved.notes).toBe('Barang mudah pecah, tolong hati-hati.');
  });

  it('defaults notes to null when omitted', async () => {
    await service.create(makeDto(1));

    const saved = savedBookingArgs(bookingRepo.save);
    expect(saved.notes).toBeNull();
  });

  it('persists an unlimited, ordered destination list — 3 stops in submitted order', async () => {
    await service.create(makeDto(3));

    const saved = savedBookingArgs(bookingRepo.save);
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

    const saved = savedBookingArgs(bookingRepo.save);
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
      expect(bookingRepo.save).not.toHaveBeenCalled();
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
      await service.findAllAdmin(
        makeQuery({ status: MovingBookingStatus.PENDING }),
      );

      expect(qbs[0].andWhere).toHaveBeenCalledWith('b.status = :status', {
        status: MovingBookingStatus.PENDING,
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
        "b.createdAt >= :from::date - INTERVAL '7 hours'",
        { from: '2026-09-01' },
      ]);

      const toCall = andWhereCalls.find((c) =>
        c[0].includes("INTERVAL '1 day'"),
      );
      expect(toCall).toEqual([
        "b.createdAt < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'",
        { to: '2026-09-03' },
      ]);
    });

    it('ORs search across reference/customerName/phone/email in a single andWhere', async () => {
      await service.findAllAdmin(makeQuery({ search: 'budi' }));

      expect(qbs[0].andWhere).toHaveBeenCalledWith(
        '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search OR b.email ILIKE :search)',
        { search: '%budi%' },
      );
      // exactly one andWhere call for this filter — splitting the OR across
      // separate andWhere()s would silently turn it into an AND.
      expect(qbs[0].andWhere).toHaveBeenCalledTimes(1);
    });

    it('applies identical filters to both the count and id-page query', async () => {
      await service.findAllAdmin(
        makeQuery({ status: MovingBookingStatus.CONFIRMED, search: 'MDN' }),
      );

      expect(qbs[0].andWhere.mock.calls).toEqual(qbs[1].andWhere.mock.calls);
    });

    it('defaults to createdAt DESC with an id DESC tiebreaker', async () => {
      await service.findAllAdmin(makeQuery());
      expect(qbs[1].orderBy).toHaveBeenCalledWith('b.createdAt', 'DESC');
      expect(qbs[1].addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
    });

    it('maps sortBy=total/sortOrder=asc onto the total column ascending', async () => {
      await service.findAllAdmin(
        makeQuery({
          sortBy: MovingBookingSort.TOTAL,
          sortOrder: SortOrder.ASC,
        }),
      );
      expect(qbs[1].orderBy).toHaveBeenCalledWith('b.total', 'ASC');
      expect(qbs[1].addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
    });

    it('short-circuits without hydrating when the id page is empty', async () => {
      const result = await service.findAllAdmin(makeQuery());

      expect(bookingRepo.find).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 0,
      });
    });

    it('preserves id-page order through the byId hydration re-sort', async () => {
      bookingRepo.createQueryBuilder = jest
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
      bookingRepo.find.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      const result = await service.findAllAdmin(makeQuery());

      expect(result.data.map((d) => d.id)).toEqual(['b', 'a']);
    });
  });

  describe('update (adminNote only)', () => {
    it('updates adminNote without touching status', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await service.update('booking-1', { adminNote: 'Called customer' });

      const saved = savedBookingArgs(bookingRepo.save);
      expect(saved.adminNote).toBe('Called customer');
      expect(saved.status).toBe(MovingBookingStatus.PENDING);
    });

    it('leaves adminNote untouched when omitted', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await service.update('booking-1', {});
      expect(bookingRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('status transitions', () => {
    it('confirm: pending -> confirmed, sets confirmedAt/confirmedById', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await service.confirm('booking-1', {}, admin);

      const saved = savedBookingArgs(bookingRepo.save);
      expect(saved.status).toBe(MovingBookingStatus.CONFIRMED);
      expect(saved.confirmedAt).toBeInstanceOf(Date);
      expect(saved.confirmedById).toBe('admin-1');
    });

    it('confirm: 409 from any non-pending status', async () => {
      mockBookingWithStatus(MovingBookingStatus.CONFIRMED);
      await expect(service.confirm('booking-1', {}, admin)).rejects.toThrow(
        ConflictException,
      );
    });

    it('reject: pending -> rejected', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await service.reject('booking-1', {});
      const saved = savedBookingArgs(bookingRepo.save);
      expect(saved.status).toBe(MovingBookingStatus.REJECTED);
    });

    it('reject: 409 from any non-pending status', async () => {
      mockBookingWithStatus(MovingBookingStatus.COMPLETED);
      await expect(service.reject('booking-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('cancel: confirmed -> cancelled', async () => {
      mockBookingWithStatus(MovingBookingStatus.CONFIRMED);
      await service.cancel('booking-1', {});
      const saved = savedBookingArgs(bookingRepo.save);
      expect(saved.status).toBe(MovingBookingStatus.CANCELLED);
    });

    it('cancel: 409 from pending (must be confirmed first, or use reject)', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await expect(service.cancel('booking-1', {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('complete: confirmed -> completed', async () => {
      mockBookingWithStatus(MovingBookingStatus.CONFIRMED);
      await service.complete('booking-1', {});
      const saved = savedBookingArgs(bookingRepo.save);
      expect(saved.status).toBe(MovingBookingStatus.COMPLETED);
    });

    it('complete: 409 from pending', async () => {
      mockBookingWithStatus(MovingBookingStatus.PENDING);
      await expect(service.complete('booking-1', {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  it('retries with a fresh reference on a unique-constraint collision, then succeeds', async () => {
    const collision = new QueryFailedError(
      'INSERT INTO "moving_bookings" ...',
      [],
      {
        code: POSTGRES_UNIQUE_VIOLATION,
        message: 'duplicate key value violates unique constraint',
      } as unknown as Error,
    );
    bookingRepo.save
      .mockRejectedValueOnce(collision)
      .mockImplementationOnce((booking: CreatedBookingInput) =>
        Promise.resolve({ ...booking, id: 'booking-2' }),
      );

    await service.create(makeDto(1));

    expect(bookingRepo.save).toHaveBeenCalledTimes(2);
    const firstRef = savedBookingArgs(bookingRepo.save, 0).reference;
    const secondRef = savedBookingArgs(bookingRepo.save, 1).reference;
    expect(firstRef).not.toBe(secondRef);
  });

  it('rethrows a non-collision error immediately, without retrying', async () => {
    bookingRepo.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.create(makeDto(1))).rejects.toThrow('connection lost');
    expect(bookingRepo.save).toHaveBeenCalledTimes(1);
  });
});
