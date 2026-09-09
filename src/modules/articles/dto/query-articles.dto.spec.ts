import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryArticlesDto } from './query-articles.dto';

function build(overrides: Record<string, unknown> = {}): QueryArticlesDto {
  return plainToInstance(QueryArticlesDto, { ...overrides });
}

describe('QueryArticlesDto validation', () => {
  it("defaults limit to 9 — matches mandana-web's 3-up grid x 3 rows, not PaginationQueryDto's 12", async () => {
    const dto = build();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(9);
  });

  it('accepts an explicit limit within range', async () => {
    const errors = await validate(build({ limit: 20 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(false);
  });

  it('rejects a limit above the inherited ceiling of 100', async () => {
    const errors = await validate(build({ limit: 200 }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('accepts an optional categorySlug', async () => {
    const errors = await validate(build({ categorySlug: 'panduan-beli' }));
    expect(errors).toHaveLength(0);
  });
});
