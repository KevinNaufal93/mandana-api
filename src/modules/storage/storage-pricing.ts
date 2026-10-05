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
 * Insurance (added alongside the removed duration-discount tiers; later
 * repriced against declared value — see below): every quote is priced as
 * rent + insurance — `total = subtotal + insuranceAmount`. Insurance is a
 * configurable percentage of the customer's *declared goods value*
 * (`opts.declaredValue`), NOT of the rent — a storage unit's rent has no
 * relationship to what's stored inside it, so pricing insurance off
 * `subtotal` would have charged more for a bigger unit and nothing for an
 * empty declaration. The rate comes from the `storage_settings` singleton
 * (StorageSettingsService), passed in via `opts.insuranceBps` in basis
 * points (so ops can set a sub-1% rate); `0` (the default) or an absent/
 * zero `declaredValue` both mean no insurance line, so a caller that never
 * wires either through gets today's un-inflated total.
 */

export type StorageDurationUnitValue = 'week' | 'month';

/** Not `as const` — every field here is overridden at runtime with a plain
 *  `number` read from the DB (StorageSettingsService.get()), so the type
 *  must stay `number`, not a literal. */
export const STORAGE_DEFAULTS: { roundToIdr: number; insuranceBps: number } = {
  roundToIdr: 1_000,
  /** Basis points, e.g. `50` = 0.5%. `0` disables the insurance line
   *  entirely. Overridden per-call from the `storage_settings` singleton —
   *  see StorageSettingsService.get(). Charged against the customer's
   *  declared goods value (`opts.declaredValue`), never against the rent. */
  insuranceBps: 0,
};

/** `storageQuote()`'s options bag — the STORAGE_DEFAULTS fields (each
 *  overridable per call) plus `declaredValue`, which has no sensible
 *  singleton default (it's per-customer, not configurable by ops). */
export interface StorageQuoteOptions extends Partial<typeof STORAGE_DEFAULTS> {
  /** Customer-declared value of the goods being stored (Rupiah) — the base
   *  insurance is computed against. Omitted, `0`, or negative => no
   *  insurance line regardless of `insuranceBps` (there's nothing to
   *  insure). Not multiplied by quantity/duration — a one-time figure per
   *  booking line, unlike `subtotal`. */
  declaredValue?: number | null;
}

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
  /** Customer-declared value of the goods being stored (Rupiah) — the base
   *  insurance is computed against. `null` when not provided; insurance is
   *  then `0` regardless of `insurancePct`. Not multiplied by quantity/
   *  duration. */
  declaredValue: number | null;
  /** Percent insurance rate applied to `declaredValue` — may carry decimals
   *  (e.g. `0.5` means 0.5%). Derived from the whole-basis-point
   *  `storage_settings` value (`insuranceBps / 100`). */
  insurancePct: number;
  /** Rupiah — `round(declaredValue * insurancePct / 100, roundToIdr)`, or
   *  `0` when `declaredValue` is null/zero. */
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
 * premium charged once against the customer's declared goods value —
 * `total = subtotal + insuranceAmount`, where
 * `insuranceAmount = round(declaredValue * insurancePct / 100, roundToIdr)`.
 * Weekly and monthly bookings are priced identically; there is no longer a
 * duration-based discount, and insurance doesn't scale with quantity or
 * duration either — it's a one-time premium on the declared value.
 *
 * `unit` defaults to `'month'` and the 4-arg (or fewer) call shape is
 * unchanged, so every pre-existing call site keeps its exact behaviour
 * (insuranceBps defaults to 0 and declaredValue defaults to none, so
 * `total === subtotal` unless a caller passes both `opts.insuranceBps` and
 * `opts.declaredValue`).
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
  opts: StorageQuoteOptions = {},
): StorageQuoteResult {
  const defaults = { ...STORAGE_DEFAULTS, ...opts };
  const monthlyRate = nonNegative(rate.monthlyRate);
  const weeklyRate = nonNegative(rate.weeklyRate);
  const unitRate = unit === 'week' ? weeklyRate : monthlyRate;
  const insuranceBps = nonNegative(defaults.insuranceBps);
  const insurancePct = insuranceBps / 100;
  const rawDeclaredValue = nonNegative(opts.declaredValue);
  const declaredValue = rawDeclaredValue > 0 ? rawDeclaredValue : null;

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
      declaredValue,
      insurancePct,
      insuranceAmount: 0,
      total: 0,
    };
  }

  const subtotal = unitRate * safeQuantity * safeDuration;
  const insuranceAmount = declaredValue
    ? roundTo(declaredValue * (insuranceBps / 10_000), defaults.roundToIdr)
    : 0;
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
    declaredValue,
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
