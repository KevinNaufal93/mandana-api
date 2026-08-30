/**
 * Pure fare math for the Moving Support quote. No Nest decorators, no I/O —
 * mirrors `lib/moving/pricing.ts` in the frontend byte-for-byte so the
 * client-side preview (rendered instantly from the truck list) and the
 * server-authoritative `POST /moving/quote` response never disagree.
 *
 * IMPORTANT: this file's *function bodies* are mirrored in the frontend
 * repo — changing the math here without changing it there silently
 * desyncs the preview price from the quoted price. `MOVING_DEFAULTS`
 * itself is NOT part of that contract any more: it is only the
 * last-resort fallback used when no MovingSettings row exists yet. The
 * numbers that actually apply (roundToIdr, bandPct, defaultIncludedKm)
 * come from `GET /moving/pricing-config` at runtime — the frontend fetches
 * them rather than hardcoding its own copy. See docs/moving-integration.md.
 */

export interface MovingPricingPolicy {
  includedKm: number;
  roundToIdr: number;
  bandPct: number;
}

export const MOVING_DEFAULTS: MovingPricingPolicy = {
  includedKm: 5,
  roundToIdr: 10_000,
  bandPct: 10,
};

/** The rate fields a truck class contributes to a quote. */
export interface TruckRate {
  baseFare: number;
  perKmFare: number;
  includedKm?: number | null;
  minFare?: number | null;
}

/** The rate fields a MovingAddon (or the active toll row) contributes. */
export interface MovingAddonRate {
  slug: string;
  name: string;
  kind: 'helper' | 'packaging' | 'waiting' | 'insurance' | 'toll' | 'other';
  pricingModel: 'flat' | 'per_unit' | 'percent';
  unitPrice: number;
  percentBps: number | null;
  minCharge: number | null;
  maxCharge: number | null;
  minQty: number;
  maxQty: number;
  doublesOnRoundTrip: boolean;
}

