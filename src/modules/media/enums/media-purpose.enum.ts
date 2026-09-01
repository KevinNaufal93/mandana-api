/**
 * Determines the width ladder and formats generated at upload time (see
 * `ImageProcessorService`'s `PURPOSE_SPECS`), and lets the admin media
 * library (`GET /admin/media`) filter by intent. Persisted on `MediaAsset`
 * so the library can be browsed without inferring intent from variant
 * widths after the fact.
 */
export enum MediaPurpose {
  HERO = 'hero',
  COVER = 'cover',
  ICON = 'icon',
}
