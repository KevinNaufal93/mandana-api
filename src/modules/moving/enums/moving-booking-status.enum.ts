/**
 * Transitions: pending -> confirmed | rejected; confirmed -> cancelled |
 * completed. Mirrors StorageBookingStatus's graph exactly, even though
 * Moving reserves no inventory — see MovingBookingsService for why
 * confirm/reject/cancel/complete are pure status writes with no locking.
 */
export enum MovingBookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}