export interface MovingAddonLine {
  slug: string;
  name: string;
  kind: MovingAddonRate['kind'];
  pricingModel: MovingAddonRate['pricingModel'];
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface MovingQuoteExtras {
  roundTrip?: boolean;
  /** Whether the quoted `distanceMeters` is a toll-road route — echoed back
   * on the result so the FE can render "termasuk rute tol" independently of
   * whether a toll fare actually applies. Defaults to true (Google's
   * current default route has no `avoidTolls`, so this preserves today's
   * implicit behavior for a caller that doesn't send the flag). */
  tollRoute?: boolean;
  declaredValue?: number;
  addons?: Array<{ rate: MovingAddonRate; quantity: number }>;
  /** The single active `kind: 'toll'` MovingAddon, resolved by the caller
   * only when `tollRoute` is true. `null`/omitted → no toll charged even on
   * a toll route — lets the feature ship as a no-op until an ops-configured
   * toll rate is activated. */
  toll?: MovingAddonRate | null;
}

export interface MovingQuoteResult {
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  roundTrip: boolean;
  tripMultiplier: number;
  baseFare: number;
  distanceFare: number;
  travelSubtotal: number;
  tollRoute: boolean;
  tollFare: number;
  addons: MovingAddonLine[];
  addonsTotal: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Computes one add-on line's `{ quantity, amount }` per its pricing model.
 * For a `per_unit` model, what gets multiplied is normally the client's
 * requested quantity — except the toll row, whose "unit" is a kilometre of
 * road (`distanceKm`), not something the client picks. */
function computeAddonAmount(
  rate: MovingAddonRate,
  requestedQuantity: number,
  distanceKm: number,
  declaredValue: number,
): { quantity: number; amount: number } {
  const minQty = nonNegative(rate.minQty) || 1;
  const maxQty = Math.max(minQty, nonNegative(rate.maxQty) || minQty);

  let quantity = 1;
  let rawAmount = 0;

  switch (rate.pricingModel) {
    case 'flat': {
      quantity = 1;
      rawAmount = nonNegative(rate.unitPrice);
      break;
    }
    case 'per_unit': {
      if (rate.kind === 'toll') {
        // The toll row's "unit" is distance, not a client quantity.
        quantity = distanceKm;
        rawAmount = Math.round(nonNegative(rate.unitPrice) * distanceKm);
      } else {
        quantity = clamp(
          Number.isFinite(requestedQuantity) ? requestedQuantity : minQty,
          minQty,
          maxQty,
        );
        rawAmount = nonNegative(rate.unitPrice) * quantity;
      }
      break;
    }
    case 'percent': {
      quantity = 1;
      const bps = nonNegative(rate.percentBps);
      rawAmount = Math.round((nonNegative(declaredValue) * bps) / 10_000);
      break;
    }
  }

  const min = rate.minCharge === null ? 0 : nonNegative(rate.minCharge);
  const max =
    rate.maxCharge === null
      ? Number.POSITIVE_INFINITY
      : nonNegative(rate.maxCharge);
  const amount = clamp(rawAmount, min, max);

  return { quantity, amount };
}

/**
 * Computes a price band for a given road distance and truck rate card,
 * plus optional round trip, toll, and add-on fees. Defensively clamps
 * non-finite/negative input to an all-zero result rather than emitting
 * `NaN` — a broken number on screen is worse than a zero.
 */
export function movingQuote(
  distanceMeters: number,
  rate: TruckRate,
  opts: Partial<MovingPricingPolicy> = {},
  extras: MovingQuoteExtras = {},
): MovingQuoteResult {
  const defaults = { ...MOVING_DEFAULTS, ...opts };
  const roundTrip = extras.roundTrip === true;
  const tripMultiplier = roundTrip ? 2 : 1;
  const tollRoute = extras.tollRoute !== false;

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return {
      distanceKm: 0,
      includedKm: nonNegative(rate.includedKm ?? defaults.includedKm),
      chargeableKm: 0,
      roundTrip,
      tripMultiplier,
      baseFare: 0,
      distanceFare: 0,
      travelSubtotal: 0,
      tollRoute,
      tollFare: 0,
      addons: [],
      addonsTotal: 0,
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
  const distanceFare = Math.round(chargeableKm * perKmFare) * tripMultiplier;
  const travelSubtotal = baseFare + distanceFare;

  // min_fare floors the travel portion only — before toll and add-ons, so a
  // helper fee or toll can't silently absorb the stated minimum on a short
  // job (see moving-integration.md).
  const minFareApplied = minFare > travelSubtotal;
  const travelSubtotalAfterMin = minFareApplied ? minFare : travelSubtotal;

  const declaredValue = nonNegative(extras.declaredValue);

  let tollFare = 0;
  if (extras.toll) {
    const { amount } = computeAddonAmount(
      extras.toll,
      1,
      distanceKm,
      declaredValue,
    );
    // You pay the toll both ways on a round trip — same doublesOnRoundTrip
    // switch as any other add-on line, seeded true on the toll row.
    tollFare =
      roundTrip && extras.toll.doublesOnRoundTrip ? amount * 2 : amount;
  }

  const addons: MovingAddonLine[] = (extras.addons ?? []).map(
    ({ rate: addonRate, quantity }) => {
      const { quantity: appliedQuantity, amount: baseAmount } =
        computeAddonAmount(addonRate, quantity, distanceKm, declaredValue);
      const amount =
        roundTrip && addonRate.doublesOnRoundTrip ? baseAmount * 2 : baseAmount;

      return {
        slug: addonRate.slug,
        name: addonRate.name,
        kind: addonRate.kind,
        pricingModel: addonRate.pricingModel,
        quantity: appliedQuantity,
        unitPrice: nonNegative(addonRate.unitPrice),
        amount,
      };
    },
  );
  const addonsTotal = addons.reduce((sum, line) => sum + line.amount, 0);

  const subtotal = travelSubtotalAfterMin + tollFare + addonsTotal;
  const total = roundTo(subtotal, defaults.roundToIdr);

  const bandFraction = defaults.bandPct / 100;
  const lowEstimate = roundTo(total * (1 - bandFraction), defaults.roundToIdr);
  const highEstimate = roundTo(total * (1 + bandFraction), defaults.roundToIdr);

  return {
    distanceKm,
    includedKm,
    chargeableKm,
    roundTrip,
    tripMultiplier,
    baseFare,
    distanceFare,
    travelSubtotal: travelSubtotalAfterMin,
    tollRoute,
    tollFare,
    addons,
    addonsTotal,
    subtotal,
    total,
    minFareApplied,
    lowEstimate,
    highEstimate,
  };
}
