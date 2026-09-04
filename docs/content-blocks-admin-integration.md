# Content Blocks — Web Admin Integration Guide

Audience: the admin panel — managing the homepage hero carousel, the
four service-strip cards, and property detail promo cards through one
unified CRUD surface. There is no public endpoint for this data. Hero
slides and service cards reach the public site through the cached
`GET /homepage` payload — see
[docs/homepage-integration.md](homepage-integration.md) for that public
shape (`hero.slides` / `services`), which is unaffected by anything
below. Promo cards (`type: "property_promo"`) reach the public site
through `promoCards` on `GET /properties/:slug` instead — see
[docs/web-property-detail-contract.md](web-property-detail-contract.md#promo-cards-)
for that shape.

## 1. Base URL, auth & response envelope

All routes live under `/api/v1/admin/content-blocks`, spec at
`/docs-json` (tagged `admin / content-blocks`). Every route requires a
Bearer token for a user with the `admin` role —
`Authorization: Bearer <token>` from `POST /api/v1/auth/login`; a
non-admin (`editor`) token gets **403**. Responses are a bare array
under `data` — this resource isn't paginated (a handful of slides/cards,
same reasoning as event-support categories): `{ "data": [...] }` on the
list, `{ "data": {...} }` on create/update.

## 2. What a content block is

Hero slides, service-strip cards, and property detail promo cards are
the same underlying record on the backend, distinguished by
`type: "hero" | "service_card" | "property_promo"`. That's an
implementation detail, not a UX mandate — build one admin screen or
several, whichever reads better; every write just needs the right
`type` in the body.

| Field | Hero slide | Service card | Promo card |
|---|---|---|---|
| `title` | Headline (required) | Card heading (required) | Card heading (required) |
| `subtitle` | Secondary line under the title | Card description | Body copy |
| `ctaText` | CTA button label | *unused — omit it* | CTA button label |
| `link` | CTA target, e.g. `/properties?listingType=sale` | Card href, e.g. `/moving` | CTA target — internal path, `https://`, or `wa.me/...` |
| `mediaAssetId` | **Required** — a hero with no image is invalid | Optional — the 4 seeded cards ship with none | Optional |
| `imageOnly` | Optional, default `false`. When `true`, the public homepage renders just the slide's image and skips the title/subtitle/CTA text overlay — the artwork already has that copy baked in. Requires `mediaAssetId` (already required for hero, so this only matters if you're also clearing the image). | Optional, default `false`. When `true`, the public homepage renders just the card's image and skips the title/description text overlay. Requires `mediaAssetId`. | Optional, default `false`. Same rule — requires `mediaAssetId`. |
| `listingTypeScope` | *unused — 400 if set* | *unused — 400 if set* | Optional — see §4b |

`sortOrder` and `isActive` apply to all three — see §6.

## 3. Endpoints

`GET /?type=` · `POST /` · `PATCH /:id` · `DELETE /:id`

```jsonc
// GET /api/v1/admin/content-blocks?type=hero →
{ "data": [
  { "id": "uuid", "type": "hero", "title": "Hunian Premium di Jakarta",
    "subtitle": "Temukan rumah impian Anda", "ctaText": "Lihat Properti",
    "link": "/properties?listingType=sale", "mediaAssetId": "uuid",
    "image": { "url": "...", "srcset": "...", "srcsetAvif": "...",
               "placeholder": "data:image/webp;base64,...", "alt": null,
               "width": 1920, "height": 1080 },
    "sortOrder": 0, "isActive": true, "imageOnly": false,
    "listingTypeScope": null,
    "createdAt": "...", "updatedAt": "..." } ] }
```

```jsonc
// GET /api/v1/admin/content-blocks?type=property_promo →
{ "data": [
  { "id": "uuid", "type": "property_promo", "title": "Jasa Inspeksi Properti",
    "subtitle": "Pastikan kondisi bangunan sebelum Anda membeli.",
    "ctaText": "Jadwalkan Inspeksi", "link": "https://wa.me/628123456789",
    "mediaAssetId": "uuid",
    "image": { "url": "...", "srcset": "...", "srcsetAvif": "",
               "placeholder": "data:image/webp;base64,...", "alt": null,
               "width": 800, "height": 450 },
    "sortOrder": 0, "isActive": true, "imageOnly": false,
    "listingTypeScope": ["rent"],
    "createdAt": "...", "updatedAt": "..." } ] }
```

Omit `?type` to list every block together — ordered by `type`, then
`sortOrder`, then `createdAt`, so an unfiltered table renders all hero
rows before all service-card rows. `sortOrder` is only meaningful
**within** a type, not as one global sequence. There's no `isActive`
filter — this endpoint always returns both active and inactive rows;
render the toggle state yourself.

```jsonc
// POST /api/v1/admin/content-blocks →
{ "type": "service_card", "title": "Moving Support",
  "subtitle": "Layanan pindahan aman, cepat, dan terpercaya.",
  "link": "/moving", "sortOrder": 4 }
// ← 201, same shape as the GET item above ("image": null — no icon attached yet)
```

`PATCH /:id` accepts any subset of the same fields — send only what
changed. Pass `"mediaAssetId": null` explicitly to clear a service
card's icon (rejected with 400 on a hero — see §4). `type` itself is
patchable, but converting a card into a hero (or back) is rarely what
you actually want — the hero-requires-image rule is checked against the
row's *resulting* state, whichever fields the request included.

