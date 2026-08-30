/**
 * How a MovingAddon's `amount` is computed in movingQuote() — see
 * moving-pricing.ts for the exact math per model.
 *
 * - FLAT: `unitPrice`, quantity forced to 1 (e.g. packaging).
 * - PER_UNIT: `unitPrice * clamp(quantity, minQty, maxQty)` (e.g. helper
 *   count, waiting hours). The `toll` row is the one exception — its
 *   PER_UNIT multiplies `distanceKm`, not a client-supplied quantity.
 * - PERCENT: `round(declaredValue * percentBps / 10_000)`, quantity forced
 *   to 1 (insurance premium).
 */
export enum MovingAddonPricingModel {
  FLAT = 'flat',
  PER_UNIT = 'per_unit',
  PERCENT = 'percent',
}
