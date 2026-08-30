import { movingQuote, MovingAddonRate, TruckRate } from './moving-pricing';

const cdd: TruckRate = {
  baseFare: 850_000,
  perKmFare: 8_000,
  includedKm: 5,
  minFare: 850_000,
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
    const result = movingQuote(20_000, cdd);

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
  });

  it('still returns all-zero, never NaN, for non-finite/non-positive distance', () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      const result = movingQuote(
        bad,
        cdd,
        {},
        { addons: [{ rate: helper, quantity: 2 }] },
      );
      expect(result.total).toBe(0);
      expect(result.addons).toEqual([]);
      expect(result.tollFare).toBe(0);
      expect(Number.isFinite(result.total)).toBe(true);
    }
  });
});

describe('movingQuote — opts override (settings row)', () => {
  it('a custom bandPct changes the low/high band but not the total', () => {
    const base = movingQuote(20_000, cdd);
    const wide = movingQuote(20_000, cdd, { bandPct: 15 });

    expect(wide.total).toBe(base.total);
    expect(wide.lowEstimate).not.toBe(base.lowEstimate);
    expect(wide.highEstimate).not.toBe(base.highEstimate);
  });

  it('bandPct: 0 collapses low/high onto total', () => {
    const result = movingQuote(20_000, cdd, { bandPct: 0 });
    expect(result.lowEstimate).toBe(result.total);
    expect(result.highEstimate).toBe(result.total);
  });

  it('a custom roundToIdr changes the rounding step', () => {
    const result = movingQuote(20_000, cdd, { roundToIdr: 1_000 });
    // subtotal 970,000 is already a multiple of 1,000
    expect(result.total).toBe(970_000);
  });
});

describe('movingQuote — round trip', () => {
  it('doubles distanceFare but not baseFare', () => {
    const oneWay = movingQuote(20_000, cdd);
    const roundTrip = movingQuote(20_000, cdd, {}, { roundTrip: true });

    expect(roundTrip.tripMultiplier).toBe(2);
    expect(roundTrip.baseFare).toBe(oneWay.baseFare);
    expect(roundTrip.distanceFare).toBe(oneWay.distanceFare * 2);
  });

  it('doubles the toll fare (doublesOnRoundTrip: true on the seeded row)', () => {
    const oneWay = movingQuote(20_000, cdd, {}, { toll: tollEstimate });
    const roundTrip = movingQuote(
      20_000,
      cdd,
      {},
      { roundTrip: true, toll: tollEstimate },
    );

    expect(oneWay.tollFare).toBe(26_000); // 20km * 1,300
    expect(roundTrip.tollFare).toBe(52_000);
  });

  it('does not double a non-toll addon whose doublesOnRoundTrip is false', () => {
    const roundTrip = movingQuote(
      20_000,
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
      1_000, // 1km, well under the included 5km
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
      1_000,
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
      20_000,
      cdd,
      {},
      { addons: [{ rate: packaging, quantity: 99 }] },
    );
    expect(result.addons[0].quantity).toBe(1);
    expect(result.addons[0].amount).toBe(250_000);
  });

  it('per_unit: multiplies unitPrice by the clamped quantity', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { addons: [{ rate: waitingTime, quantity: 3 }] },
    );
    expect(result.addons[0].quantity).toBe(3);
    expect(result.addons[0].amount).toBe(300_000);
  });

  it('per_unit: clamps quantity to maxQty', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { addons: [{ rate: helper, quantity: 99 }] },
    );
    expect(result.addons[0].quantity).toBe(6);
    expect(result.addons[0].amount).toBe(900_000);
  });

  it('per_unit: clamps quantity to minQty when below it', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { addons: [{ rate: helper, quantity: 0 }] },
    );
    expect(result.addons[0].quantity).toBe(1);
  });

  it('percent: computes premium from declaredValue and percentBps', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { declaredValue: 50_000_000, addons: [{ rate: insurance, quantity: 1 }] },
    );
    // 50,000,000 * 20bps / 10,000 = 100,000
    expect(result.addons[0].amount).toBe(100_000);
  });

  it('percent: minCharge lifts a small premium up to the floor', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { declaredValue: 1_000_000, addons: [{ rate: insurance, quantity: 1 }] },
    );
    // 1,000,000 * 20bps / 10,000 = 2,000, floored to minCharge 50,000
    expect(result.addons[0].amount).toBe(50_000);
  });

  it('percent: declaredValue absent/0 yields a zero premium from the pure function', () => {
    const result = movingQuote(
      20_000,
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
      20_000,
      cdd,
      {},
      { addons: [{ rate: cappedHelper, quantity: 6 }] },
    );
    expect(result.addons[0].amount).toBe(500_000); // would be 900,000 uncapped
  });

  it('toll per_unit scales on distanceKm and ignores requested quantity', () => {
    const result = movingQuote(35_000, cdd, {}, { toll: tollEstimate });
    expect(result.tollFare).toBe(45_500); // 35km * 1,300
  });

  it('toll: null yields zero tollFare and an unchanged subtotal', () => {
    const withToll = movingQuote(20_000, cdd, {}, { toll: tollEstimate });
    const withoutToll = movingQuote(20_000, cdd, {}, { toll: null });
    expect(withoutToll.tollFare).toBe(0);
    expect(withoutToll.subtotal).toBe(withToll.subtotal - withToll.tollFare);
  });
});

describe('movingQuote — tollRoute echo', () => {
  it('defaults to true when omitted', () => {
    const result = movingQuote(20_000, cdd);
    expect(result.tollRoute).toBe(true);
  });

  it('echoes false when explicitly set, independent of whether a toll fare applies', () => {
    const result = movingQuote(
      20_000,
      cdd,
      {},
      { tollRoute: false, toll: tollEstimate },
    );
    expect(result.tollRoute).toBe(false);
  });
});
