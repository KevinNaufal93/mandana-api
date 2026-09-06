import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { EventBookingsService } from './event-bookings.service';
import { EventBooking } from './entities/event-booking.entity';
import { EventBookingItem } from './entities/event-booking-item.entity';
import { EventBookingStatus } from './enums/event-booking-status.enum';
import { EventBookingSource } from './enums/event-booking-source.enum';
import { EventBookingSort } from './enums/event-booking-sort.enum';
import { EventBillingMode } from './enums/event-billing-mode.enum';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { QueryEventBookingsDto } from './dto/query-event-bookings.dto';
import { CreatePublicEventBookingDto } from './dto/create-public-event-booking.dto';
import { EventItemsService } from './event-items.service';
import { EventAvailabilityService } from './event-availability.service';
import { EventSupportSettingsService } from './event-support-settings.service';

/** Chainable stand-in for the SelectQueryBuilder findAllAdmin() builds via
 * buildFilteredQb() — created twice per call (count phase, id-page phase),
 * same shape as MovingBookingsService's/StorageBookingsService's mocks. */
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

/** The shape saveBookingWithReference() passes into bookingRepo.create()/
 * save() — used only to type the mocks' captured call args below. */
interface CreatedBookingInput {
  reference: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  eventLocation: string | null;
  notes: string | null;
  source: EventBookingSource;
  status?: EventBookingStatus;
  startDate: string;
  endDate: string;
  dropoffAt: string;
  pickupAt: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  createdById: string | null;
}

/** Reads the `bookingRepo.create()` argument from a given call (negative
 * indices count from the end, e.g. -1 for "the most recent call"), cast
 * once here rather than at every call site — `jest.Mock` (untyped) makes
 * `.mock.calls` an `any[][]`, same idiom as MovingBookingsService's spec. */
function createdBookingArgs(
  mock: jest.Mock,
  callIndex = 0,
): CreatedBookingInput {
  const calls = mock.mock.calls as CreatedBookingInput[][];
  return calls.at(callIndex)![0];
}

function makeQuery(
  overrides: Partial<QueryEventBookingsDto> = {},
): QueryEventBookingsDto {
  const dto = new QueryEventBookingsDto();
  dto.page = 1;
  dto.limit = 12;
  dto.sortBy = EventBookingSort.CREATED_AT;
  dto.sortOrder = SortOrder.DESC;
  return Object.assign(dto, overrides);
}

