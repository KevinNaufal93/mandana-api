import { EventBillingMode } from './enums/event-billing-mode.enum';
import { EventOverThresholdMode } from './enums/event-over-threshold-mode.enum';
import {
  aggregateEventQuote,
  computeLine,
  EVENT_PRICING_DEFAULTS,
  EventPricingPolicy,
  minutesBetween,
  parseNaiveDateTime,
  resolveActiveRate,
  todayInJakarta,
  windowEndDate,
  windowStartDate,
} from './event-pricing';

const DEFAULTS: EventPricingPolicy = EVENT_PRICING_DEFAULTS;

const dayOnlyItem = {
  pricePerDay: 3_500_000,
  hourlyRate: null,
  supportsHourly: false,
  minimumHours: null,
};

// pricePerDay is deliberately well above any of this suite's ordinary
// hourly totals (up to ~20h * 75_000) so the §6.2 cap only engages in the
// tests that specifically exercise it, below.
const hourlyItem = {
  pricePerDay: 1_000_000,
  hourlyRate: 75_000,
  supportsHourly: true,
  minimumHours: null,
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

describe('computeLine — daily billing (whole_days, the pre-hourly-pricing default)', () => {
  it('a 1-day rental (midnight to midnight) prices one day', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-02T00:00',
      },
      DEFAULTS,
    );
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
    expect(result.billableUnits).toBe(1);
    expect(result.startDate).toBe('2026-03-01');
    expect(result.endDate).toBe('2026-03-01');
    expect(result.lineTotal).toBe(3_500_000);
  });

  it('ceils a multi-day window up to whole days — reproduces the old ceil(hours/24) behaviour', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-02T15:00', // 30 hours
      },
      DEFAULTS,
    );
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
    expect(result.billableUnits).toBe(2);
    expect(result.lineTotal).toBe(7_000_000);
  });

  it('clamps a non-positive/inverted window to a zero-total line instead of NaN', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T09:00',
      },
      DEFAULTS,
    );
    expect(result.lineTotal).toBe(0);
    expect(result.billableUnits).toBe(0);
  });

  it('a zero quantity zeroes the total', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 0,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-02T09:00',
      },
      DEFAULTS,
    );
    expect(result.lineTotal).toBe(0);
  });
});

describe('computeLine — hourly billing', () => {
  it('an hourly-eligible item within the threshold bills by the hour', () => {
    const result = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T17:00', // 8 hours
      },
      DEFAULTS,
    );
    expect(result.billingMode).toBe(EventBillingMode.HOURLY);
    expect(result.unitPrice).toBe(75_000);
    expect(result.unitLabel).toBe('jam');
    expect(result.billableUnits).toBe(8);
    expect(result.lineTotal).toBe(600_000);
  });

  it('an item with hourlyRate set but supportsHourly:false never bills hourly, at any window length', () => {
    const result = computeLine(
      {
        pricePerDay: 500_000,
        hourlyRate: 75_000,
        supportsHourly: false,
        minimumHours: null,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T17:00',
      },
      DEFAULTS,
    );
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
  });

  it('applies the item minimumHours floor', () => {
    const result = computeLine(
      {
        ...hourlyItem,
        minimumHours: 4,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T10:00', // 1 hour
      },
      DEFAULTS,
    );
    expect(result.billableUnits).toBe(4);
    expect(result.lineTotal).toBe(300_000);
  });

  it('falls back to policy.defaultMinimumHours when the item sets none', () => {
    const result = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T09:30', // 30 minutes
      },
      DEFAULTS,
    );
    expect(result.billableUnits).toBe(DEFAULTS.defaultMinimumHours);
  });

  it('rounds up to the rounding step', () => {
    const withThirtyMinuteStep = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T14:20', // 5h20m
      },
      { ...DEFAULTS, roundingUnitMinutes: 30 },
    );
    expect(withThirtyMinuteStep.billableUnits).toBe(5.5);

    const withOneHourStep = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T09:00',
        pickupAt: '2026-03-01T14:20',
      },
      { ...DEFAULTS, roundingUnitMinutes: 60 },
    );
    expect(withOneHourStep.billableUnits).toBe(6);
  });

  it('caps the hourly total at the day rate when capHourlyAtDailyRate is on', () => {
    const capped = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-01T20:00', // 20 hours, still <= 24h threshold
      },
      { ...DEFAULTS, capHourlyAtDailyRate: true },
    );
    expect(capped.billingMode).toBe(EventBillingMode.HOURLY);
    expect(capped.lineTotal).toBe(1_000_000); // pricePerDay, not 20 * 75_000 = 1_500_000

    const uncapped = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-01T20:00',
      },
      { ...DEFAULTS, capHourlyAtDailyRate: false },
    );
    expect(uncapped.lineTotal).toBe(1_500_000);
  });

  it('respects hourlyThresholdInclusive at the exact boundary', () => {
    const inclusive = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-02T00:00', // exactly 24h
      },
      { ...DEFAULTS, hourlyThresholdHours: 24, hourlyThresholdInclusive: true },
    );
    expect(inclusive.billingMode).toBe(EventBillingMode.HOURLY);

    const exclusive = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-02T00:00',
      },
      {
        ...DEFAULTS,
        hourlyThresholdHours: 24,
        hourlyThresholdInclusive: false,
      },
    );
    expect(exclusive.billingMode).toBe(EventBillingMode.DAILY);
  });
});