`DELETE /:id` → **204**. This removes the content-block row only — the
underlying media asset is untouched and stays in the library (§7).

## 4. The hero-requires-image rule

`type: "hero"` with no `mediaAssetId` is rejected — on `POST`, on any
`PATCH` that would leave a hero without one (explicitly sending
`mediaAssetId: null`, or `PATCH`ing `type` to `"hero"` on a row with no
image), and one layer deeper by a database constraint that holds even if
every application-level check were somehow bypassed:

```jsonc
// 400 →
{ "statusCode": 400, "timestamp": "...", "path": "/api/v1/admin/content-blocks",
  "error": { "message": "A hero content block requires an image (mediaAssetId).",
             "error": "Bad Request", "statusCode": 400 } }
```

To replace a hero's image, include the new `mediaAssetId` in the same
`PATCH` that would otherwise remove the old one — don't null it out
first.

## 4b. Promo card listing-type scope

`type: "property_promo"` cards optionally carry `listingTypeScope` — an
array restricting the card to specific listing types (`"sale"`,
`"rent"`, `"new"`). Omit it, send `null`, or send `[]` for the common
case: a generic card that should appear on every listing type. Set it
to e.g. `["rent"]` to show a card only on Disewa listings, or
`["sale", "new"]` to show it on both Dijual and Properti Baru but not
Disewa.

`listingTypeScope` is meaningless on `hero`/`service_card` — setting it
(to a non-empty array) on anything but `type: "property_promo"` is
**400**, checked against the row's *resulting* state the same way §4's
hero rule is: both on `POST`, and on a `PATCH` that would leave a
non-`property_promo` row with a scope (either by patching a scoped
promo card's `type` away, or by setting `listingTypeScope` on a
same-request `PATCH` that also changes `type`). To convert a scoped
promo card into another type, clear the scope in the same request:
`PATCH { "type": "hero", "listingTypeScope": null, "mediaAssetId": "..." }`.

```jsonc
// 400 →
{ "statusCode": 400, "timestamp": "...", "path": "/api/v1/admin/content-blocks",
  "error": { "message": "listingTypeScope is only valid on a property_promo content block.",
             "error": "Bad Request", "statusCode": 400 } }
```

Edits to `listingTypeScope` (like every other content-block write) take
effect on `GET /properties/:slug` immediately — property detail
responses aren't cached, unlike the homepage payload in §6.

## 5. Uploading and attaching images

Content blocks don't accept a file directly. Upload first, then
reference the id it returns:

```
POST /api/v1/admin/media/upload   (multipart: file, purpose, alt?)
  → { "data": { "id": "uuid", ... } }
POST /api/v1/admin/content-blocks
  → { ..., "mediaAssetId": "<that id>" }
```

Use `purpose: "hero"` for slides, `"cover"` for service-card
illustrations (`"icon"` is for small transparent glyphs used elsewhere
in the API, not here). **The upload response's `variants` are raw
storage keys, not URLs** — don't try to render it directly; either use
the picker's own local preview for the just-uploaded file (same as
`components/media/image-picker.tsx` already does), or re-fetch through
one of the endpoints in this doc, which all return a built `image`.

Every content-block response (list, create, update) carries a
ready-to-render `image` object once `mediaAssetId` is set — same shape
as everywhere else in this API:

- `srcsetAvif` is `""` for `cover`-purpose images (service cards) — AVIF
  is only generated for `hero`-purpose uploads. Render a `<picture>`
  avif `<source>` only when it's non-empty.
- `placeholder` is a small base64 `data:` URI — paint it immediately and
  cross-fade the real image in once it loads (blur-up). Can be `null`
  on an asset uploaded before this field existed.
- `alt` comes from the media asset itself (set once, at upload time via
  `UploadMediaDto.alt`) — there's no separate per-content-block alt text
  field, so re-attaching the same image to a different slide reuses the
  same alt.
- `image` is `null` only for a service card with no icon attached yet.

## 6. Ordering and visibility

No bulk-reorder endpoint exists yet — after a drag-and-drop reorder,
`PATCH` every row whose `sortOrder` actually changed. Values don't need
to be contiguous or unique; ties break by creation order.

`isActive: false` hides a hero/service-card block from the public
`/homepage` payload (`HomepageService` only reads active rows), or a
promo card from `promoCards` on `GET /properties/:slug`, without
deleting it or detaching its image — use it to unpublish a slide/card
temporarily instead of deleting and re-creating it later.

## 7. Media library cleanup

Deleting a content block never deletes its image — `media_assets` rows
are independent and can be attached to more than one thing. To find
images no longer referenced by anything (including content blocks), use
the admin media library:

```
GET /api/v1/admin/media?unused=true&withUsage=true   → candidates for cleanup
GET /api/v1/admin/media?purpose=hero                  → browse/pick by purpose
DELETE /api/v1/admin/media/:id                        → 409 if still referenced
```

Deleting a media asset that a content block (or any other owning record)
still references returns **409** — detach it first.

## 8. Errors

Same envelope as the rest of the API:

```jsonc
{ "statusCode": 409, "timestamp": "...", "path": "...",
  "error": { "message": "...", "error": "Conflict", "statusCode": 409 } }
```

Expect **404** on any `:id` that doesn't exist, **400** on validation
failures (missing `title`, invalid `type`, malformed UUID, §4's hero
rule, or §4b's `listingTypeScope`-only-on-`property_promo` rule), and
**403** on a non-admin token.
