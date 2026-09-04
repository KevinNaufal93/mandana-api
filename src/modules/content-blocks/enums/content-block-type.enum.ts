/**
 * Discriminator for the unified content_blocks table — one table backs
 * every "simple ordered, admin-editable, optionally-imaged" section
 * (hero carousel slides, the service-strip cards, and now property detail
 * promo cards) instead of a separate table+module per section. See
 * ContentBlock entity for the per-type rules this enum drives (hero
 * requires an image; property_promo optionally carries a listing-type
 * scope; others don't).
 *
 * Adding a new kind (e.g. a future testimonials section) means adding a
 * value here plus, if it needs a field neither existing kind has, a new
 * nullable column — not a whole new module. If a kind ever needs several
 * fields nothing else uses, that's the signal it no longer belongs in this
 * table and should get its own again.
 *
 * Not every type is a homepage section: PROPERTY_PROMO is read by
 * `GET /properties/:slug` (see PropertiesService.findBySlug), not
 * `GET /homepage` — HomepageService only ever calls
 * `findActiveByType(HERO | SERVICE_CARD)`, so this type never leaks into
 * the homepage payload.
 */
export enum ContentBlockType {
  HERO = 'hero',
  SERVICE_CARD = 'service_card',
  PROPERTY_PROMO = 'property_promo',
}
