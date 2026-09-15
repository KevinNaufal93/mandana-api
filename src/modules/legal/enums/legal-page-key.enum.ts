/**
 * The closed set of legal pages the admin can edit — one row per key in
 * `legal_pages`, same varchar-not-Postgres-enum reasoning as
 * SeoPageKey/RoleModulePermission.module (a page added later needs no
 * `ALTER TYPE` migration). Deliberately a fixed pair, not a free-form page
 * builder: the same "rows exist from day one, nothing can collide with a
 * real route" shape as SEO_PAGES — see the SEO plan, §11.5.
 */
export enum LegalPageKey {
  PRIVACY = 'privacy',
  TERMS = 'terms',
}

export interface LegalPageMeta {
  key: LegalPageKey;
  /** Admin-facing label (Indonesian). */
  label: string;
  /** Site-relative path this page renders at on the web app. */
  path: string;
}

export const LEGAL_PAGES: LegalPageMeta[] = [
  { key: LegalPageKey.PRIVACY, label: 'Kebijakan Privasi', path: '/privasi' },
  { key: LegalPageKey.TERMS, label: 'Syarat & Ketentuan', path: '/syarat' },
];

export const LEGAL_PAGE_KEYS = LEGAL_PAGES.map((p) => p.key);
