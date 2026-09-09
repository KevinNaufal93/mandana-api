# Articles ("Artikel") — Web & Web Admin Integration Guide

Audience: `mandana-web` (public reader) and `mandana-web-admin` (create/edit/
delete). Originally proposed in `mandana-web`'s
`docs/artikel-api-contract.md` (public contract) and
`docs/artikel-backend-implementation.md` (build plan) — this doc is what
actually shipped, and is the one to keep in sync going forward.

Admin-authored SEO content (buying guides, KPR/mortgage explainers, market
news) surfaced at `mandana-web`'s `/artikel` route, to pull organic search
traffic toward `/properties`.

## 1. Base URL, auth & response envelope

Public routes live under `/api/v1/articles` and `/api/v1/article-categories`
— no token required. Admin routes live under `/api/v1/admin/articles` and
`/api/v1/admin/article-categories` — Bearer token required
(`Authorization: Bearer <token>` from `POST /api/v1/auth/login`); an
`editor` token works once the `articles` RBAC module is granted to that role
(seeded on by default — see §5), an `admin` token always works. Spec at
`/docs-json`, tagged `articles`, `article-categories`, `admin / articles`,
`admin / article-categories`.

Paginated list responses are `{ data: [...], meta: { total, page, limit,
totalPages } }`. Single-resource responses are `{ data: {...} }`.

## 2. Public endpoints

### `GET /articles`

Newest-first by `publishedAt`. Only `status: "published"` rows. Query
params: `page` (default 1), `limit` (default **9** — note this differs from
the API's usual default of 12, to match `mandana-web`'s 3×3 grid),
`categorySlug` (optional).

### `GET /articles/{slug}`

404 if the slug doesn't exist **or** isn't published — same "not found, not
forbidden" behavior as `GET /properties/{slug}` for a draft/archived
property. Response includes the render-ready `bodyHtml`.

### `GET /articles/{slug}/related`

Query param `limit` (default 3, max 12). Same-category first (newest),
falling back to other published articles if the category runs out. Never
404s — an unknown/unpublished slug returns `{ "data": [] }`, so a related-
articles widget never takes the page down.

### `GET /article-categories`

Unpaginated. Only categories with ≥1 published article — an empty category
never appears as a dead-end filter chip.

```jsonc
// GET /api/v1/articles?limit=2 →
{
  "data": [
    {
      "id": "uuid", "slug": "panduan-membeli-rumah-pertama",
      "title": "Panduan Membeli Rumah Pertama",
      "excerpt": "Semua yang perlu Anda tahu sebelum membeli rumah pertama.",
      "coverImage": { "url": "...", "srcset": "...", "srcsetAvif": "...",
                      "placeholder": "data:image/webp;base64,...",
                      "alt": null, "width": 1920, "height": 1080 },
      "category": { "id": "uuid", "slug": "panduan-beli", "name": "Panduan Beli" },
      "author": { "id": "uuid", "name": "Jane Doe", "role": "Content Editor",
                  "avatar": { "url": "...", "...": "..." } },
      "publishedAt": "2026-09-01T00:00:00.000Z",
      "readingMinutes": 4
    }
  ],
  "meta": { "total": 12, "page": 1, "limit": 2, "totalPages": 6 }
}
```

`GET /articles/{slug}` returns the same shape plus `bodyHtml`, `updatedAt`
(null until the article is edited *after* it was published — not the same
as the row's raw `updatedAt` timestamp), `metaTitle`, `metaDescription`.

## 3. Admin endpoints

`GET /` · `GET /:id` · `POST /` · `PATCH /:id` · `DELETE /:id`, under both
`/admin/articles` and `/admin/article-categories`.

- `GET /admin/articles` — every status, filterable by `status`,
  `categoryId`, `search` (title/excerpt).
- `GET /admin/article-categories` — **every** category regardless of
  whether it has a published article, unlike the public endpoint. This is
  the one to call for the create/edit form's category dropdown — using the
  public endpoint here would make a brand-new category impossible to select
  until an article already used it.
- `POST /admin/articles` — `bodyHtml` is **required** (rejected if omitted
  or if it sanitizes down to nothing, e.g. a `<script>`-only payload).
  `categoryId` is required. `authorId` defaults to the creating admin.
  `slug` is optional, auto-generated from `title` when omitted. `status`
  defaults to `draft`.
- `PATCH /admin/articles/:id` — same fields, all optional. Two rules to
  know:
  - **Changing the slug of a published article is rejected (409).**
    Unpublish it first (set `status: "archived"` or `"draft"`), change the
    slug, republish. This protects inbound links and search ranking.
  - **`publishedAt` is set once**, on the first `draft`/`archived` →
    `published` transition, and never overwritten by a later
    unpublish/republish cycle — so an article's "Published on" date stays
    stable even if it's temporarily archived and republished.
- `DELETE /admin/article-categories/:id` — rejected with **409** if any
  article still references it (reassign or delete those articles first).

## 4. Rich text body

`bodyHtml` goes through the same sanitizer as `properties.description` etc.
— see [rich-text-descriptions.md](rich-text-descriptions.md). Allow-listed
tags now include `figure`/`figcaption` (added for this module) for image
captions. Images must be uploaded via `POST /admin/media` and referenced by
URL — `data:` URIs are stripped.

## 5. RBAC

New module key: `articles` (`AccessModule.ARTICLES`, label "Article
Management"). Grantable to `editor`; seeded on by default for existing
editor roles. `admin` always has access. Grants are cached for up to 5
minutes — an editor granted/revoked at `/admin/rbac` may not see the change
reflected immediately.

## 6. Cover images

Cover images use `MediaPurpose.HERO` (768/1280/1920px, AVIF included) —
the same purpose the homepage hero carousel uses — not a dedicated
"article cover" purpose. Upload via `POST /admin/media` with
`purpose: "hero"` and pass the returned id as `coverMediaAssetId`.

## 7. Rollout

Mirrors `artikel-api-contract.md` §5's ordering: implement the `"api"`
branches in `mandana-web`'s `lib/api/articles.ts`, verify locally with
`NEXT_PUBLIC_ARTICLES_SOURCE=api`, run `npm run gen:api`, then flip the env
var in the deployed environment. `mandana-web-admin` needs the `articles`
key added to `lib/rbac/modules.ts` and a sidebar entry in
`lib/ui/nav-items.ts` before its screens can be gated correctly.