describe('computeLine — day_plus_hourly over-threshold mode', () => {
  const policy: EventPricingPolicy = {
    ...DEFAULTS,
    overThresholdMode: EventOverThresholdMode.DAY_PLUS_HOURLY,
  };

  it('bills full days at pricePerDay plus the remainder hourly', () => {
    const result = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-02T06:00', // 30 hours: 1 day + 6h
      },
      policy,
    );
    expect(result.billingMode).toBe(EventBillingMode.DAILY);
    expect(result.billableUnits).toBe(1);
    expect(result.extraHours).toBe(6);
    expect(result.extraHoursTotal).toBe(450_000); // 6 * 75_000
    expect(result.lineTotal).toBe(1_000_000 + 450_000);
  });

  it('falls back to whole_days for an item that does not support hourly', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-02T06:00',
      },
      policy,
    );
    expect(result.extraHours).toBeNull();
    expect(result.billableUnits).toBe(2); // ceil(30/24)
  });

  it('leaves extraHours null when the window is a whole number of days', () => {
    const result = computeLine(
      {
        ...hourlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-03T00:00', // exactly 48h
      },
      policy,
    );
    expect(result.extraHours).toBeNull();
    expect(result.billableUnits).toBe(2);
  });
});

describe('resolveActiveRate', () => {
  it('returns the hourly rate for an eligible item within the threshold', () => {
    expect(
      resolveActiveRate(
        hourlyItem,
        '2026-03-01T09:00',
        '2026-03-01T17:00',
        DEFAULTS,
      ),
    ).toEqual({ amount: 75_000, unit: 'hour', label: 'jam' });
  });

  it('falls back to the day rate for a day-only item', () => {
    expect(
      resolveActiveRate(
        dayOnlyItem,
        '2026-03-01T09:00',
        '2026-03-01T17:00',
        DEFAULTS,
      ),
    ).toEqual({ amount: 3_500_000, unit: 'day', label: 'hari' });
  });

  it('falls back to the day rate once the window exceeds the threshold', () => {
    expect(
      resolveActiveRate(
        hourlyItem,
        '2026-03-01T00:00',
        '2026-03-03T00:00',
        DEFAULTS,
      ),
    ).toEqual({ amount: 1_000_000, unit: 'day', label: 'hari' });
  });
});

describe('aggregateEventQuote', () => {
  it('sums line totals into subtotal and total with zero discount', () => {
    const lines = [
      computeLine(
        {
          ...dayOnlyItem,
          quantity: 1,
          dropoffAt: '2026-03-01T00:00',
          pickupAt: '2026-03-03T00:00',
        },
        DEFAULTS,
      ),
      computeLine(
        {
          ...hourlyItem,
          quantity: 1,
          dropoffAt: '2026-03-01T09:00',
          pickupAt: '2026-03-01T17:00',
        },
        DEFAULTS,
      ),
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

describe('neutrality — a midnight-to-midnight N-day window matches the old {startDate, days: N} pricing', () => {
  it('matches for a 2-day rental of a day-only item', () => {
    const result = computeLine(
      {
        ...dayOnlyItem,
        quantity: 1,
        dropoffAt: '2026-03-01T00:00',
        pickupAt: '2026-03-03T00:00',
      },
      DEFAULTS,
    );
    // old: computeLine({ pricePerDay: 3_500_000, quantity: 1, days: 2 }).lineTotal === 7_000_000
    expect(result.lineTotal).toBe(7_000_000);
    expect(result.billableUnits).toBe(2);
  });
});
