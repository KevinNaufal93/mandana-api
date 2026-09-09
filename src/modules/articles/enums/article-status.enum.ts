export enum ArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * Every public query filters to this set. Unlike properties (which keeps
 * SOLD/RENTED publicly visible alongside PUBLISHED), there's no "published
 * but different state" concept for an article, so this only ever equals
 * `[PUBLISHED]` — kept as an array (not a bare equality check) purely so a
 * future status doesn't require touching every query site, the same
 * defensive posture as PUBLIC_PROPERTY_STATUSES.
 */
export const PUBLIC_ARTICLE_STATUSES = [ArticleStatus.PUBLISHED] as const;
