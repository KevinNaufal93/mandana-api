import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryEventBookingsDto } from './query-event-bookings.dto';
import { EventBookingStatus } from '../enums/event-booking-status.enum';
import { EventBookingSort } from '../enums/event-booking-sort.enum';
import { SortOrder } from '../../../common/enums/sort-order.enum';

function build(overrides: Record<string, unknown> = {}): QueryEventBookingsDto {
  return plainToInstance(QueryEventBookingsDto, { ...overrides });
}

describe('QueryEventBookingsDto validation', () => {
  it('accepts an empty query, with defaults applied', async () => {
    const dto = build();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
    expect(dto.sortBy).toBe(EventBookingSort.CREATED_AT);
    expect(dto.sortOrder).toBe(SortOrder.DESC);
  });

  it('accepts a valid status', async () => {
    const errors = await validate(
      build({ status: EventBookingStatus.CONFIRMED }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const errors = await validate(build({ status: 'archived' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('accepts from/to (capture date) as YYYY-MM-DD', async () => {
    const errors = await validate(
      build({ from: '2026-09-01', to: '2026-09-03' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts startFrom/startTo (event window) as YYYY-MM-DD', async () => {
    const errors = await validate(
      build({ startFrom: '2026-03-01', startTo: '2026-03-31' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-ISO startFrom', async () => {
    const errors = await validate(build({ startFrom: '01/03/2026' }));
    expect(errors.some((e) => e.property === 'startFrom')).toBe(true);
  });

  it('accepts search as a string', async () => {
    const errors = await validate(build({ search: 'budi' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts every sortBy value', async () => {
    for (const sortBy of Object.values(EventBookingSort)) {
      const errors = await validate(build({ sortBy }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects an unknown sortBy', async () => {
    const errors = await validate(build({ sortBy: 'itemName' }));
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });

  it('accepts both sortOrder values', async () => {
    for (const sortOrder of Object.values(SortOrder)) {
      const errors = await validate(build({ sortOrder }));
      expect(errors).toHaveLength(0);
    }
  });

  it('still enforces inherited pagination rules — limit above 100', async () => {
    const errors = await validate(build({ limit: 101 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
