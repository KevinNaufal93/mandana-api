/**
 * Pure fare math for the Moving Support quote. No Nest decorators, no I/O.
 *
 * There is no frontend mirror of this file anymore. `mandana-web` deleted
 * its client-side copy (`lib/moving/pricing.ts`) on 2026-08-12 after it
 * verifiably drifted from this endpoint's rounding rule — see
 * `lib/api/queries.ts` in that repo. `POST /moving/quote` is the sole
 * source of truth; the public site fetches it rather than estimating
 * locally. Distance is priced per leg (`movingQuote()` takes an ordered
 * `legs[]` array, not one summed `distanceMeters`) in whole 500 m steps —
 * see `MOVING_DISTANCE_STEP_METERS` below.
 *
 * `MOVING_DEFAULTS` is only the last-resort fallback used when no
 * MovingSettings row exists yet. The numbers that actually apply
 * (roundToIdr, bandPct, defaultIncludedKm) come from
 * `GET /moving/pricing-config` at runtime — callers fetch them rather than
 * hardcoding their own copy.
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

/**
 * Distance beyond a leg's included allowance is billed in whole 500 m
 * steps, rounded up — never pro-rated per metre. Deliberately a constant
 * here rather than a `truck_classes` column or a MovingSettings field: it
 * is the *shape* of the tariff, not a number ops tunes (they tune each
 * truck class's `per500mFare` instead). Against a 5 km allowance: 5.000 km
 * is 0 steps, 5.001 km is 1, 5.500 km is still 1, 5.501 km is 2.
 */
export const MOVING_DISTANCE_STEP_METERS = 500;

/** The rate fields a truck class contributes to a quote. `baseFare` and
 * `includedKm` apply ONCE per trip, on the first leg only — see
 * `movingQuote()`'s doc comment. */
