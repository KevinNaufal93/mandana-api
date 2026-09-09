export enum PropertyStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  /** Terjual — sold, but deliberately still publicly listed (see PUBLIC_PROPERTY_STATUSES). */
  SOLD = 'sold',
  /** Tersewa — rented out, but deliberately still publicly listed (see PUBLIC_PROPERTY_STATUSES). */
  RENTED = 'rented',
}

/**
 * The statuses a public (non-admin) reader may see. Every public query
 * filters on this set, never on PUBLISHED alone — a sold/rented property
 * stays in search, listings, similar-properties and homepage
 * recommendations, correctly labelled, rather than disappearing. DRAFT and
 * ARCHIVED are never included here.
 */
export const PUBLIC_PROPERTY_STATUSES = [
  PropertyStatus.PUBLISHED,
  PropertyStatus.SOLD,
  PropertyStatus.RENTED,
] as const;
