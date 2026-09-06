import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryStorageBookingsDto } from './query-storage-bookings.dto';
import { StorageBookingStatus } from '../enums/storage-booking-status.enum';
import { StorageBookingSort } from '../enums/storage-booking-sort.enum';
import { SortOrder } from '../../../common/enums/sort-order.enum';

function build(
  overrides: Record<string, unknown> = {},
): QueryStorageBookingsDto {
  return plainToInstance(QueryStorageBookingsDto, { ...overrides });
}

describe('QueryStorageBookingsDto validation', () => {
  it('accepts an empty query, with defaults applied', async () => {
    const dto = build();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
    expect(dto.sortBy).toBe(StorageBookingSort.CREATED_AT);
    expect(dto.sortOrder).toBe(SortOrder.DESC);
  });

  it('accepts a valid status', async () => {
    const errors = await validate(
      build({ status: StorageBookingStatus.CONFIRMED }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const errors = await validate(build({ status: 'archived' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('accepts facilitySlug and unitTypeSlug', async () => {
    const errors = await validate(
      build({ facilitySlug: 'bsd-city', unitTypeSlug: 'large' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts from/to as YYYY-MM-DD', async () => {
    const errors = await validate(
      build({ from: '2026-09-01', to: '2026-09-03' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed from', async () => {
    const errors = await validate(build({ from: '2026-13-45' }));
    expect(errors.some((e) => e.property === 'from')).toBe(true);
  });

  it('accepts startFrom/startTo as YYYY-MM-DD', async () => {
    const errors = await validate(
      build({ startFrom: '2026-09-01', startTo: '2026-09-30' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-ISO startTo', async () => {
    const errors = await validate(build({ startTo: '30/09/2026' }));
    expect(errors.some((e) => e.property === 'startTo')).toBe(true);
  });

  it('accepts search as a string', async () => {
    const errors = await validate(build({ search: 'MDN-STG' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string search', async () => {
    const errors = await validate(build({ search: 123 }));
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });

  it('accepts every sortBy value', async () => {
    for (const sortBy of Object.values(StorageBookingSort)) {
      const errors = await validate(build({ sortBy }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects an unknown sortBy', async () => {
    const errors = await validate(build({ sortBy: 'facilityName' }));
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('accepts both sortOrder values', async () => {
    for (const sortOrder of Object.values(SortOrder)) {
      const errors = await validate(build({ sortOrder }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects an unknown sortOrder', async () => {
    const errors = await validate(build({ sortOrder: 'ascending' }));
    expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
  });

  it('accepts every filter together', async () => {
    const errors = await validate(
      build({
        status: StorageBookingStatus.PENDING,
        facilitySlug: 'bsd-city',
        unitTypeSlug: 'large',
        from: '2026-09-01',
        to: '2026-09-30',
        startFrom: '2026-09-01',
        startTo: '2026-12-31',
        search: 'Kevin',
        sortBy: StorageBookingSort.TOTAL,
        sortOrder: SortOrder.ASC,
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('still enforces inherited pagination rules — limit above 100', async () => {
    const errors = await validate(build({ limit: 101 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
