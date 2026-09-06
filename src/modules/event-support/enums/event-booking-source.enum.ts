/** Distinguishes a booking a customer submitted directly (`public`, via
 * POST /event-support/bookings) from one an admin recorded after a WhatsApp
 * conversation (`admin`). Exists because `createdById` alone is ambiguous —
 * it is null for BOTH a public submission and an admin booking whose
 * creating user account was later deleted (the FK is ON DELETE SET NULL). */
export enum EventBookingSource {
  PUBLIC = 'public',
  ADMIN = 'admin',
}
