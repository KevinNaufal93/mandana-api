import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryMovingLeadsDto } from './query-moving-leads.dto';
import { MovingLeadStatus } from '../enums/moving-lead-status.enum';

function build(overrides: Record<string, unknown> = {}): QueryMovingLeadsDto {
  return plainToInstance(QueryMovingLeadsDto, { ...overrides });
}

describe('QueryMovingLeadsDto validation', () => {
  it('accepts an empty query, with page/limit defaults applied', async () => {
    const dto = build();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(12);
  });

  it('accepts a valid status', async () => {
    const errors = await validate(
      build({ status: MovingLeadStatus.CONTACTED }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    const errors = await validate(build({ status: 'archived' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
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

  it('accepts all four filters together', async () => {
    const errors = await validate(
      build({
        status: MovingLeadStatus.NEW,
        from: '2026-09-01',
        to: '2026-09-03',
        search: 'MDN-MOV',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('still enforces inherited pagination rules — limit above 100', async () => {
    const errors = await validate(build({ limit: 101 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
