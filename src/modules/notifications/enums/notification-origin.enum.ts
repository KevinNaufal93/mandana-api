/**
 * Distinguishes a booking a customer submitted directly from one an admin
 * recorded by hand (Event Support's WhatsApp-call path — see
 * EventBookingSource). Both raise a notification; this is only the chip the
 * admin panel renders, so a reader can tell at a glance which is which.
 */
export enum NotificationOrigin {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
}
