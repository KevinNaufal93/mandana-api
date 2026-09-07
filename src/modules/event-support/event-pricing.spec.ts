import { EventBillingMode } from './enums/event-billing-mode.enum';
import {
  aggregateEventQuote,
  computeLine,
  EIGHT_HOUR_BLOCK_MINUTES,
  minutesBetween,
  parseNaiveDateTime,
  resolveActiveRate,
  todayInJakarta,
  windowEndDate,
  windowStartDate,
} from './event-pricing';

const dayOnlyItem = {
  pricePerDay: 3_500_000,
  eightHourRate: null,
  supportsEightHour: false,
};

// pricePerDay is deliberately well above the 8-hour rate so there's no
// ambiguity about which branch a test is exercising.
const eightHourItem = {
  pricePerDay: 1_000_000,
  eightHourRate: 600_000,
  supportsEightHour: true,
};

describe('parseNaiveDateTime / minutesBetween', () => {
  it('parses a naive local datetime as if it were UTC', () => {
    expect(parseNaiveDateTime('2026-03-01T09:00')).toBe(
      Date.UTC(2026, 2, 1, 9, 0),
    );
  });

  it('computes minutes between two naive datetimes', () => {
    expect(minutesBetween('2026-03-01T09:00', '2026-03-01T17:00')).toBe(480);
  });
});

describe('windowStartDate / windowEndDate', () => {
  it('a midnight-to-midnight window spans only the first day', () => {
    expect(windowStartDate('2026-03-01T00:00')).toBe('2026-03-01');
    expect(windowEndDate('2026-03-02T00:00')).toBe('2026-03-01');
  });

  it('an evening-to-morning window spans both days', () => {
    expect(windowStartDate('2026-03-01T20:00')).toBe('2026-03-01');
    expect(windowEndDate('2026-03-02T06:00')).toBe('2026-03-02');
  });
});

