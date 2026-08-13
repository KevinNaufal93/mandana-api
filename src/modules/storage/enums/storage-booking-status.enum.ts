/**
 * Transitions: pending → confirmed | rejected · confirmed → cancelled | completed.
 * Occupancy is taken on → confirmed and released on → cancelled | completed.
 * See StorageBookingsService for the enforcement of this graph.
 */
export enum StorageBookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}
