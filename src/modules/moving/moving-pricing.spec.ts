import { movingQuote, MovingAddonRate, TruckRate } from './moving-pricing';

const cdd: TruckRate = {
  baseFare: 850_000,
  per500mFare: 4_000,
  includedKm: 5,
  minFare: 850_000,
};

// Pick Up Bak's real seeded rate (src/database/migrations/1786500000000-AddMovingTruckClasses.ts) —
// used for the multi-leg tests below since it's the FE requirements doc's
// own worked example.
const pickupBak: TruckRate = {
  baseFare: 250_000,
  per500mFare: 2_250,
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
    expect(result.chargeableSteps).toBe(30);
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
        chargeableSteps: 30,
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
      expect(result.chargeableSteps).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    }
  });

  it('an empty legs array short-circuits to the same all-zero shape', () => {
    const result = movingQuote([], cdd);
    expect(result.total).toBe(0);
    expect(result.legs).toEqual([]);
    expect(result.chargeableSteps).toBe(0);
    expect(result.includedKm).toBe(5); // still populated, mirroring the single-value guard
  });

  it('a mix of one valid + one invalid leg only zero-bands the bad one', () => {
    const result = movingQuote(
      [{ distanceMeters: 20_000 }, { distanceMeters: 0 }],
      cdd,
    );
    expect(result.legs[1]).toEqual({
      distanceKm: 0,
      // includedKm 0, not 5 — this leg is index 1, not the first leg, so
      // it carries no allowance regardless of validity (see
      // movingQuote()'s doc comment on what "first leg" means).
      includedKm: 0,
      chargeableKm: 0,
      chargeableSteps: 0,
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
  it('only the first leg gets baseFare + includedKm; later legs bill their entire distance in steps', () => {
    // pickupBak: baseFare 250,000, per500mFare 2,250, includedKm 5.
    //   leg 0 (first, 5,000 m): within the 5 km allowance -> 0 steps,
    //     subtotal is the flat baseFare alone, same as a single-leg trip.
    //   leg 1 (10,000 m, NOT first): no baseFare, no allowance — its FULL
    //     10 km bills in steps: ceil(10,000/500) = 20 steps.
    //   leg 2 (2,000 m, NOT first): same rule — its full 2 km bills in
    //     steps: ceil(2,000/500) = 4 steps. Note this is MORE expensive
    //     than being under a 5 km allowance would be — later legs have no
    //     allowance to be under.
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
        chargeableSteps: 0,
        baseFare: 250_000,
        distanceFare: 0,
        subtotal: 250_000,
      },
      {
        distanceKm: 10,
        includedKm: 0,
        chargeableKm: 10,
        chargeableSteps: 20,
        baseFare: 0,
        distanceFare: 45_000,
        subtotal: 45_000,
      },
      {
        distanceKm: 2,
        includedKm: 0,
        chargeableKm: 2,
        chargeableSteps: 4,
        baseFare: 0,
        distanceFare: 9_000,
        subtotal: 9_000,
      },
    ]);
    expect(result.distanceKm).toBe(17);
    expect(result.includedKm).toBe(5); // sum across legs — only leg 0 contributes
    expect(result.chargeableKm).toBe(12);
    expect(result.chargeableSteps).toBe(24);
    expect(result.baseFare).toBe(250_000); // ONE flat baseFare, not 3x
    expect(result.distanceFare).toBe(54_000); // leg 1 (45,000) + leg 2 (9,000)
    expect(result.travelSubtotal).toBe(304_000);
    expect(result.minFareApplied).toBe(false);
    expect(result.total).toBe(300_000);
    expect(result.lowEstimate).toBe(270_000);
    expect(result.highEstimate).toBe(330_000);
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
    expect(result.chargeableSteps).toBe(24); // a measured fact, not doubled by roundTrip
    expect(result.distanceFare).toBe(54_000); // unchanged from the non-roundTrip case above
    expect(result.travelSubtotal).toBe(304_000); // unchanged
    expect(result.tollFare).toBe(44_200); // (1,300 * 17km = 22,100) x 2, doubled independent of leg count
    expect(result.subtotal).toBe(348_200);
    expect(result.total).toBe(350_000);
    expect(result.lowEstimate).toBe(320_000);
    expect(result.highEstimate).toBe(390_000);
  });

  it('real-world shape: a short first leg (flat) followed by a longer second leg (pure steps)', () => {
    // 4.7 km then 3.2 km on pickupBak (250,000 base / 2,250 per 500 m).
    // Leg 0 is within its 5 km allowance -> flat 250,000, same as a
    // single-destination trip. Leg 1 has no allowance at all: its full
    // 3.2 km bills in steps from the first metre — ceil(3,200/500) = 7
    // steps x 2,250 = 15,750. NOT another flat 250,000.
    const result = movingQuote(
      [{ distanceMeters: 4_700 }, { distanceMeters: 3_200 }],
      pickupBak,
    );
    expect(result.legs[0].subtotal).toBe(250_000);
    expect(result.legs[1]).toEqual({
      distanceKm: 3.2,
      includedKm: 0,
      chargeableKm: 3.2,
      chargeableSteps: 7,
      baseFare: 0,
      distanceFare: 15_750,
      subtotal: 15_750,
    });
    expect(result.travelSubtotal).toBe(265_750);
    expect(result.total).toBe(270_000);
  });

  it('minFare floors the trip-wide sum once — a light first leg still combines with the rest of the trip to clear it', () => {
    // cddWithHigherMinFare: baseFare 850,000, per500mFare 4,000, minFare
    // 1,000,000. Leg 0 alone (850,000, within its 5 km allowance) is BELOW
    // minFare on its own, but leg 1's full 20 km of pure stepped distance
    // (ceil(20,000/500) = 40 steps x 4,000 = 160,000) brings the trip-wide
    // sum to 1,010,000 — clearing the floor without needing a per-leg
    // floor on leg 1 (which has no baseFare/floor of its own to begin
    // with under the new model).
    const result = movingQuote(
      [{ distanceMeters: 1_000 }, { distanceMeters: 20_000 }],
      cddWithHigherMinFare,
    );
    expect(result.minFareApplied).toBe(false);
    expect(result.travelSubtotal).toBe(1_010_000);
  });

  it('minFare floors the SUM once when the summed total is still below it — not doubled-floored', () => {
    const cheapRate: TruckRate = {
      baseFare: 400_000,
      per500mFare: 4_000,
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

describe('movingQuote — 500 m distance stepping', () => {
  // Readable fixture, distinct from cdd/pickupBak — minFare: 0 so the floor
  // never masks a boundary.
  const stepper: TruckRate = {
    baseFare: 100_000,
    per500mFare: 10_000,
    includedKm: 5,
    minFare: 0,
  };

  it.each([
    [4_999, 0, 0],
    [5_000, 0, 0],
    [5_001, 1, 10_000],
    [5_499, 1, 10_000],
    [5_500, 1, 10_000],
    [5_501, 2, 20_000],
    [6_000, 2, 20_000],
    [6_001, 3, 30_000],
    [6_500, 3, 30_000],
  ])(
    '%i m -> %i step(s), distanceFare %i',
    (distanceMeters, steps, distanceFare) => {
      const result = movingQuote([{ distanceMeters }], stepper);
      expect(result.chargeableSteps).toBe(steps);
      expect(result.distanceFare).toBe(distanceFare);
    },
  );

  it('counts steps from raw metres, not the 0.1-km-rounded distanceKm', () => {
    // 5,501 m snaps to 5.5 km, which would show 500 m of excess and bill
    // ONE step. The correct answer is TWO — 501 m of excess.
    const result = movingQuote([{ distanceMeters: 5_501 }], stepper);
    expect(result.legs[0].distanceKm).toBe(5.5); // display still rounds
    expect(result.legs[0].chargeableSteps).toBe(2); // the fare does not
    expect(result.distanceFare).toBe(20_000);
  });

  it('a leg whose excess rounds away to 0.0 chargeableKm still bills a step', () => {
    // 5,040 m: 40 m of excess snaps to 0.0 km for display, but it is still
    // a whole step. Without chargeableSteps the response would show
    // "0 km extra" beside a 10,000 charge.
    const result = movingQuote([{ distanceMeters: 5_040 }], stepper);
    expect(result.legs[0].chargeableKm).toBe(0);
    expect(result.legs[0].chargeableSteps).toBe(1);
    expect(result.distanceFare).toBe(10_000);
  });

  it('rounds up each non-first leg independently — NOT the summed distance', () => {
    // Leg 0 (first, 501 m) is within its 5 km allowance -> 0 steps, flat
    // baseFare only. Legs 1 and 2 (501 m each, NOT first) have no
    // allowance at all, so each rounds its own FULL distance up
    // independently: ceil(501/500) = 2 steps apiece.
    //   per leg (correct) -> 2 + 2 = 4 steps = 40,000
    //   pooled (must NOT happen) -> ceil((501+501)/500) = 3 steps = 30,000
    const result = movingQuote(
      [
        { distanceMeters: 501 },
        { distanceMeters: 501 },
        { distanceMeters: 501 },
      ],
      stepper,
    );
    expect(result.legs.map((l) => l.chargeableSteps)).toEqual([0, 2, 2]);
    expect(result.chargeableSteps).toBe(4);
    expect(result.distanceFare).toBe(40_000);
    expect(result.baseFare).toBe(100_000); // ONE flat baseFare, from leg 0 only
    expect(result.travelSubtotal).toBe(140_000);
  });

  it('roundTrip doubles the stepped distance fare, not the step count or baseFare', () => {
    const oneWay = movingQuote([{ distanceMeters: 5_501 }], stepper);
    const rt = movingQuote(
      [{ distanceMeters: 5_501 }],
      stepper,
      {},
      { roundTrip: true },
    );
    expect(rt.chargeableSteps).toBe(2); // measured distance, not doubled
    expect(rt.distanceFare).toBe(40_000); // 2 steps x 10,000 x 2
    expect(rt.baseFare).toBe(oneWay.baseFare);
  });

  it('minFare still floors the summed stepped travel subtotal exactly once', () => {
    const floored: TruckRate = { ...stepper, minFare: 500_000 };
    // 2 legs x (100,000 + 1 step) = 220,000, floored once to 500,000 — a
    // buggy per-leg floor would produce 1,000,000.
    const result = movingQuote(
      [{ distanceMeters: 5_001 }, { distanceMeters: 5_001 }],
      floored,
    );
    expect(result.minFareApplied).toBe(true);
    expect(result.travelSubtotal).toBe(500_000);
  });

  it('includedKm: 0 bills from the first metre', () => {
    const none: TruckRate = { ...stepper, includedKm: 0 };
    expect(movingQuote([{ distanceMeters: 1 }], none).chargeableSteps).toBe(1);
    expect(movingQuote([{ distanceMeters: 500 }], none).chargeableSteps).toBe(
      1,
    );
    expect(movingQuote([{ distanceMeters: 501 }], none).chargeableSteps).toBe(
      2,
    );
  });
});
