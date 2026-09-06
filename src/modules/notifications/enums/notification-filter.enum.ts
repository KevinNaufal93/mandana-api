/** `GET /admin/notifications?filter=` — narrows the feed to only what still
 * needs action. Default is `all` so the page can also serve as a full
 * history, not just a to-do list. */
export enum NotificationFilter {
  ALL = 'all',
  UNRESOLVED = 'unresolved',
}
