import {
  addDaysToDateString,
  aggregateEventQuote,
  computeLine,
} from './event-pricing';

describe('addDaysToDateString', () => {
  it('a 1-day rental starts and ends on the same date', () => {
    expect(addDaysToDateString('2026-03-01', 1)).toBe('2026-03-01');
  });

  it('adds days-1 to the start date', () => {
    expect(addDaysToDateString('2026-03-01', 3)).toBe('2026-03-03');
  });

  it('rolls over a month boundary', () => {
    expect(addDaysToDateString('2026-03-30', 3)).toBe('2026-04-01');
  });

  it('treats a non-positive/invalid day count as 1 day', () => {
    expect(addDaysToDateString('2026-03-01', 0)).toBe('2026-03-01');
    expect(addDaysToDateString('2026-03-01', -5)).toBe('2026-03-01');
  });
});

describe('computeLine', () => {
  it('multiplies pricePerDay × quantity × days', () => {
    expect(
      computeLine({ pricePerDay: 3_500_000, quantity: 1, days: 2 }),
    ).toEqual({
      pricePerDay: 3_500_000,
      quantity: 1,
      days: 2,
      lineTotal: 7_000_000,
    });
  });

  it('clamps negative/non-finite input to a zero-total line instead of NaN', () => {
    expect(
      computeLine({ pricePerDay: NaN, quantity: 1, days: 1 }).lineTotal,
    ).toBe(0);
    expect(
      computeLine({ pricePerDay: 100, quantity: -1, days: 1 }).lineTotal,
    ).toBe(0);
  });

  it('floors a fractional day count up to at least 1', () => {
    expect(computeLine({ pricePerDay: 100, quantity: 1, days: 0.4 }).days).toBe(
      1,
    );
  });
});

describe('aggregateEventQuote', () => {
  it('sums line totals into subtotal and total with zero discount', () => {
    const lines = [
      computeLine({ pricePerDay: 3_500_000, quantity: 1, days: 2 }),
      computeLine({ pricePerDay: 3_500_000, quantity: 1, days: 1 }),
    ];
    expect(aggregateEventQuote(lines)).toEqual({
      lines,
      subtotal: 10_500_000,
      discountAmount: 0,
      total: 10_500_000,
    });
  });

  it('returns a zero total for an empty cart', () => {
    expect(aggregateEventQuote([])).toEqual({
      lines: [],
      subtotal: 0,
      discountAmount: 0,
      total: 0,
    });
  });
});
