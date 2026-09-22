/**
 * The closed set of fixed image slots the admin Content Media section can
 * edit — one row per key in `page_images`. `varchar` on the entity column,
 * not a Postgres enum, for the same reason `PageSeo.pageKey` is: adding a
 * slot later must be an `INSERT`, never an `ALTER TYPE` migration. This
 * deliberately avoids the shape `ContentBlockType` uses (a real Postgres
 * enum), whose only precedent for adding a value needed a drop-CHECK →
 * rename-type → recreate → `ALTER COLUMN ... USING` → re-add-CHECK
 * migration — see `1788000000000-AddPropertyPromoContentBlocks.ts`.
 */
export enum PageImageSlot {
  ABOUT_HERO = 'about_hero',
  ABOUT_STORY = 'about_story',
  ABOUT_HELP_CTA = 'about_help_cta',
  HOME_PROPERTY_VALUATION = 'home_property_valuation',
  HOME_HELP_CTA = 'home_help_cta',
}

export interface PageImageSlotMeta {
  key: PageImageSlot;
  /** Which page this slot belongs to — purely organizational (groups
   *  slots under one admin tab); the public site doesn't read this. */
  pageKey: string;
  /** Admin-facing label (Indonesian). */
  label: string;
  /** Site-relative path, for reference only. */
  path: string;
  /** Whether this slot accepts a second, mobile-only image
   *  (`mobile_media_asset_id`) — only the two full-bleed fixed-height
   *  bands (`about_hero`, `home_property_valuation`) need one: they're
   *  locked to a fixed desktop shape and shown whole via object-contain,
   *  so below ~1024px a wide banner would letterbox rather than fill the
   *  (taller, narrower) band without its own composition. The other three
   *  slots are fixed aspect-ratio boxes that crop by design at every
   *  width, so one image already covers every screen. Defaults to false
   *  when omitted — see `PageImagesService.updateSlot()` for the
   *  enforcement (`page_images.slot_key` is `varchar`, not an enum, so
   *  this flag — not a DB CHECK — is the single source of truth). */
  supportsMobileImage?: boolean;
}

export const PAGE_IMAGE_SLOTS: PageImageSlotMeta[] = [
  {
    key: PageImageSlot.ABOUT_HERO,
    pageKey: 'about',
    label: 'Gambar hero',
    path: '/tentang-kami',
    supportsMobileImage: true,
  },
  {
    key: PageImageSlot.ABOUT_STORY,
    pageKey: 'about',
    label: 'Gambar "Satu Platform untuk Setiap Kebutuhan Properti"',
    path: '/tentang-kami',
  },
  {
    key: PageImageSlot.ABOUT_HELP_CTA,
    pageKey: 'about',
    label: 'Gambar "Apa yang bisa kami bantu?"',
    path: '/tentang-kami',
  },
  {
    key: PageImageSlot.HOME_PROPERTY_VALUATION,
    pageKey: 'home',
    label: 'Gambar "Ingin tahu berapa nilai properti Anda?"',
    path: '/',
    supportsMobileImage: true,
  },
  {
    key: PageImageSlot.HOME_HELP_CTA,
    pageKey: 'home',
    label: 'Gambar "Apa yang bisa kami bantu?"',
    path: '/',
  },
];

/** Looked up by slotKey in PageImagesService — see this interface's own
 *  supportsMobileImage doc for why an application-level lookup, not a DB
 *  CHECK, is the enforcement point. */
export function slotSupportsMobileImage(key: PageImageSlot): boolean {
  return (
    PAGE_IMAGE_SLOTS.find((s) => s.key === key)?.supportsMobileImage ?? false
  );
}

export const PAGE_IMAGE_SLOT_KEYS = PAGE_IMAGE_SLOTS.map((s) => s.key);
