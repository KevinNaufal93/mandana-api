# Page Images — Web Admin Integration Guide

Audience: the admin panel — managing fixed image slots on static pages
that aren't backed by a repeatable content-block list (today: the three
photos on `/tentang-kami`). Public read is `GET /page-images` — see §5.

## 1. Base URL, auth & response envelope

Admin routes live under `/api/v1/admin/page-images`, spec at `/docs-json`
(tagged `admin / page-images`). Every route requires a Bearer token for a
user with the `admin` role, or a non-admin role granted the
`content-media` module (see §2 for why that one, not `seo`). Responses
are a bare array under `data` on the list, `{ "data": {...} }` on update
— same envelope shape as content-blocks.

## 2. What this is, and why it isn't a content block

A `page_images` row is one fixed image slot — `slotKey` + an optional
`mediaAssetId`. Unlike `content_blocks`, there is no create/delete, no
`sortOrder`, no `isActive`, and no title/subtitle/CTA fields: every slot
always exists (auto-seeded), can't be reordered or removed, and carries
nothing but an image. Gated by `AccessModule.CONTENT_MEDIA` (not a
dedicated module) — these slots are managed from the same admin screen
as the homepage's hero/service content blocks.

The closed set of slots today:

| `slotKey` | Page | What it is |
|---|---|---|
| `about_hero` | `/tentang-kami` | The full-bleed banner behind the page's `<h1>` |
| `about_story` | `/tentang-kami` | The photo beside "Satu Platform untuk Setiap Kebutuhan Properti" |
| `about_help_cta` | `/tentang-kami` | The photo behind the "Apa yang bisa kami bantu?" glass panel |

Adding a slot later is a new `PageImageSlot` enum member + a migration
row insert — no schema-breaking change, since `slot_key` is `varchar`,
not a Postgres enum (unlike `content_block_type`, which needs the
type-widening migration documented in
`1788000000000-AddPropertyPromoContentBlocks.ts` for the same kind of
addition).

## 3. Endpoints

`GET /` · `PATCH /:slotKey`

```jsonc
// GET /api/v1/admin/page-images →
{ "data": [
  { "slotKey": "about_hero", "image": null },
  { "slotKey": "about_story",
    "image": { "url": "...", "srcset": "...", "srcsetAvif": "...",
               "placeholder": "data:image/webp;base64,...", "alt": null,
               "width": 1200, "height": 800 } },
  { "slotKey": "about_help_cta", "image": null } ] }
```

Always returns all three rows, in the order above — there's no filter,
no pagination, and no way to get a partial list.

```jsonc
// PATCH /api/v1/admin/page-images/about_hero →
{ "mediaAssetId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

`mediaAssetId` is the only field. Send a real UUID to set the image;
send `null` to clear the slot back to the web app's own hardcoded static
photo for that slot; omit the field entirely to leave it untouched (a
no-op PATCH, harmless but pointless — the admin panel's own form skips
the call for a slot nobody touched rather than sending an empty body).
An unknown `slotKey` in the URL is a **400** — `ParseEnumPipe` rejects it
before the controller method runs, same as `PATCH /admin/seo/pages/:pageKey`.

## 4. Upload, then attach

Same two-step flow as every other image field in this API: upload first
via `POST /admin/media/upload` (multipart, `purpose: "hero"` for
`about_hero` — it's the widest/most prominent slot and benefits from the
AVIF srcset that purpose generates; `purpose: "cover"` for the other
two), then PATCH the returned asset id into the slot. There is no
combined "upload and attach in one request" endpoint. Deleting a slot's
image (`mediaAssetId: null`) does **not** delete the underlying media
asset — it stays in the media library, same as content-blocks (§7 of
that guide).

## 5. Public read

`GET /page-images` (no auth, no `/admin` prefix) returns the same shape
as the admin list endpoint, Redis-cached for 10 minutes and busted on
every admin write — see `mandana-web/docs/seo/developer-guide.md` §5 for
how this fits into the wider caching chain, and §7 for why the cache
stores the **mapped** payload rather than a raw entity (a real bug —
`Date` surviving a Redis round-trip — already shipped once from getting
this wrong on a different module; this one was built to avoid repeating
it). A slot with `image: null` is not an error on the web side — the
page renders its own hardcoded fallback photo for that slot instead.

## 6. Errors

| Status | Cause |
|---|---|
| 400 | `mediaAssetId` isn't a valid UUID (and isn't `null`); or `slotKey` in the URL isn't one of the three known keys (`ParseEnumPipe` rejects it before the handler runs — never a 404) |
| 403 | Token's role/modules don't include `content-media` |

No documented 409/conflict case — unlike content-blocks (which has none
either today, per that guide's own note).
