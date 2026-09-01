/**
 * Discriminator for the unified content_blocks table — one table backs
 * every "simple ordered, admin-editable, optionally-imaged" homepage
 * section (hero carousel slides, the service-strip cards) instead of a
 * separate table+module per section. See ContentBlock entity for the
 * per-type rules this enum drives (hero requires an image; others don't).
 *
 * Adding a new kind (e.g. a future testimonials section) means adding a
 * value here plus, if it needs a field neither existing kind has, a new
 * nullable column — not a whole new module. If a kind ever needs several
 * fields nothing else uses, that's the signal it no longer belongs in this
 * table and should get its own again.
 */
export enum ContentBlockType {
  HERO = 'hero',
  SERVICE_CARD = 'service_card',
}
