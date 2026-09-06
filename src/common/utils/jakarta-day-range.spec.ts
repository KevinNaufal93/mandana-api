import { applyJakartaDayRange } from './jakarta-day-range';

interface QbMock {
  andWhere: jest.Mock;
}

function makeQb(): QbMock {
  const qb = {} as QbMock;
  qb.andWhere = jest.fn(() => qb);
  return qb;
}

describe('applyJakartaDayRange', () => {
  it('applies no clause when neither bound is given', () => {
    const qb = makeQb();
    applyJakartaDayRange(qb as never, 'b.createdAt');
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('binds the Jakarta-day-shifted lower bound', () => {
    const qb = makeQb();
    applyJakartaDayRange(qb as never, 'b.createdAt', '2026-09-01');
    expect(qb.andWhere).toHaveBeenCalledWith(
      "b.createdAt >= :from::date - INTERVAL '7 hours'",
      { from: '2026-09-01' },
    );
    expect(qb.andWhere).toHaveBeenCalledTimes(1);
  });

  it('binds the Jakarta-day-shifted upper bound', () => {
    const qb = makeQb();
    applyJakartaDayRange(qb as never, 'b.createdAt', undefined, '2026-09-03');
    expect(qb.andWhere).toHaveBeenCalledWith(
      "b.createdAt < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'",
      { to: '2026-09-03' },
    );
    expect(qb.andWhere).toHaveBeenCalledTimes(1);
  });

  it('binds both bounds and honors the given column reference', () => {
    const qb = makeQb();
    applyJakartaDayRange(
      qb as never,
      'l.createdAt',
      '2026-09-01',
      '2026-09-03',
    );
    expect(qb.andWhere).toHaveBeenNthCalledWith(
      1,
      "l.createdAt >= :from::date - INTERVAL '7 hours'",
      { from: '2026-09-01' },
    );
    expect(qb.andWhere).toHaveBeenNthCalledWith(
      2,
      "l.createdAt < :to::date + INTERVAL '1 day' - INTERVAL '7 hours'",
      { to: '2026-09-03' },
    );
  });
});
