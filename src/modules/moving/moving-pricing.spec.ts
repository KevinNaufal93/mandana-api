import { movingQuote, MovingAddonRate, TruckRate } from './moving-pricing';

const cdd: TruckRate = {
  baseFare: 850_000,
  perKmFare: 8_000,
  includedKm: 5,
  minFare: 850_000,
};

// Pick Up Bak's real seeded rate (src/database/migrations/1786500000000-AddMovingTruckClasses.ts) —
// used for the multi-leg tests below since it's the FE requirements doc's
// own worked example.
const pickupBak: TruckRate = {
  baseFare: 250_000,
  perKmFare: 4_500,
  includedKm: 5,
  minFare: 250_000,
};

const helper: MovingAddonRate = {
  slug: 'helper',
  name: 'Helper',
  kind: 'helper',
  pricingModel: 'per_unit',
  unitPrice: 150_000,
  percentBps: null,
  minCharge: null,
  maxCharge: null,
  minQty: 1,
  maxQty: 6,
  doublesOnRoundTrip: false,
};

const waitingTime: MovingAddonRate = {
  slug: 'waiting-time',
  name: 'Waktu Tunggu Tambahan',
  kind: 'waiting',
  pricingModel: 'per_unit',
  unitPrice: 100_000,
  percentBps: null,
  minCharge: null,
  maxCharge: null,
  minQty: 1,
  maxQty: 12,
  doublesOnRoundTrip: false,
};

const insurance: MovingAddonRate = {
  slug: 'insurance',
  name: 'Asuransi Barang',
  kind: 'insurance',
  pricingModel: 'percent',
  unitPrice: 0,
  percentBps: 20, // 0.2%
  minCharge: 50_000,
  maxCharge: null,
  minQty: 1,
  maxQty: 1,
  doublesOnRoundTrip: false,
};

const tollEstimate: MovingAddonRate = {
  slug: 'toll-estimate',
  name: 'Estimasi Tol',
  kind: 'toll',
  pricingModel: 'per_unit',
  unitPrice: 1_300, // per km
  percentBps: null,
  minCharge: 0,
  maxCharge: null,
  minQty: 1,
  maxQty: 1,
  doublesOnRoundTrip: true,
};

describe('movingQuote — regression (no extras)', () => {
  it('matches the pre-addon behavior exactly for a 20km trip', () => {
    const result = movingQuote([{ distanceMeters: 20_000 }], cdd);

    expect(result.distanceKm).toBe(20);
    expect(result.chargeableKm).toBe(15);
    expect(result.baseFare).toBe(850_000);
    expect(result.distanceFare).toBe(120_000);
    expect(result.subtotal).toBe(970_000);
    expect(result.total).toBe(970_000);
    expect(result.minFareApplied).toBe(false);
    expect(result.lowEstimate).toBe(870_000);
    expect(result.highEstimate).toBe(1_070_000);

    // additive fields are all no-ops when no extras are passed
    expect(result.roundTrip).toBe(false);
    expect(result.tripMultiplier).toBe(1);
    expect(result.tollFare).toBe(0);
    expect(result.addons).toEqual([]);
    expect(result.addonsTotal).toBe(0);

    // single-leg breakdown reproduces the aggregate exactly
    expect(result.legs).toEqual([
      {
        distanceKm: 20,
        includedKm: 5,
        chargeableKm: 15,
        baseFare: 850_000,
        distanceFare: 120_000,
        subtotal: 970_000,
      },
    ]);
  });

  it('still returns all-zero, never NaN, for non-finite/non-positive distance', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const result = movingQuote(
        [{ distanceMeters: bad }],
        cdd,
        {},
        { addons: [{ rate: helper, quantity: 2 }] },
      );
      expect(result.total).toBe(0);
      expect(result.addons).toEqual([]);
      expect(result.tollFare).toBe(0);
      expect(result.legs).toEqual([]);
      expect(Number.isFinite(result.total)).toBe(true);
    }
  });

  it('an empty legs array short-circuits to the same all-zero shape', () => {
    const result = movingQuote([], cdd);
    expect(result.total).toBe(0);
    expect(result.legs).toEqual([]);
    expect(result.includedKm).toBe(5); // still populated, mirroring the single-value guard
  });

  it('a mix of one valid + one invalid leg only zero-bands the bad one', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }, { distanceMeters: 0 }],
      cdd,
    );
    expect(result.legs[1]).toEqual({
      distanceKm: 0,
      includedKm: 5,
      chargeableKm: 0,
      baseFare: 0,
      distanceFare: 0,
      subtotal: 0,
    });
    expect(result.total).toBe(970_000); // unaffected by the bad leg
  });
});

