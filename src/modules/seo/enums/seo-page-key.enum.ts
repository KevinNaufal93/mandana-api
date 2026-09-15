/**
 * The closed set of fixed pages the admin SEO section can edit — one row
 * per key in `page_seo`. `varchar` on the entity column, not a Postgres
 * enum, for the same reason RoleModulePermission.module is varchar: adding
 * a page later must not need an `ALTER TYPE` migration.
 */
export enum SeoPageKey {
  HOME = 'home',
  PROPERTIES = 'properties',
  ABOUT = 'about',
  MOVING = 'moving',
  STORAGE = 'storage',
  STORAGE_BOOKING = 'storage_booking',
  EVENT = 'event',
  ARTICLES = 'articles',
}

export interface SeoPageMeta {
  key: SeoPageKey;
  /** Admin-facing label (Indonesian, matches the admin panel's own module names). */
  label: string;
  /** Site-relative path — what the web app's buildPageMetadata() matches against. */
  path: string;
  /** false = SeoService rejects `noIndex: true` for this page. Only `home`
   *  is protected — hiding the homepage from Google by accident is the one
   *  mistake this API refuses to let an admin make with one click. */
  canHide: boolean;
}

export const SEO_PAGES: SeoPageMeta[] = [
  { key: SeoPageKey.HOME, label: 'Beranda', path: '/', canHide: false },
  {
    key: SeoPageKey.PROPERTIES,
    label: 'Semua Properti',
    path: '/properties',
    canHide: true,
  },
  {
    key: SeoPageKey.ABOUT,
    label: 'Tentang Kami',
    path: '/tentang-kami',
    canHide: true,
  },
  {
    key: SeoPageKey.MOVING,
    label: 'Mandana Move',
    path: '/layanan/moving',
    canHide: true,
  },
  {
    key: SeoPageKey.STORAGE,
    label: 'Mandana Space',
    path: '/layanan/storage',
    canHide: true,
  },
  {
    key: SeoPageKey.STORAGE_BOOKING,
    label: 'Booking Smart Storage',
    path: '/layanan/storage/booking',
    canHide: true,
  },
  {
    key: SeoPageKey.EVENT,
    label: 'Mandana Living',
    path: '/layanan/event',
    canHide: true,
  },
  {
    key: SeoPageKey.ARTICLES,
    label: 'Artikel',
    path: '/artikel',
    canHide: true,
  },
];

export const SEO_PAGE_KEYS = SEO_PAGES.map((p) => p.key);
