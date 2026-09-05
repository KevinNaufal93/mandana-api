import {
  addMonthsToDateString,
  addWeeksToDateString,
  resolveStorageRates,
  STORAGE_DEFAULTS,
  storageQuote,
} from './storage-pricing';

const rate = { monthlyRate: 650_000 };
const rateWithWeekly = {
  monthlyRate: 650_000,
  weeklyRate: 200_000,
  supportsWeekly: true,
};

describe('storageQuote — neutrality (pre-weekly-pricing behaviour, unchanged)', () => {
  it('matches the original 4-arg (rate, quantity, durationMonths) call shape', () => {
    // Same inputs/outputs as before weekly pricing was added — the 4th
    // positional arg (`unit`) defaults to 'month'.
    expect(storageQuote(rate, 1, 6)).toEqual({
      monthlyRate: 650_000,
      quantity: 1,
      durationMonths: 6,
      durationUnit: 'month',
      duration: 6,
      unitRate: 650_000,
      unitLabel: 'bulan',
      subtotal: 3_900_000,
      discountPct: 10,
      discountAmount: 390_000,
      total: 3_510_000,
    });
  });

  it('reproduces every duration-tier boundary from before', () => {
    expect(storageQuote(rate, 1, 1).discountPct).toBe(0);
    expect(storageQuote(rate, 1, 2).discountPct).toBe(0);
    expect(storageQuote(rate, 1, 3).discountPct).toBe(5);
    expect(storageQuote(rate, 1, 5).discountPct).toBe(5);
    expect(storageQuote(rate, 1, 6).discountPct).toBe(10);
    expect(storageQuote(rate, 1, 11).discountPct).toBe(10);
    expect(storageQuote(rate, 1, 12).discountPct).toBe(15);
    expect(storageQuote(rate, 1, 60).discountPct).toBe(15);
  });

  it('reproduces the all-zero clamp for invalid input', () => {
    expect(storageQuote(rate, 0, 6).total).toBe(0);
    expect(storageQuote(rate, 1, 0).total).toBe(0);
    expect(storageQuote(rate, -1, 6).total).toBe(0);
    expect(storageQuote(rate, 1, NaN).total).toBe(0);
    expect(storageQuote({ monthlyRate: -500 }, 1, 6).subtotal).toBe(0);
  });

  it('reproduces quantity multiplication and rounding', () => {
    const result = storageQuote(rate, 3, 6);
    expect(result.subtotal).toBe(650_000 * 3 * 6);
    expect(result.discountAmount % STORAGE_DEFAULTS.roundToIdr).toBe(0);
  });
});

describe('storageQuote — weekly billing', () => {
  it('never applies a discount, at any duration', () => {
    expect(storageQuote(rateWithWeekly, 1, 1, 'week').discountPct).toBe(0);
    expect(storageQuote(rateWithWeekly, 1, 4, 'week').discountPct).toBe(0);
    // 12+ weeks must NOT quietly pick up the 12-month tier.
    expect(storageQuote(rateWithWeekly, 1, 12, 'week').discountPct).toBe(0);
    expect(storageQuote(rateWithWeekly, 1, 52, 'week').discountPct).toBe(0);
  });

  it('prices off weeklyRate, not monthlyRate', () => {
    const result = storageQuote(rateWithWeekly, 1, 3, 'week');
    expect(result.unitRate).toBe(200_000);
    expect(result.subtotal).toBe(200_000 * 3);
    expect(result.total).toBe(600_000);
    expect(result.discountAmount).toBe(0);
  });

  it('returns durationMonths: null and the correct unit fields', () => {
    const result = storageQuote(rateWithWeekly, 1, 3, 'week');
    expect(result.durationMonths).toBeNull();
    expect(result.durationUnit).toBe('week');
    expect(result.duration).toBe(3);
    expect(result.unitLabel).toBe('minggu');
    // The reference monthly rate is still reported even on a weekly quote.
    expect(result.monthlyRate).toBe(650_000);
  });

  it('multiplies quantity into the weekly subtotal', () => {
    const result = storageQuote(rateWithWeekly, 2, 4, 'week');
    expect(result.subtotal).toBe(200_000 * 2 * 4);
  });

  it('clamps a missing/zero weeklyRate to zero rather than NaN', () => {
    const noWeeklyRate = { monthlyRate: 650_000, weeklyRate: null };
    const result = storageQuote(noWeeklyRate, 1, 3, 'week');
    expect(result.unitRate).toBe(0);
    expect(result.total).toBe(0);
  });

  it('clamps invalid quantity/duration to an all-zero result', () => {
    expect(storageQuote(rateWithWeekly, 0, 3, 'week').total).toBe(0);
    expect(storageQuote(rateWithWeekly, 1, 0, 'week').total).toBe(0);
    expect(storageQuote(rateWithWeekly, 1, NaN, 'week').total).toBe(0);
    const result = storageQuote(rateWithWeekly, 1, 0, 'week');
    expect(result.durationMonths).toBeNull();
    expect(result.durationUnit).toBe('week');
  });
});

describe('resolveStorageRates', () => {
  const unitType = {
    monthlyRate: 650_000,
    weeklyRate: 200_000,
    supportsWeekly: true,
  };

  it('falls back to the unit type base rates when no override is set', () => {
    const result = resolveStorageRates(unitType, {
      monthlyRateOverride: null,
      weeklyRateOverride: null,
    });
    expect(result.monthlyRate).toBe(650_000);
    expect(result.weeklyRate).toBe(200_000);
  });

  it('applies each override independently', () => {
    const monthlyOnly = resolveStorageRates(unitType, {
      monthlyRateOverride: 700_000,
      weeklyRateOverride: null,
    });
    expect(monthlyOnly.monthlyRate).toBe(700_000);
    expect(monthlyOnly.weeklyRate).toBe(200_000);

    const weeklyOnly = resolveStorageRates(unitType, {
      monthlyRateOverride: null,
      weeklyRateOverride: 250_000,
    });
    expect(weeklyOnly.monthlyRate).toBe(650_000);
    expect(weeklyOnly.weeklyRate).toBe(250_000);
  });

  it('carries supportsWeekly through from the unit type', () => {
    const result = resolveStorageRates(
      { ...unitType, supportsWeekly: false },
      { monthlyRateOverride: null, weeklyRateOverride: null },
    );
    expect(result.supportsWeekly).toBe(false);
  });
});

describe('addMonthsToDateString', () => {
  it('adds whole calendar months', () => {
    expect(addMonthsToDateString('2026-01-15', 2)).toBe('2026-03-15');
  });

  it('clamps to the target month last day (Jan 31 + 1mo -> Feb 28)', () => {
    expect(addMonthsToDateString('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('clamps into a leap-year February correctly', () => {
    expect(addMonthsToDateString('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('addWeeksToDateString', () => {
  it('adds 7 days per week', () => {
    expect(addWeeksToDateString('2026-09-01', 3)).toBe('2026-09-22');
  });

  it('crosses a month boundary', () => {
    expect(addWeeksToDateString('2026-09-20', 2)).toBe('2026-10-04');
  });

  it('crosses a year boundary', () => {
    expect(addWeeksToDateString('2026-12-25', 2)).toBe('2027-01-08');
  });

  it('crosses a leap day correctly', () => {
    expect(addWeeksToDateString('2028-02-20', 2)).toBe('2028-03-05');
  });
});
