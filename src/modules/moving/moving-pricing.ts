/**
 * Pure fare math for the Moving Support quote. No Nest decorators, no I/O —
 * mirrors `lib/moving/pricing.ts` in the frontend byte-for-byte so the
 * client-side preview (rendered instantly from the truck list) and the
 * server-authoritative `POST /moving/quote` response never disagree.
 *
 * IMPORTANT: this file's *function bodies* are mirrored in the frontend
 * repo — changing the math here without changing it there silently
 * desyncs the preview price from the quoted price. That now includes the
 * per-leg banding below (`movingQuote()` takes an ordered `legs[]` array,
 * not one summed `distanceMeters`) — porting the equivalent rewrite to
 * `lib/moving/pricing.ts` is explicitly OUT OF SCOPE for this backend
 * change; until it happens, the frontend's instant preview will disagree
 * with the server-authoritative response for any multi-leg quote. See
 * docs/moving-integration.md.
 *
 * `MOVING_DEFAULTS` itself is NOT part of the mirror contract: it is only
 * the last-resort fallback used when no MovingSettings row exists yet. The
 * numbers that actually apply (roundToIdr, bandPct, defaultIncludedKm)
 * come from `GET /moving/pricing-config` at runtime — the frontend fetches
 * them rather than hardcoding its own copy.
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

/** One leg of the trip (pickup→stop1, stop1→stop2, ...), as sent by the
 * client — already-measured road distance, not coordinates. */
export interface MovingLegInput {
  distanceMeters: number;
}

/** One leg's own priced breakdown. Deliberately has no `minFareApplied` —
 * `minFare` is a trip-level floor applied once after summing every leg's
 * `subtotal` (see `movingQuote()`), never per leg, so a per-leg flag here
 * would be structurally meaningless. `subtotal` is this leg's own
 * `baseFare + distanceFare` — distinct from `MovingQuoteResult.travelSubtotal`,
 * which is the trip-wide sum after the minFare floor. */
export interface MovingQuoteLegResult {
  distanceKm: number;
  includedKm: number;
  chargeableKm: number;
  baseFare: number;
  distanceFare: number;
  subtotal: number;
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
 * rate card, plus optional round trip, toll, and add-on fees. Each leg is
 * banded independently against the same rate card — a leg under
 * `includedKm` still pays that leg's full flat `baseFare`, no proration —
 * and the per-leg subtotals are summed for the trip total; `minFare` floors
 * that sum once, not per leg (see `MovingQuoteLegResult`'s doc comment).
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
  const perKmFare = nonNegative(rate.perKmFare);
  const minFare = nonNegative(rate.minFare ?? 0);

  const legResults: MovingQuoteLegResult[] = legs.map((leg) => {
    if (!isValidLeg(leg)) {
      return {
        distanceKm: 0,
        includedKm: includedKmFallback,
        chargeableKm: 0,
        baseFare: 0,
        distanceFare: 0,
        subtotal: 0,
      };
    }
    const distanceKm = Math.round((leg.distanceMeters / 1000) * 10) / 10;
    const chargeableKm = Math.max(0, distanceKm - includedKmFallback);
    const distanceFare = Math.round(chargeableKm * perKmFare) * tripMultiplier;
    return {
      distanceKm,
      includedKm: includedKmFallback,
      chargeableKm,
      baseFare: baseFareRate,
      distanceFare,
      subtotal: baseFareRate + distanceFare,
    };
  });

  const sumLegs = (pick: (leg: MovingQuoteLegResult) => number) =>
    legResults.reduce((total, leg) => total + pick(leg), 0);

  // distanceKm/chargeableKm are re-snapped to the 1-decimal grid after
  // summing — adding several already-rounded x.1 values can leave
  // IEEE-754 dust (e.g. 239.2 + 472.5 + ... -> 2025.3999999999999) that
  // would otherwise leak into the JSON response verbatim. Unlike a
  // persisted MovingLead (numeric(7,1) cleans this on write), a bare
  // /moving/quote response is never round-tripped through Postgres, so
  // nothing else fixes this up.
  const distanceKm = Math.round(sumLegs((l) => l.distanceKm) * 10) / 10;
  const chargeableKm = Math.round(sumLegs((l) => l.chargeableKm) * 10) / 10;
  const includedKm = sumLegs((l) => l.includedKm);
  const baseFare = sumLegs((l) => l.baseFare);
  const distanceFare = sumLegs((l) => l.distanceFare);
  const travelSubtotalPreMin = sumLegs((l) => l.subtotal);

  // min_fare floors the summed travel portion once, after every leg is
  // added up — never per leg (a leg under includedKm already pays the
  // full flat baseFare with no proration, which already acts as a de
  // facto per-leg floor; flooring again per leg would double-count) — and
  // still before toll and add-ons, so a helper fee or toll can't silently
  // absorb the stated minimum on a short job (see moving-integration.md).
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
