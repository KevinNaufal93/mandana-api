/**
 * 3 values only — deliberately no `on_hold`. A pending booking never
 * reserves a unit (see StorageBookingsService), so a hold state would never
 * be populated. See docs/storage-floor-plan-response.md §4.
 */
export enum StorageUnitStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  MAINTENANCE = 'maintenance',
}
