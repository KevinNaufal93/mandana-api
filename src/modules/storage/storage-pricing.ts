/**
 * Pure rate math for Smart Storage quotes. No Nest decorators, no I/O — see
 * docs/storage-integration.md.
 *
 * `mandana-web` never mirrors this math client-side (unlike the Moving
 * module's old `lib/moving/pricing.ts`, since deleted) — every price comes
 * from `POST /storage/quote` or a booking response. Nothing to keep in sync.
 *
 * Weekly pricing (added alongside the original monthly-only math): weekly
 * bookings and monthly bookings are priced identically now — see the
 * `insurancePct` doc below.
 *
 * Insurance (added alongside the removed duration-discount tiers): every
 * quote is priced as rent + insurance, where insurance is a configurable
 * percentage of the rent — `total = subtotal + insuranceAmount`. The
 * percentage comes from the `storage_settings` singleton
 * (StorageSettingsService), passed in via `opts.insurancePct`; `0` (the
 * default) means no insurance line, so a caller that never wires the
 * setting through gets today's un-inflated total.
 */

export type StorageDurationUnitValue = 'week' | 'month';

/** Not `as const` — every field here is overridden at runtime with a plain
 *  `number` read from the DB (StorageSettingsService.get()), so the type
 *  must stay `number`, not a literal. */
export const STORAGE_DEFAULTS: { roundToIdr: number; insurancePct: number } = {
  roundToIdr: 1_000,
  /** Whole-percent, e.g. `20` = 20%. `0` disables the insurance line
   *  entirely. Overridden per-call from the `storage_settings` singleton —
   *  see StorageSettingsService.get(). */
  insurancePct: 0,
};

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
  /** Rent only — unitRate * quantity * duration. */
  subtotal: number;
  /**
   * @deprecated The duration-discount tiers were removed — always `0`.
   * Field kept (rather than dropped) so existing readers in this repo and
   * both frontend repos, which already gate their "Diskon durasi" row on
   * `> 0`, don't need a matching edit to stop rendering it.
   */
  discountPct: number;
  /** @deprecated Always `0` — see discountPct. */
  discountAmount: number;
  /** Whole-percent insurance rate applied to `subtotal`. */
  insurancePct: number;
  /** Rupiah — `round(subtotal * insurancePct / 100, roundToIdr)`. */
  insuranceAmount: number;
  /** `subtotal + insuranceAmount`. */
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

/**
 * Computes the total price for renting `quantity` units of a given rate over
 * `duration` `unit`s (weeks or months), plus a configurable insurance
 * premium on top of the rent — `total = subtotal + insuranceAmount`, where
 * `insuranceAmount = round(subtotal * insurancePct / 100, roundToIdr)`.
 * Weekly and monthly bookings are priced identically; there is no longer a
 * duration-based discount.
 *
 * `unit` defaults to `'month'` and the 4-arg (or fewer) call shape is
 * unchanged, so every pre-existing call site keeps its exact behaviour
 * (insurancePct defaults to 0, so `total === subtotal` unless a caller
 * passes `opts.insurancePct`).
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
  const insurancePct = nonNegative(defaults.insurancePct);

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
      insurancePct,
      insuranceAmount: 0,
      total: 0,
    };
  }

  const subtotal = unitRate * safeQuantity * safeDuration;
  const insuranceAmount = roundTo(
    subtotal * (insurancePct / 100),
    defaults.roundToIdr,
  );
  const total = subtotal + insuranceAmount;

  return {
    monthlyRate,
    quantity: safeQuantity,
    durationMonths: unit === 'month' ? safeDuration : null,
    durationUnit: unit,
    duration: safeDuration,
    unitRate,
    unitLabel: UNIT_LABELS[unit],
    subtotal,
    discountPct: 0,
    discountAmount: 0,
    insurancePct,
    insuranceAmount,
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