export interface TruckRate {
  baseFare: number;
  /** Rupiah per whole 500 m step. Applies to the excess beyond
   * `includedKm` on the first leg, and to a later leg's ENTIRE distance
   * (no allowance on those). */
  per500mFare: number;
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

/** One leg of the trip (pickup→stop1, stop1→stop2, ...), as sent by the
 * client — already-measured road distance, not coordinates. */
export interface MovingLegInput {
  distanceMeters: number;
}

/** One leg's own priced breakdown. `baseFare`/`includedKm` are nonzero only
 * on the first leg (array index 0) — every later leg carries `0` for both,
 * since its entire distance bills in 500 m steps with no allowance (see
 * `movingQuote()`'s doc comment). Deliberately has no `minFareApplied` —
 * `minFare` is a trip-level floor applied once after summing every leg's
 * `subtotal`, never per leg, so a per-leg flag here would be structurally
 * meaningless. `subtotal` is this leg's own `baseFare + distanceFare` —
 * distinct from `MovingQuoteResult.travelSubtotal`, which is the trip-wide
 * sum after the minFare floor. */
export interface MovingQuoteLegResult {
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  /** Whole 500 m steps billed on this leg — `ceil(chargeableMeters / 500)`,
   * counted from RAW metres. This, not `chargeableKm`, is the multiplicand
   * behind `distanceFare`. Not doubled by `tripMultiplier` — it describes
   * the measured leg; the doubling lives in the fare, same as
   * `chargeableKm`. Can be > 0 while `chargeableKm` displays `0.0` (e.g.
   * 40 m of excess rounds to 0.0 km but is still a whole step). */
  chargeableSteps: number;
  baseFare: number;
  distanceFare: number;
  subtotal: number;
}

export interface MovingQuoteResult {
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  /** Sum of every leg's `chargeableSteps`. See that field's doc comment. */
  chargeableSteps: number;
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
  /** Per-leg breakdown, in request order — unrounded (only the top-level
   * `total`/`lowEstimate`/`highEstimate` are rounded). Every other field
   * above (`distanceKm`, `includedKm`, `chargeableKm`, `baseFare`,
   * `distanceFare`, `travelSubtotal`) is the sum across this array. */
  legs: MovingQuoteLegResult[];
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
 * Computes a price band for an ordered list of trip legs against a truck
 * rate card, plus optional round trip, toll, and add-on fees.
 *
 * `baseFare` and `includedKm` apply ONCE per trip, on the FIRST leg only
 * (array index 0) — not per leg. That first leg is priced exactly like a
 * single-destination trip: the flat `baseFare` covers up to `includedKm`,
 * and only the excess beyond that bills in 500 m steps. Every leg AFTER
 * the first gets no `baseFare` and no included-km allowance at all — its
 * ENTIRE distance bills in 500 m steps from the first metre. This models a
 * moving crew that charges a flat dispatch/first-stop fee once, then bills
 * pure distance for every additional stop after that (see
 * docs/moving-integration.md's "Multi-leg pricing" section). The per-leg
 * subtotals are summed for the trip total; `minFare` floors that sum once,
 * not per leg (see `MovingQuoteLegResult`'s doc comment).
 *
 * Distance beyond a leg's allowance (5 km on the first leg, 0 on every
 * leg after it) is billed in whole `MOVING_DISTANCE_STEP_METERS` (500 m)
 * steps, rounded UP — never pro-rated per metre and never pooled across
 * legs before rounding. Step counting reads each leg's RAW
 * `distanceMeters`, not the 0.1-km-rounded `distanceKm` — rounding to km
 * first and then stepping would misplace the boundary (5,501 m would snap
 * to 5.5 km, read as exactly 500 m of excess, and bill one step instead of
 * the correct two). `distanceKm`/`chargeableKm` remain accurate
 * display/persistence values; `chargeableSteps` is what actually drives
 * `distanceFare`, and the two can legitimately disagree (5,040 m against a
 * 5 km allowance displays `chargeableKm: 0` but still bills one step).
 *
 * "First leg" means array index 0, full stop — not "the first leg that
 * happens to be valid." If a caller sends a bogus leg 0 (0 m/NaN), it
 * zero-bands as usual and no leg in that request gets a `baseFare` — this
 * mirrors an invalid-leg request being a defensive edge case, never a real
 * client flow (the frontend always sends a real measured distance first).
 *
 * Round trip only auto-doubles distance for a single-leg request
 * (`legs.length === 1`, `tripMultiplier` becomes 2 on that one leg's
 * `distanceFare`) — this preserves today's exact single-destination
 * behavior, which has real live traffic. For a multi-leg request,
 * `roundTrip: true` does NOT double any leg's distance fare; the caller is
 * expected to include the actual return leg as its own explicit entry in
 * `legs[]` if they want it priced. Toll-fare doubling and any add-on's
 * `doublesOnRoundTrip` are unaffected by this — both stay gated purely on
 * the bare `roundTrip` flag, independent of leg count, exactly as before.
 * See docs/moving-integration.md's "Round trip + multiple legs" section.
 *
 * Defensively clamps non-finite/negative input to an all-zero result
 * rather than emitting `NaN` — a broken number on screen is worse than a
 * zero. The whole-request guard fires when `legs` is empty OR no leg in it
 * is individually valid (this exactly reproduces the old single-distance
 * guard for `legs.length === 1`, including ignoring addons/toll entirely —
 * NOT just zero-banding that one leg and letting minFare/addons/toll still
 * apply to the resulting zero subtotal, which would silently overcharge
 * since every seeded truck has `minFare === baseFare`). A genuine
 * multi-leg request with a *mix* of valid and invalid legs does not hit
 * this guard — only the bad leg zero-bands; everything else prices
 * normally.
 */
export function movingQuote(
  legs: MovingLegInput[],
  rate: TruckRate,
  opts: Partial<MovingPricingPolicy> = {},
  extras: MovingQuoteExtras = {},
): MovingQuoteResult {
  const defaults = { ...MOVING_DEFAULTS, ...opts };
  const roundTrip = extras.roundTrip === true;
  const tripMultiplier = roundTrip && legs.length === 1 ? 2 : 1;
  const tollRoute = extras.tollRoute !== false;
  const includedKmFallback = nonNegative(
    rate.includedKm ?? defaults.includedKm,
  );

  const isValidLeg = (leg: MovingLegInput) =>
    Number.isFinite(leg.distanceMeters) && leg.distanceMeters > 0;

  if (legs.length === 0 || !legs.some(isValidLeg)) {
    return {
      legs: [],
      distanceKm: 0,
      includedKm: includedKmFallback,
      chargeableKm: 0,
      chargeableSteps: 0,
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

  const baseFareRate = nonNegative(rate.baseFare);
  const per500mFare = nonNegative(rate.per500mFare);
  const minFare = nonNegative(rate.minFare ?? 0);

  const legResults: MovingQuoteLegResult[] = legs.map((leg, index) => {
    if (!isValidLeg(leg)) {
      return {
        distanceKm: 0,
        includedKm: 0,
        chargeableKm: 0,
        chargeableSteps: 0,
        baseFare: 0,
        distanceFare: 0,
        subtotal: 0,
      };
    }
    // baseFare and the included-km allowance apply ONCE per trip, on leg
    // index 0 only — see movingQuote()'s doc comment. Every leg after the
    // first gets neither: its entire distance bills in 500 m steps from
    // the first metre (includedMeters: 0 below collapses to that).
    const isFirstLeg = index === 0;
    const legBaseFare = isFirstLeg ? baseFareRate : 0;
    const legIncludedKm = isFirstLeg ? includedKmFallback : 0;

    // Step counting reads RAW metres and never the 0.1-km-rounded
    // distanceKm below: 5,501 m snaps to 5.5 km, which would show 500 m of
    // excess and bill ONE step instead of the correct two. distanceKm and
    // chargeableKm are display/persistence values from here on — they no
    // longer drive a single Rupiah.
    const includedMeters = legIncludedKm * 1000;
    const chargeableMeters = Math.max(0, leg.distanceMeters - includedMeters);
    const chargeableSteps = Math.ceil(
      chargeableMeters / MOVING_DISTANCE_STEP_METERS,
    );

    const distanceKm = Math.round((leg.distanceMeters / 1000) * 10) / 10;
    const chargeableKm = Math.round((chargeableMeters / 1000) * 10) / 10;
    const distanceFare =
      Math.round(chargeableSteps * per500mFare) * tripMultiplier;
    return {
      distanceKm,
      includedKm: legIncludedKm,
      chargeableKm,
      chargeableSteps,
      baseFare: legBaseFare,
      distanceFare,
      subtotal: legBaseFare + distanceFare,
    };
  });

  const sumLegs = (pick: (leg: MovingQuoteLegResult) => number) =>
    legResults.reduce((total, leg) => total + pick(leg), 0);

  // distanceKm/chargeableKm are re-snapped to the 1-decimal grid after
  // summing — adding several already-rounded x.1 values can leave
  // IEEE-754 dust (e.g. 239.2 + 472.5 + ... -> 2025.3999999999999) that
  // would otherwise leak into the JSON response verbatim. Unlike a
  // persisted MovingBooking (numeric(7,1) cleans this on write), a bare
  // /moving/quote response is never round-tripped through Postgres, so
  // nothing else fixes this up.
  const distanceKm = Math.round(sumLegs((l) => l.distanceKm) * 10) / 10;
  const chargeableKm = Math.round(sumLegs((l) => l.chargeableKm) * 10) / 10;
  // Integer sum — no 1-dp re-snapping needed, unlike the two above.
  const chargeableSteps = sumLegs((l) => l.chargeableSteps);
  const includedKm = sumLegs((l) => l.includedKm);
  const baseFare = sumLegs((l) => l.baseFare);
  const distanceFare = sumLegs((l) => l.distanceFare);
  const travelSubtotalPreMin = sumLegs((l) => l.subtotal);

  // min_fare floors the summed travel portion once, after every leg is
  // added up — never per leg. The first leg already carries a de facto
  // floor of its own (baseFare, paid flat regardless of distance); a
  // per-leg floor on top of that would double-count, and every leg after
  // the first has no baseFare to floor in the first place — it's pure
  // metered distance. Applied still before toll and add-ons, so a helper
  // fee or toll can't silently absorb the stated minimum on a short job
  // (see moving-integration.md).
  const minFareApplied = minFare > travelSubtotalPreMin;
  const travelSubtotal = minFareApplied ? minFare : travelSubtotalPreMin;

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
    // Independent of leg count, unlike distance's tripMultiplier above.
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

  const subtotal = travelSubtotal + tollFare + addonsTotal;
  const total = roundTo(subtotal, defaults.roundToIdr);

  const bandFraction = defaults.bandPct / 100;
  const lowEstimate = roundTo(total * (1 - bandFraction), defaults.roundToIdr);
  const highEstimate = roundTo(total * (1 + bandFraction), defaults.roundToIdr);

  return {
    legs: legResults,
    distanceKm,
    includedKm,
    chargeableKm,
    chargeableSteps,
    roundTrip,
    tripMultiplier,
    baseFare,
    distanceFare,
    travelSubtotal,
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