describe('movingQuote — opts override (settings row)', () => {
  it('a custom bandPct changes the low/high band but not the total', () => {
    const base = movingQuote([{ distanceMeters: 20_000 }], cdd);
    const wide = movingQuote([{ distanceMeters: 20_000 }], cdd, {
      bandPct: 15,
    });

    expect(wide.total).toBe(base.total);
    expect(wide.lowEstimate).not.toBe(base.lowEstimate);
    expect(wide.highEstimate).not.toBe(base.highEstimate);
  });

  it('bandPct: 0 collapses low/high onto total', () => {
    const result = movingQuote([{ distanceMeters: 20_000 }], cdd, {
      bandPct: 0,
    });
    expect(result.lowEstimate).toBe(result.total);
    expect(result.highEstimate).toBe(result.total);
  });

  it('a custom roundToIdr changes the rounding step', () => {
    const result = movingQuote([{ distanceMeters: 20_000 }], cdd, {
      roundToIdr: 1_000,
    });
    // subtotal 970,000 is already a multiple of 1,000
    expect(result.total).toBe(970_000);
  });
});

describe('movingQuote — round trip', () => {
  it('doubles distanceFare but not baseFare (single leg)', () => {
    const oneWay = movingQuote([{ distanceMeters: 20_000 }], cdd);
    const roundTrip = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { roundTrip: true },
    );

    expect(roundTrip.tripMultiplier).toBe(2);
    expect(roundTrip.baseFare).toBe(oneWay.baseFare);
    expect(roundTrip.distanceFare).toBe(oneWay.distanceFare * 2);
  });

  it('doubles the toll fare (doublesOnRoundTrip: true on the seeded row)', () => {
    const oneWay = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { toll: tollEstimate },
    );
    const roundTrip = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { roundTrip: true, toll: tollEstimate },
    );

    expect(oneWay.tollFare).toBe(26_000); // 20km * 1,300
    expect(roundTrip.tollFare).toBe(52_000);
  });

  it('does not double a non-toll addon whose doublesOnRoundTrip is false', () => {
    const roundTrip = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { roundTrip: true, addons: [{ rate: helper, quantity: 2 }] },
    );
    expect(roundTrip.addons[0].amount).toBe(300_000); // 2 * 150,000, not doubled
  });
});

// minFare strictly above baseFare so a short trip actually triggers the
// floor (cdd's minFare equals its baseFare, so it never kicks in alone).
const cddWithHigherMinFare: TruckRate = { ...cdd, minFare: 1_000_000 };

describe('movingQuote — minFare floors travel only', () => {
  it('a short trip under minFare plus a helper equals minFare + helper, not more', () => {
    const result = movingQuote(
      [{ distanceMeters: 1_000 }], // 1km, well under the included 5km
      cddWithHigherMinFare,
      {},
      { addons: [{ rate: helper, quantity: 1 }] },
    );

    expect(result.minFareApplied).toBe(true);
    expect(result.travelSubtotal).toBe(1_000_000);
    expect(result.addonsTotal).toBe(150_000);
    expect(result.subtotal).toBe(1_150_000);
  });

  it('a toll on a below-minimum job is added, not absorbed', () => {
    const result = movingQuote(
      [{ distanceMeters: 1_000 }],
      cddWithHigherMinFare,
      {},
      { toll: tollEstimate },
    );
    expect(result.minFareApplied).toBe(true);
    expect(result.travelSubtotal).toBe(1_000_000);
    expect(result.tollFare).toBe(1_300); // 1km * 1,300, clamped to >= 0
    expect(result.subtotal).toBe(1_001_300);
  });
});

