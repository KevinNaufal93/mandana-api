/**
 * Pure rate math for Smart Storage quotes. No Nest decorators, no I/O —
 * must be mirrored in the frontend repo byte-for-byte, exactly like
 * moving-pricing.ts / lib/moving/pricing.ts. See docs/storage-integration.md.
 *
 * IMPORTANT: STORAGE_DEFAULTS (the discount tiers) is duplicated in the
 * frontend repo. Changing a threshold or percentage here without changing it
 * there silently desyncs the client-side estimate from the quoted price.
 *
 * Weekly pricing (added alongside the original monthly-only math): weekly
 * bookings never discount — the tiers below are month-only by design, a
 * reward for a monthly commitment, not something a short weekly stay earns.
 */

export type StorageDurationUnitValue = 'week' | 'month';

export const STORAGE_DEFAULTS = {
  roundToIdr: 1_000,
  // Longer commitments get a discount off the pre-discount subtotal. Sorted
  // ascending by minMonths; the last tier whose minMonths the duration meets
  // or exceeds applies. Month-only — never consulted for a weekly quote.
  durationDiscountTiers: [
    { minMonths: 1, discountPct: 0 },
    { minMonths: 3, discountPct: 5 },
    { minMonths: 6, discountPct: 10 },
    { minMonths: 12, discountPct: 15 },
  ],
} as const;

/** The rate fields a unit type (or an inventory row's override) contributes
 * to a quote. weeklyRate/supportsWeekly are optional so existing call sites
 * that only ever dealt in months keep compiling unchanged. */
export interface StorageRate {
  monthlyRate: number;
  weeklyRate?: number | null;
  supportsWeekly?: boolean;
}

export interface StorageQuoteResult {
  /** The reference monthly rate, always present regardless of the quoted unit. */
  monthlyRate: number;
  quantity: number;
  /** Present only when unit === 'month'; null for a weekly quote. */
  durationMonths: number | null;
  durationUnit: StorageDurationUnitValue;
  /** The billable count in durationUnit's unit. */
  duration: number;
  /** The rate actually applied per durationUnit. */
  unitRate: number;
  /** 'bulan' | 'minggu' — so the client never re-derives it. */
  unitLabel: string;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  total: number;
}

/** 'bulan' | 'minggu' — shared by storageQuote() and any other reader (the
 * booking mapper's WhatsApp template, response DTOs) that needs the label
 * for a unit without re-deriving it. */
export const UNIT_LABELS: Record<StorageDurationUnitValue, string> = {
  month: 'bulan',
  week: 'minggu',
};

/** Coerces a possibly-invalid numeric input to a finite, non-negative number. */
function nonNegative(value: number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function roundTo(value: number, step: number): number {
  if (step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

function resolveDiscountPct(
  durationMonths: number,
  tiers: typeof STORAGE_DEFAULTS.durationDiscountTiers,
): number {
  let pct: number = tiers[0].discountPct;
  for (const tier of tiers) {
    if (durationMonths >= tier.minMonths) pct = tier.discountPct;
  }
  return pct;
}

/**
 * Computes the total price for renting `quantity` units of a given rate over
 * `duration` `unit`s (weeks or months), with a duration-based discount
 * applied to the whole-term subtotal — monthly only; a weekly quote's
 * `discountPct` is always 0, never derived from the month tiers (13 weeks
 * must not quietly land in the 3-month bracket).
 *
 * `unit` defaults to `'month'` and the 4-arg (or fewer) call shape is
 * unchanged, so every pre-existing call site keeps its exact behaviour.
 *
 * Defensively clamps non-finite/negative/zero input to an all-zero result
 * rather than emitting `NaN` — a broken number on screen is worse than a
 * zero.
 */
export function storageQuote(
  rate: StorageRate,
  quantity: number,
  duration: number,
  unit: StorageDurationUnitValue = 'month',
  opts: Partial<typeof STORAGE_DEFAULTS> = {},
): StorageQuoteResult {
  const defaults = { ...STORAGE_DEFAULTS, ...opts };
  const monthlyRate = nonNegative(rate.monthlyRate);
  const weeklyRate = nonNegative(rate.weeklyRate);
  const unitRate = unit === 'week' ? weeklyRate : monthlyRate;

  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
  const safeDuration =
    Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0;

  if (safeQuantity === 0 || safeDuration === 0) {
    return {
      monthlyRate,
      quantity: safeQuantity,
      durationMonths: unit === 'month' ? safeDuration : null,
      durationUnit: unit,
      duration: safeDuration,
      unitRate,
      unitLabel: UNIT_LABELS[unit],
      subtotal: 0,
      discountPct: 0,
      discountAmount: 0,
      total: 0,
    };
  }

  const subtotal = unitRate * safeQuantity * safeDuration;
  const discountPct =
    unit === 'month'
      ? resolveDiscountPct(safeDuration, defaults.durationDiscountTiers)
      : 0;
  const discountAmount = roundTo(
    subtotal * (discountPct / 100),
    defaults.roundToIdr,
  );
  const total = subtotal - discountAmount;

  return {
    monthlyRate,
    quantity: safeQuantity,
    durationMonths: unit === 'month' ? safeDuration : null,
    durationUnit: unit,
    duration: safeDuration,
    unitRate,
    unitLabel: UNIT_LABELS[unit],
    subtotal,
    discountPct,
    discountAmount,
    total,
  };
}

/** Resolves the effective monthly + weekly rates for a unit type at a given
 * inventory row — the `override ?? base` expression that used to be
 * copy-pasted at every call site (storage.service.ts, storage-bookings
 * .service.ts, storage.mapper.ts). Weekly resolves independently of
 * monthly: a facility can override one without the other. */
export function resolveStorageRates(
  unitType: {
    monthlyRate: number;
    weeklyRate: number | null;
    supportsWeekly: boolean;
  },
  inventory: {
    monthlyRateOverride: number | null;
    weeklyRateOverride: number | null;
  },
): StorageRate {
  return {
    monthlyRate: inventory.monthlyRateOverride ?? unitType.monthlyRate,
    weeklyRate: inventory.weeklyRateOverride ?? unitType.weeklyRate,
    supportsWeekly: unitType.supportsWeekly,
  };
}

/**
 * Adds `months` whole calendar months to an ISO date string (UTC, no
 * timezone drift) and returns the result as `YYYY-MM-DD`. Clamps to the
 * target month's last day when the source day doesn't exist there (e.g.
 * Jan 31 + 1 month → Feb 28/29, not Mar 3) — matches how billing-cycle
 * "same day next month" is normally interpreted.
 */
export function addMonthsToDateString(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, daysInTargetMonth));

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Adds `weeks` whole weeks (7 × n days) to an ISO date string (UTC, no
 * timezone drift) and returns the result as `YYYY-MM-DD`. No end-of-month
 * clamping needed — a week is a fixed-length unit, unlike a calendar month.
 */
export function addWeeksToDateString(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + weeks * 7));

  const yyyy = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
