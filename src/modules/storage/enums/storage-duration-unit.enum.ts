/** Which unit a storage quote/booking's duration is expressed in. Lives per
 * quote/booking, mirroring EventBillingMode — a weekly rate is independent
 * of the monthly rate, never derived from it, so the unit has to travel
 * alongside the duration count rather than being inferred from it. */
export enum StorageDurationUnit {
  WEEK = 'week',
  MONTH = 'month',
}
