/**
 * Which of the three booking modules a notification came from. Deliberately
 * not an FK-backed discriminator — `AdminNotification.sourceId` points at
 * one of three different tables, so the pairing is enforced in application
 * code (NotificationsService), not the database.
 */
export enum NotificationSourceModule {
  MOVING = 'moving',
  STORAGE = 'storage',
  EVENT_SUPPORT = 'event_support',
}
