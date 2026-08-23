/**
 * Direct analogue of PropertyStatus. Only `draft` items are editable via
 * PATCH /admin/event-support/items/:id — the item's own status is changed
 * exclusively through PATCH /admin/event-support/items/:id/status, so a
 * published item can always be pulled back to draft to be edited again.
 * See EventItemsService for the enforced transition graph.
 */
export enum EventItemStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}