describe('todayInJakarta', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayInJakarta()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('computeLine — daily billing neutrality (unchanged by the 8-hour-block rewrite)', () => {
  // Each case reproduces exactly what the old ceil(hours/24) — equivalently
  // ceil(minutes/1440) — pricing produced both before hourly pricing
  // existed and now that it's been replaced by the 8-hour block; dropping
  // roundingUnitMinutes changes nothing here because 30 divides 1440.
  it.each([
    ['23h59m rounds up to 1 day', '2026-03-01T00:00', '2026-03-01T23:59', 1],
    ['exactly 24h is 1 day', '2026-03-01T00:00', '2026-03-02T00:00', 1],
    ['24h01m rounds up to 2 days', '2026-03-01T00:00', '2026-03-02T00:01', 2],
    ['47h59m rounds up to 2 days', '2026-03-01T00:00', '2026-03-02T23:59', 2],
    ['exactly 48h is 2 days', '2026-03-01T00:00', '2026-03-03T00:00', 2],
    ['48h01m rounds up to 3 days', '2026-03-01T00:00', '2026-03-03T00:01', 3],
  ])('%s', (_label, dropoffAt, pickupAt, expectedDays) => {
    const result = computeLine({
      ...dayOnlyItem,
      quantity: 1,
      dropoffAt,
      pickupAt,
    });
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
    expect(result.billableUnits).toBe(expectedDays);
    expect(result.unitLabel).toBe('hari');
    expect(result.unitPrice).toBe(3_500_000);
    expect(result.lineTotal).toBe(3_500_000 * expectedDays);
  });

  it('clamps a non-positive/inverted window to a zero-total line instead of NaN', () => {
    const result = computeLine({
      ...dayOnlyItem,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T09:00',
    });
    expect(result.lineTotal).toBe(0);
    expect(result.billableUnits).toBe(0);
  });

  it('a zero quantity zeroes the total', () => {
    const result = computeLine({
      ...dayOnlyItem,
      quantity: 0,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-02T09:00',
    });
    expect(result.lineTotal).toBe(0);
  });

  it('multiplies by quantity', () => {
    const result = computeLine({
      ...dayOnlyItem,
      quantity: 3,
      dropoffAt: '2026-03-01T00:00',
      pickupAt: '2026-03-03T00:00', // 2 days
    });
    expect(result.lineTotal).toBe(3_500_000 * 2 * 3);
  });
});

describe('computeLine — 8-hour block billing', () => {
  it('an eligible item at exactly the 8-hour boundary bills one block', () => {
    const result = computeLine({
      ...eightHourItem,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00', // exactly 480 minutes
    });
    expect(minutesBetween('2026-03-01T09:00', '2026-03-01T17:00')).toBe(
      EIGHT_HOUR_BLOCK_MINUTES,
    );
    expect(result.billingMode).toBe(EventBillingMode.EIGHT_HOUR);
    expect(result.unitPrice).toBe(600_000);
    expect(result.unitLabel).toBe('8 jam');
    expect(result.billableUnits).toBe(1);
    expect(result.lineTotal).toBe(600_000);
  });

  it('one minute past the boundary rolls straight to a full day — no partial block', () => {
    const result = computeLine({
      ...eightHourItem,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:01', // 481 minutes
    });
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
    expect(result.unitPrice).toBe(1_000_000);
    expect(result.billableUnits).toBe(1);
    expect(result.lineTotal).toBe(1_000_000);
  });

  it('a short window still only ever bills one block, never a fraction of one', () => {
    const result = computeLine({
      ...eightHourItem,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T09:30', // 30 minutes
    });
    expect(result.billingMode).toBe(EventBillingMode.EIGHT_HOUR);
    expect(result.billableUnits).toBe(1);
    expect(result.lineTotal).toBe(600_000);
  });

  it('supportsEightHour:false never bills the block, at any window length', () => {
    const result = computeLine({
      pricePerDay: 500_000,
      eightHourRate: 75_000,
      supportsEightHour: false,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
    });
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
  });

  it('a null or zero eightHourRate never bills the block, even with the flag on', () => {
    const withNull = computeLine({
      pricePerDay: 500_000,
      eightHourRate: null,
      supportsEightHour: true,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
    });
    expect(withNull.billingMode).toBe(EventBillingMode.DAILY);

    const withZero = computeLine({
      pricePerDay: 500_000,
      eightHourRate: 0,
      supportsEightHour: true,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
    });
    expect(withZero.billingMode).toBe(EventBillingMode.DAILY);
  });

  it('multiplies the block rate by quantity', () => {
    const result = computeLine({
      ...eightHourItem,
      quantity: 3,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
    });
    expect(result.lineTotal).toBe(600_000 * 3);
  });
});

describe('resolveActiveRate', () => {
  it('agrees with computeLine: returns the block rate for an eligible item within 8 hours', () => {
    const rate = resolveActiveRate(
      eightHourItem,
      '2026-03-01T09:00',
      '2026-03-01T17:00',
    );
    expect(rate).toEqual({
      amount: 600_000,
      unit: 'eight_hour',
      label: '8 jam',
    });

    const line = computeLine({
      ...eightHourItem,
      quantity: 1,
      dropoffAt: '2026-03-01T09:00',
      pickupAt: '2026-03-01T17:00',
    });
    expect(line.unitPrice).toBe(rate.amount);
  });

  it('falls back to the day rate for a day-only item', () => {
    expect(
      resolveActiveRate(dayOnlyItem, '2026-03-01T09:00', '2026-03-01T17:00'),
    ).toEqual({ amount: 3_500_000, unit: 'day', label: 'hari' });
  });

  it('agrees with computeLine: falls back to the day rate once the window exceeds 8 hours', () => {
    const rate = resolveActiveRate(
      eightHourItem,
      '2026-03-01T00:00',
      '2026-03-02T00:00',
    );
    expect(rate).toEqual({ amount: 1_000_000, unit: 'day', label: 'hari' });

    const line = computeLine({
      ...eightHourItem,
      quantity: 1,
      dropoffAt: '2026-03-01T00:00',
      pickupAt: '2026-03-02T00:00',
    });
    expect(line.unitPrice).toBe(rate.amount);
  });
});

describe('aggregateEventQuote', () => {
  it('sums line totals into subtotal and total with zero discount', () => {
    const lines = [
      computeLine({
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-03T00:00',
      }),
      computeLine({
        ...eightHourItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T17:00',
      }),
    ];
    const result = aggregateEventQuote(lines);
    expect(result.subtotal).toBe(7_000_000 + 600_000);
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(result.subtotal);
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