describe('movingQuote — pricing models', () => {
  it('flat: charges unitPrice regardless of requested quantity', () => {
    const packaging: MovingAddonRate = {
      slug: 'packaging-basic',
      name: 'Packaging Basic',
      kind: 'packaging',
      pricingModel: 'flat',
      unitPrice: 250_000,
      percentBps: null,
      minCharge: null,
      maxCharge: null,
      minQty: 1,
      maxQty: 1,
      doublesOnRoundTrip: false,
    };
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: packaging, quantity: 99 }] },
    );
    expect(result.addons[0].quantity).toBe(1);
    expect(result.addons[0].amount).toBe(250_000);
  });

  it('per_unit: multiplies unitPrice by the clamped quantity', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: waitingTime, quantity: 3 }] },
    );
    expect(result.addons[0].quantity).toBe(3);
    expect(result.addons[0].amount).toBe(300_000);
  });

  it('per_unit: clamps quantity to maxQty', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: helper, quantity: 99 }] },
    );
    expect(result.addons[0].quantity).toBe(6);
    expect(result.addons[0].amount).toBe(900_000);
  });

  it('per_unit: clamps quantity to minQty when below it', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: helper, quantity: 0 }] },
    );
    expect(result.addons[0].quantity).toBe(1);
  });

  it('percent: computes premium from declaredValue and percentBps', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { declaredValue: 50_000_000, addons: [{ rate: insurance, quantity: 1 }] },
    );
    // 50,000,000 * 20bps / 10,000 = 100,000
    expect(result.addons[0].amount).toBe(100_000);
  });

  it('percent: minCharge lifts a small premium up to the floor', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { declaredValue: 1_000_000, addons: [{ rate: insurance, quantity: 1 }] },
    );
    // 1,000,000 * 20bps / 10,000 = 2,000, floored to minCharge 50,000
    expect(result.addons[0].amount).toBe(50_000);
  });

  it('percent: declaredValue absent/0 yields a zero premium from the pure function', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: insurance, quantity: 1 }] },
    );
    // no minCharge floor bypass — this function doesn't know insurance was
    // "selected", it just computes 0 * bps / 10,000 = 0, then clamped up to
    // minCharge 50,000 by the floor (the 400 guard lives in the service).
    expect(result.addons[0].amount).toBe(50_000);
  });

  it('maxCharge caps a large flat/per_unit amount', () => {
    const cappedHelper: MovingAddonRate = { ...helper, maxCharge: 500_000 };
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { addons: [{ rate: cappedHelper, quantity: 6 }] },
    );
    expect(result.addons[0].amount).toBe(500_000); // would be 900,000 uncapped
  });

  it('toll per_unit scales on distanceKm and ignores requested quantity', () => {
    const result = movingQuote(
      [{ distanceMeters: 35_000 }],
      cdd,
      {},
      { toll: tollEstimate },
    );
    expect(result.tollFare).toBe(45_500); // 35km * 1,300
  });

  it('toll: null yields zero tollFare and an unchanged subtotal', () => {
    const withToll = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { toll: tollEstimate },
    );
    const withoutToll = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { toll: null },
    );
    expect(withoutToll.tollFare).toBe(0);
    expect(withoutToll.subtotal).toBe(withToll.subtotal - withToll.tollFare);
  });
});

describe('movingQuote — tollRoute echo', () => {
  it('defaults to true when omitted', () => {
    const result = movingQuote([{ distanceMeters: 20_000 }], cdd);
    expect(result.tollRoute).toBe(true);
  });

  it('echoes false when explicitly set, independent of whether a toll fare applies', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }],
      cdd,
      {},
      { tollRoute: false, toll: tollEstimate },
    );
    expect(result.tollRoute).toBe(false);
  });
});

