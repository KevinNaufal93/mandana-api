/**
 * Transitions: pending → confirmed | cancelled · confirmed → cancelled | completed.
 * Stock is taken on → confirmed and released on → cancelled | completed —
 * same rationale as StorageBookingStatus. See EventBookingsService.
 */
export enum EventBookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}
