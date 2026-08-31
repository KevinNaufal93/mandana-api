/**
 * How a daily-billed line prices a window that isn't a whole number of
 * days (e.g. 30 hours). Configurable via EventSupportSettings so ops can
 * change the policy without a deploy — see event-pricing.ts.
 */
export enum EventOverThresholdMode {
  /** `days = ceil(hours / 24)` — the default, byte-identical to the web's
   * pre-existing `toLegacyQuoteWindow` adapter. */
  WHOLE_DAYS = 'whole_days',
  /** Full days at `pricePerDay`, remainder billed hourly. Only applies to
   * items with `supportsHourly: true`; falls back to WHOLE_DAYS otherwise. */
  DAY_PLUS_HOURLY = 'day_plus_hourly',
}