describe('movingQuote — multi-leg', () => {
  it('prices each leg independently and sums — NOT the old whole-trip math for the same total distance', () => {
    const result = movingQuote(
      [
        { distanceMeters: 5_000 },
        { distanceMeters: 10_000 },
        { distanceMeters: 2_000 },
      ],
      pickupBak,
    );

    expect(result.legs).toEqual([
      {
        distanceKm: 5,
        includedKm: 5,
        chargeableKm: 0,
        baseFare: 250_000,
        distanceFare: 0,
        subtotal: 250_000,
      },
      {
        distanceKm: 10,
        includedKm: 5,
        chargeableKm: 5,
        baseFare: 250_000,
        distanceFare: 22_500,
        subtotal: 272_500,
      },
      {
        distanceKm: 2,
        includedKm: 5,
        chargeableKm: 0,
        baseFare: 250_000,
        distanceFare: 0,
        subtotal: 250_000,
      },
    ]);
    expect(result.distanceKm).toBe(17);
    expect(result.includedKm).toBe(15);
    expect(result.chargeableKm).toBe(5);
    expect(result.baseFare).toBe(750_000); // 3 x 250,000 - NOT one flat baseFare
    expect(result.distanceFare).toBe(22_500); // only leg 2's chargeable km
    expect(result.travelSubtotal).toBe(772_500);
    expect(result.minFareApplied).toBe(false);
    expect(result.total).toBe(770_000);
    expect(result.lowEstimate).toBe(690_000);
    expect(result.highEstimate).toBe(850_000);
    expect(result.tripMultiplier).toBe(1);
  });

  it('roundTrip: true on a multi-leg request does NOT double any leg distanceFare, but toll still doubles', () => {
    const result = movingQuote(
      [
        { distanceMeters: 5_000 },
        { distanceMeters: 10_000 },
        { distanceMeters: 2_000 },
      ],
      pickupBak,
      {},
      { roundTrip: true, toll: tollEstimate },
    );

    expect(result.tripMultiplier).toBe(1); // NOT 2 - legs.length > 1
    expect(result.distanceFare).toBe(22_500); // unchanged from the non-roundTrip case above
    expect(result.travelSubtotal).toBe(772_500); // unchanged
    expect(result.tollFare).toBe(44_200); // (1,300 * 17km = 22,100) x 2, doubled independent of leg count
    expect(result.subtotal).toBe(816_700);
    expect(result.total).toBe(820_000);
    expect(result.lowEstimate).toBe(740_000);
    expect(result.highEstimate).toBe(900_000);
  });

  it('minFare floors the SUM once — two legs each below a hypothetical per-leg floor, but the sum is not', () => {
    // cddWithHigherMinFare: baseFare 850,000, minFare 1,000,000 — each leg's
    // own subtotal (850,000) is individually below minFare, but the summed
    // total (1,700,000) already clears it, so nothing is floored. A buggy
    // per-leg-floor implementation would instead produce 2,000,000.
    const result = movingQuote(
      [{ distanceMeters: 1_000 }, { distanceMeters: 1_000 }],
      cddWithHigherMinFare,
    );
    expect(result.minFareApplied).toBe(false);
    expect(result.travelSubtotal).toBe(1_700_000);
  });

  it('minFare floors the SUM once when the summed total is still below it — not doubled-floored', () => {
    const cheapRate: TruckRate = {
      baseFare: 400_000,
      perKmFare: 8_000,
      includedKm: 5,
      minFare: 1_000_000,
    };
    const result = movingQuote(
      [{ distanceMeters: 1_000 }, { distanceMeters: 1_000 }],
      cheapRate,
    );
    expect(result.minFareApplied).toBe(true);
    expect(result.travelSubtotal).toBe(1_000_000); // floored once to the flat minFare, not 2,000,000
  });
});
