/** Which rate a quote/booking line actually billed at. Lives per line, not
 * per cart — a cart can mix an eight-hour-eligible item with a day-only
 * one in the same window. See EventItemsService.quote() and
 * event-pricing.ts. */
export enum EventBillingMode {
  EIGHT_HOUR = 'eight_hour',
  DAILY = 'daily',
}
