/** Pure CRM triage for a captured Moving Support lead — no side-effecting
 * state machine, since nothing is reserved (unlike StorageBookingStatus /
 * EventBookingStatus, which gate real inventory). */
export enum MovingLeadStatus {
  NEW = 'new',
  CONTACTED = 'contacted',
  CONVERTED = 'converted',
  LOST = 'lost',
}
