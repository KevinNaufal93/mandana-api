/**
 * Groups a MovingAddon for display and drives one behavioral difference:
 * `TOLL` rows are never client-selectable — they're applied automatically
 * from `QuoteMovingDto.tollRoute` by MovingService, never listed as a
 * checkbox. See moving-pricing.ts and docs/moving-integration.md.
 */
export enum MovingAddonKind {
  HELPER = 'helper',
  PACKAGING = 'packaging',
  WAITING = 'waiting',
  INSURANCE = 'insurance',
  TOLL = 'toll',
  OTHER = 'other',
}
