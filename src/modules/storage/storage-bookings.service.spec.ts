import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

// StorageService -> StorageAvailabilityService -> StorageMapper all pull in
// MediaService transitively, which imports the ESM-only `uuid` package that
// Jest's default CJS transform can't parse. Nothing under test here touches
// media at all, so short-circuit the whole chain instead of teaching Jest to
// transform `uuid` project-wide.
jest.mock('../media/media.service', () => ({ MediaService: jest.fn() }));
import { StorageBookingsService } from './storage-bookings.service';
import { StorageBooking } from './entities/storage-booking.entity';
import { StorageBookingStatus } from './enums/storage-booking-status.enum';
import { StorageBookingSort } from './enums/storage-booking-sort.enum';
import { SortOrder } from '../../common/enums/sort-order.enum';
import { QueryStorageBookingsDto } from './dto/query-storage-bookings.dto';
import { StorageService } from './storage.service';
import { StorageAvailabilityService } from './storage-availability.service';
import { StorageMapper } from './storage.mapper';

/** Chainable stand-in for the single QueryBuilder findAllAdmin() builds —
 * unlike Moving/Event, Storage's joins are all many-to-one, so there is only
 * ever one builder per call (no count-phase/id-page split to track). */
interface QbMock {
  leftJoinAndSelect: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

function makeQb(): QbMock {
  const qb = {} as QbMock;
  const ret = () => qb;
  qb.leftJoinAndSelect = jest.fn(ret);
  qb.andWhere = jest.fn(ret);
  qb.orderBy = jest.fn(ret);
  qb.addOrderBy = jest.fn(ret);
  qb.skip = jest.fn(ret);
  qb.take = jest.fn(ret);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
}

function makeQuery(
  overrides: Partial<QueryStorageBookingsDto> = {},
): QueryStorageBookingsDto {
  const dto = new QueryStorageBookingsDto();
  dto.page = 1;
  dto.limit = 12;
  dto.sortBy = StorageBookingSort.CREATED_AT;
  dto.sortOrder = SortOrder.DESC;
  return Object.assign(dto, overrides);
}

describe('StorageBookingsService.findAllAdmin', () => {
  let service: StorageBookingsService;
  let qb: QbMock;

  beforeEach(async () => {
    qb = makeQb();
    const bookingRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageBookingsService,
        { provide: getRepositoryToken(StorageBooking), useValue: bookingRepo },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: StorageAvailabilityService, useValue: {} },
        { provide: StorageMapper, useValue: {} },
      ],
    }).compile();

    service = module.get(StorageBookingsService);
  });

  it('uses a single getManyAndCount() builder, not the id-page pattern', async () => {
    await service.findAllAdmin(makeQuery());
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
  });

  it('applies no optional filter clause when the query has none', async () => {
    await service.findAllAdmin(makeQuery());
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('filters by status', async () => {
    await service.findAllAdmin(
      makeQuery({ status: StorageBookingStatus.CONFIRMED }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('b.status = :status', {
      status: StorageBookingStatus.CONFIRMED,
    });
  });

  it('filters by facilitySlug and unitTypeSlug on the joined aliases', async () => {
    await service.findAllAdmin(
      makeQuery({ facilitySlug: 'bsd-city', unitTypeSlug: 'large' }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('facility.slug = :facilitySlug', {
      facilitySlug: 'bsd-city',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('unitType.slug = :unitTypeSlug', {
      unitTypeSlug: 'large',
    });
  });

  it('binds the Jakarta-day-shifted from/to bounds', async () => {
    await service.findAllAdmin(
      makeQuery({ from: '2026-09-01', to: '2026-09-03' }),
    );

    const calls = qb.andWhere.mock.calls as [string, Record<string, unknown>][];
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

  it('filters startFrom/startTo as a window OVERLAP, not a start-only match', async () => {
    await service.findAllAdmin(
      makeQuery({ startFrom: '2026-09-01', startTo: '2026-09-30' }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('b.endDate >= :startFrom', {
      startFrom: '2026-09-01',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('b.startDate <= :startTo', {
      startTo: '2026-09-30',
    });
  });

  it('ORs search across reference/customerName/phone/email in a single andWhere', async () => {
    await service.findAllAdmin(makeQuery({ search: 'budi' }));
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(b.reference ILIKE :search OR b.customerName ILIKE :search OR b.phone ILIKE :search OR b.email ILIKE :search)',
      { search: '%budi%' },
    );
    // exactly one andWhere call for this filter — splitting the OR across
    // separate andWhere()s would silently turn it into an AND.
    expect(qb.andWhere).toHaveBeenCalledTimes(1);
  });

  it('defaults to createdAt DESC with an id DESC tiebreaker', async () => {
    await service.findAllAdmin(makeQuery());
    expect(qb.orderBy).toHaveBeenCalledWith('b.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
  });

  it('maps sortBy=total/sortOrder=asc onto the total column ascending', async () => {
    await service.findAllAdmin(
      makeQuery({ sortBy: StorageBookingSort.TOTAL, sortOrder: SortOrder.ASC }),
    );
    expect(qb.orderBy).toHaveBeenCalledWith('b.total', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('b.id', 'DESC');
  });

  it('maps every sortBy value onto its own column', async () => {
    const expected: Record<StorageBookingSort, string> = {
      [StorageBookingSort.CREATED_AT]: 'b.createdAt',
      [StorageBookingSort.REFERENCE]: 'b.reference',
      [StorageBookingSort.TOTAL]: 'b.total',
      [StorageBookingSort.START_DATE]: 'b.startDate',
    };
    for (const [sortBy, column] of Object.entries(expected)) {
      qb.orderBy.mockClear();
      await service.findAllAdmin(
        makeQuery({ sortBy: sortBy as StorageBookingSort }),
      );
      expect(qb.orderBy).toHaveBeenCalledWith(column, 'DESC');
    }
  });

  it('paginates with skip/take derived from page/limit', async () => {
    await service.findAllAdmin(makeQuery({ page: 3, limit: 20 }));
    expect(qb.skip).toHaveBeenCalledWith(40);
    expect(qb.take).toHaveBeenCalledWith(20);
  });
});