describe('EventBookingsService', () => {
  let service: EventBookingsService;
  let qbs: QbMock[];
  let bookingRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let itemsService: { quote: jest.Mock };
  let settingsService: { get: jest.Mock; toPricingPolicy: jest.Mock };

  beforeEach(async () => {
    qbs = [];
    bookingRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb = makeQb();
        qbs.push(qb);
        return qb;
      }),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x: CreatedBookingInput) => x),
      save: jest.fn((b: CreatedBookingInput) =>
        Promise.resolve({ ...b, id: 'booking-1' }),
      ),
      findOne: jest.fn(),
    };
    itemsService = { quote: jest.fn() };
    settingsService = { get: jest.fn(), toPricingPolicy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventBookingsService,
        { provide: getRepositoryToken(EventBooking), useValue: bookingRepo },
        {
          provide: getRepositoryToken(EventBookingItem),
          useValue: { create: jest.fn((x: unknown) => x) },
        },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: EventItemsService, useValue: itemsService },
        { provide: EventAvailabilityService, useValue: {} },
        { provide: EventSupportSettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get(EventBookingsService);
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
        makeQuery({ status: EventBookingStatus.CONFIRMED }),
      );
      expect(qbs[0].andWhere).toHaveBeenCalledWith('b.status = :status', {
        status: EventBookingStatus.CONFIRMED,
      });
    });

    it('binds the Jakarta-day-shifted from/to (capture date) bounds', async () => {
      await service.findAllAdmin(
        makeQuery({ from: '2026-09-01', to: '2026-09-03' }),
      );
      const calls = qbs[0].andWhere.mock.calls as [
        string,
        Record<string, unknown>,
      ][];
      const fromCall = calls.find((c) => c[0].includes('>='));
      expect(fromCall).toEqual([
        "b.createdAt >= :from::date - INTERVAL '7 hours'",
        { from: '2026-09-01' },
      ]);
      const toCall = calls.find((c) => c[0].includes("INTERVAL '1 day'"));
      expect(toCall).toEqual([
        "b.createdAt < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'",
        { to: '2026-09-03' },
      ]);
    });

    it('filters startFrom/startTo as the event-window OVERLAP (the old from/to semantics)', async () => {
      await service.findAllAdmin(
        makeQuery({ startFrom: '2026-03-01', startTo: '2026-03-31' }),
      );
      expect(qbs[0].andWhere).toHaveBeenCalledWith('b.endDate >= :startFrom', {
        startFrom: '2026-03-01',
      });
      expect(qbs[0].andWhere).toHaveBeenCalledWith('b.startDate <= :startTo', {
        startTo: '2026-03-31',
      });
    });

    it('ORs search across reference/customerName/phone/email in a single andWhere', async () => {
      await service.findAllAdmin(makeQuery({ search: 'budi' }));
      expect(qbs[0].andWhere).toHaveBeenCalledWith(
        '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search OR b.email ILIKE :search)',
        { search: '%budi%' },
      );
      expect(qbs[0].andWhere).toHaveBeenCalledTimes(1);
    });

    it('applies identical filters to both the count and id-page query', async () => {
      await service.findAllAdmin(
        makeQuery({ status: EventBookingStatus.PENDING, search: 'MDN' }),
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
        makeQuery({ sortBy: EventBookingSort.TOTAL, sortOrder: SortOrder.ASC }),
      );
      expect(qbs[1].orderBy).toHaveBeenCalledWith('b.total', 'ASC');
      expect(qbs[1].addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
    });
  });

  describe('createPublic', () => {
    const item = (over: Record<string, unknown> = {}) => ({
      id: 'item-1',
      name: 'Sound System',
      slug: 'sound-system',
      pricePerDay: 500_000,
      ...over,
    });

    function makeQuoteComputation() {
      return {
        lines: [
          {
            item: item(),
            quantity: 1,
            dropoffAt: '2026-03-01T09:00',
            pickupAt: '2026-03-01T17:00',
            startDate: '2026-03-01',
            endDate: '2026-03-01',
            billingMode: EventBillingMode.HOURLY,
            unitPrice: 50_000,
            unitLabel: 'jam' as const,
            billableUnits: 8,
            extraHours: null,
            extraHoursTotal: null,
            lineTotal: 400_000,
            availableQuantity: 3,
          },
          {
            // this line's own window is WIDER than the cart-level dto
            // window above — proves the booking derives its dropoffAt/
            // pickupAt from the lines, not from the cart-level request.
            item: item({ id: 'item-2', name: 'Stage', slug: 'stage' }),
            quantity: 1,
            dropoffAt: '2026-03-01T07:00',
            pickupAt: '2026-03-02T20:00',
            startDate: '2026-03-01',
            endDate: '2026-03-02',
            billingMode: EventBillingMode.DAILY,
            unitPrice: 500_000,
            unitLabel: 'hari' as const,
            billableUnits: 2,
            extraHours: null,
            extraHoursTotal: null,
            lineTotal: 1_000_000,
            availableQuantity: 1,
          },
        ],
        // cart-level dto window — deliberately narrower than line 2's own
        // override, to prove the booking's persisted window is NOT copied
        // from here.
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T17:00',
        startDate: '2026-03-01',
        endDate: '2026-03-02',
        isMixedBilling: true,
        subtotal: 1_400_000,
        discountAmount: 0,
        total: 1_400_000,
        eventLocation: null,
      };
    }

    function makeDto(): CreatePublicEventBookingDto {
      const dto = new CreatePublicEventBookingDto();
      dto.customerName = 'Budi Santoso';
      dto.dropoffAt = '2026-03-01T09:00';
      dto.pickupAt = '2026-03-01T17:00';
      dto.items = [{ slug: 'sound-system', quantity: 1 }] as never;
      return dto;
    }

    beforeEach(() => {
      itemsService.quote.mockResolvedValue(makeQuoteComputation());
      settingsService.get.mockResolvedValue({
        priceIncludesJabodetabekDelivery: true,
      });
      bookingRepo.findOne.mockImplementation(() => {
        const lastCreate = createdBookingArgs(bookingRepo.create, -1);
        return Promise.resolve({ ...lastCreate, id: 'booking-1' });
      });
    });

    it('delegates pricing entirely to itemsService.quote()', async () => {
      const dto = makeDto();
      await service.createPublic(dto);
      expect(itemsService.quote).toHaveBeenCalledWith(dto);
    });

    it('persists source: public and createdById: null, status defaulting to pending', async () => {
      await service.createPublic(makeDto());
      const created = createdBookingArgs(bookingRepo.create);
      expect(created.source).toBe(EventBookingSource.PUBLIC);
      expect(created.createdById).toBeNull();
      // status is left unset here — the entity column default ('pending')
      // is what actually applies, same as every other booking path.
      expect(created.status).toBeUndefined();
    });

    it('derives dropoffAt/pickupAt as min/max across the quote lines, not the cart-level dto window', async () => {
      await service.createPublic(makeDto());
      const created = createdBookingArgs(bookingRepo.create);
      // line 2 overrides to 07:00–(+1)20:00, wider than the cart-level
      // 09:00–17:00 the dto/quote object carries at the top level.
      expect(created.dropoffAt).toBe('2026-03-01T07:00');
      expect(created.pickupAt).toBe('2026-03-02T20:00');
      expect(created.startDate).toBe('2026-03-01');
      expect(created.endDate).toBe('2026-03-02');
    });

    it('returns the booking alongside the quote and settings for the mapper', async () => {
      const result = await service.createPublic(makeDto());
      expect(result.booking.id).toBe('booking-1');
      expect(result.quote.lines).toHaveLength(2);
      expect(result.settings.priceIncludesJabodetabekDelivery).toBe(true);
    });
  });
});
