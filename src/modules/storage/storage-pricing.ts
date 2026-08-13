/**
 * Pure rate math for Smart Storage quotes. No Nest decorators, no I/O —
 * must be mirrored in the frontend repo byte-for-byte, exactly like
 * moving-pricing.ts / lib/moving/pricing.ts. See docs/storage-integration.md.
 *
 * IMPORTANT: STORAGE_DEFAULTS (the discount tiers) is duplicated in the
 * frontend repo. Changing a threshold or percentage here without changing it
 * there silently desyncs the client-side estimate from the quoted price.
 */

export const STORAGE_DEFAULTS = {
  roundToIdr: 1_000,
  // Longer commitments get a discount off the pre-discount subtotal. Sorted
  // ascending by minMonths; the last tier whose minMonths the duration meets
  // or exceeds applies.
  durationDiscountTiers: [
    { minMonths: 1, discountPct: 0 },
    { minMonths: 3, discountPct: 5 },
    { minMonths: 6, discountPct: 10 },
    { minMonths: 12, discountPct: 15 },
  ],
} as const;

/** The rate field a unit type (or an inventory row's override) contributes to a quote. */
export interface StorageRate {
  monthlyRate: number;
}

export interface StorageQuoteResult {
  monthlyRate: number;
  quantity: number;
  durationMonths: number;
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  total: number;
}

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
 * Computes the total price for renting `quantity` units of a given monthly
 * rate over `durationMonths`, with a duration-based discount applied to the
 * whole-term subtotal. Defensively clamps non-finite/negative/zero input to
 * an all-zero result rather than emitting `NaN` — a broken number on screen
 * is worse than a zero.
 */
export function storageQuote(
  rate: StorageRate,
  quantity: number,
  durationMonths: number,
  opts: Partial<typeof STORAGE_DEFAULTS> = {},
): StorageQuoteResult {
  const defaults = { ...STORAGE_DEFAULTS, ...opts };
  const monthlyRate = nonNegative(rate.monthlyRate);
  const safeQuantity =
    Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 0;
  const safeDuration =
    Number.isFinite(durationMonths) && durationMonths > 0
      ? Math.floor(durationMonths)
      : 0;

  if (safeQuantity === 0 || safeDuration === 0) {
    return {
      monthlyRate,
      quantity: safeQuantity,
      durationMonths: safeDuration,
      subtotal: 0,
      discountPct: 0,
      discountAmount: 0,
      total: 0,
    };
  }

  const subtotal = monthlyRate * safeQuantity * safeDuration;
  const discountPct = resolveDiscountPct(
    safeDuration,
    defaults.durationDiscountTiers,
  );
  const discountAmount = roundTo(
    subtotal * (discountPct / 100),
    defaults.roundToIdr,
  );
  const total = subtotal - discountAmount;

  return {
    monthlyRate,
    quantity: safeQuantity,
    durationMonths: safeDuration,
    subtotal,
    discountPct,
    discountAmount,
    total,
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
