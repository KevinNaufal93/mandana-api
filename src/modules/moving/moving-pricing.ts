/**
 * Pure fare math for the Moving Support quote. No Nest decorators, no I/O —
 * mirrors `lib/moving/pricing.ts` in the frontend byte-for-byte so the
 * client-side preview (rendered instantly from the truck list) and the
 * server-authoritative `POST /moving/quote` response never disagree.
 *
 * IMPORTANT: `MOVING_DEFAULTS` is duplicated in the frontend repo. Changing
 * `includedKm`, `roundToIdr`, or `bandPct` here without changing it there
 * (or vice versa) silently desyncs the preview price from the quoted price.
 * See docs/moving-integration.md.
 */

export const MOVING_DEFAULTS = {
  includedKm: 5,
  roundToIdr: 10_000,
  bandPct: 10,
} as const;

/** The rate fields a truck class contributes to a quote. */
export interface TruckRate {
  baseFare: number;
  perKmFare: number;
  includedKm?: number | null;
  minFare?: number | null;
}

export interface MovingQuoteResult {
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  baseFare: number;
  distanceFare: number;
  subtotal: number;
  total: number;
  minFareApplied: boolean;
  lowEstimate: number;
  highEstimate: number;
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

/**
 * Computes a price band for a given road distance and truck rate card.
 * Defensively clamps non-finite/negative input to an all-zero result rather
 * than emitting `NaN` — a broken number on screen is worse than a zero.
 */
export function movingQuote(
  distanceMeters: number,
  rate: TruckRate,
  opts: Partial<typeof MOVING_DEFAULTS> = {},
): MovingQuoteResult {
  const defaults = { ...MOVING_DEFAULTS, ...opts };

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return {
      distanceKm: 0,
      includedKm: nonNegative(rate.includedKm ?? defaults.includedKm),
      chargeableKm: 0,
      baseFare: 0,
      distanceFare: 0,
      subtotal: 0,
      total: 0,
      minFareApplied: false,
      lowEstimate: 0,
      highEstimate: 0,
    };
  }

  const baseFare = nonNegative(rate.baseFare);
  const perKmFare = nonNegative(rate.perKmFare);
  const includedKm = nonNegative(rate.includedKm ?? defaults.includedKm);
  const minFare = nonNegative(rate.minFare ?? 0);

  const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
  const chargeableKm = Math.max(0, distanceKm - includedKm);
  const distanceFare = Math.round(chargeableKm * perKmFare);
  const subtotal = baseFare + distanceFare;

  const minFareApplied = minFare > subtotal;
  const rawTotal = minFareApplied ? minFare : subtotal;
  const total = roundTo(rawTotal, defaults.roundToIdr);

  const bandFraction = defaults.bandPct / 100;
  const lowEstimate = roundTo(total * (1 - bandFraction), defaults.roundToIdr);
  const highEstimate = roundTo(total * (1 + bandFraction), defaults.roundToIdr);

  return {
    distanceKm,
    includedKm,
    chargeableKm,
    baseFare,
    distanceFare,
    subtotal,
    total,
    minFareApplied,
    lowEstimate,
    highEstimate,
  };
}
