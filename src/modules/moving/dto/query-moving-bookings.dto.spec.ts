import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryMovingBookingsDto } from './query-moving-bookings.dto';
import { MovingBookingStatus } from '../enums/moving-booking-status.enum';
import { MovingBookingSort } from '../enums/moving-booking-sort.enum';
import { SortOrder } from '../../../common/enums/sort-order.enum';

function build(
  overrides: Record<string, unknown> = {},
): QueryMovingBookingsDto {
  return plainToInstance(QueryMovingBookingsDto, { ...overrides });
}

describe('QueryMovingBookingsDto validation', () => {
  it('accepts an empty query, with defaults applied', async () => {
    const dto = build();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
    expect(dto.sortBy).toBe(MovingBookingSort.CREATED_AT);
    expect(dto.sortOrder).toBe(SortOrder.DESC);
  });

  it('accepts a valid status', async () => {
    const errors = await validate(
      build({ status: MovingBookingStatus.CONFIRMED }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const errors = await validate(build({ status: 'archived' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  // The rename's regression net — the OLD CRM-triage values must no longer
  // validate now that the enum has been replaced wholesale.
  it.each(['new', 'contacted', 'converted', 'lost'])(
    'rejects the old pre-rename status value %s',
    async (status) => {
      const errors = await validate(build({ status }));
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    },
  );

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

  it('rejects a non-ISO to', async () => {
    const errors = await validate(build({ to: '03/09/2026' }));
    expect(errors.some((e) => e.property === 'to')).toBe(true);
  });

  it('accepts search as a string', async () => {
    const errors = await validate(build({ search: 'budi' }));
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-string search', async () => {
    const errors = await validate(build({ search: 123 }));
    expect(errors.some((e) => e.property === 'search')).toBe(true);
  });

  it('accepts every sortBy value', async () => {
    for (const sortBy of Object.values(MovingBookingSort)) {
      const errors = await validate(build({ sortBy }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects an unknown sortBy', async () => {
    const errors = await validate(build({ sortBy: 'startDate' }));
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
        status: MovingBookingStatus.PENDING,
        from: '2026-09-01',
        to: '2026-09-03',
        search: 'MDN-MOV',
        sortBy: MovingBookingSort.TOTAL,
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
