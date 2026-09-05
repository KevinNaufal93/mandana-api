# Web Admin — Manageable Asset Integration Guide

Audience: `mandana-web-admin`. This is the **general pattern** every
admin screen that manages an image-bearing catalog resource follows in
this API — today that's the Content Media Management screen (hero
carousel + service strip); tomorrow it might be truck classes, storage
unit types, or event items getting their own admin screen. Learn the
pattern once here; for the exhaustive field-by-field contract of a
specific module, see its own doc (§9 has the current list).

## 0. Wiring the screen in front of you right now

The Content Media Management screen maps directly onto
`/api/v1/admin/content-blocks`:

| UI | API |
|---|---|
| "Hero Carousel" tab | `GET /admin/content-blocks?type=hero` |
| "Service Strip" tab | `GET /admin/content-blocks?type=service_card` |
| "Tambah hero carousel" | `POST /admin/content-blocks` with `type: "hero"` |
| Edit a card/slide | `PATCH /admin/content-blocks/:id` |
| Remove | `DELETE /admin/content-blocks/:id` |

Wire a "Promo Cards" screen (property detail sidebar cards) onto the
same endpoint the same way, whenever that tab gets built:

| UI | API |
|---|---|
| "Promo Cards" tab | `GET /admin/content-blocks?type=property_promo` |
| Add a promo card | `POST /admin/content-blocks` with `type: "property_promo"` |

Full request/response bodies, the hero-requires-image rule, the
promo-card-only `listingTypeScope` field, and the upload flow are in
[docs/content-blocks-admin-integration.md](content-blocks-admin-integration.md)
— don't duplicate that here, just point the screen at it.

**One real correction, not just a wiring gap:** "Perubahan diterapkan ke
situs" / "Terapkan ke situs" implies a staged draft that gets manually
published. That doesn't exist on this API — see §5. Every `POST`/
`PATCH`/`DELETE` is live on the public site by the time the response
comes back; there is nothing for that button to call. Either remove it,
or repurpose it as a client-side "refresh my preview" no-op — don't wire
it to a real request, there isn't one to make.

The empty state ("Belum ada hero carousel...") is otherwise exactly
correct behavior for an environment with zero rows — it's not a bug in
the screen, just confirm which Postgres this environment points at
before assuming the API is broken.

## 1. The shape every module shares

- **Auth**: Bearer JWT from `POST /api/v1/auth/login`, role `admin`.
  Every route below 403s for a non-admin (`editor`) token.
- **Envelope**: `{ "data": ... }`, or `{ "data": [...], "meta": {...} }`
  on the handful of endpoints that paginate (large collections like
  event items or properties; most admin-editable catalogs — content
  blocks, truck classes, storage unit types — are small enough to list
  unpaginated).
- **Errors**: always `{ statusCode, timestamp, path, error: { message,
  error, statusCode } }`. **400** validation, **403** wrong role, **404**
  unknown `:id`, **409** a lifecycle/delete guard was violated (see §6).
- **Roles decorator**: class-level `@Roles(UserRole.ADMIN)` on every
  admin controller — meaning if you ever see a 403 on a route that looks
  like it should be public, it's not a bug, that resource genuinely has
  no public read path (content blocks included — see §8).

## 2. Attaching an image: upload, then reference the id

Every image-bearing module follows the same two-step write, never a
direct file field on the resource itself:

```
1. POST /api/v1/admin/media/upload   (multipart: file, purpose, alt?)
     → { "data": { "id": "uuid", "variants": {...raw storage keys...} } }
2. POST or PATCH the owning resource, passing that id
     → e.g. { "mediaAssetId": "<id from step 1>" }
```

Two things that are easy to get wrong here, on every module, not just
content blocks:

- **The upload response is not renderable.** Its `variants` are raw
  storage keys (`media/<id>/400.webp`), not URLs. Use the file you just
  picked (a local `URL.createObjectURL` blob, as
  `components/media/image-picker.tsx` already does) for the picker's own
  preview; don't try to render the upload response directly.
- **The request field name is not always literally `mediaAssetId`.**
  It's always suffixed `...MediaAssetId`, sometimes with a role prefix
  when the entity needs to disambiguate — `mediaAssetId` on content
  blocks, truck classes, storage unit types, event categories/items;
  `coverMediaAssetId` on collections. Check the specific create/update
  DTO for the module you're integrating rather than assuming the bare
  name.

`purpose` (sent at upload time, not on the owning resource) determines
the width ladder and formats generated, and is worth getting right
per-image rather than defaulting to one value everywhere:

| `purpose` | Use for | Notes |
|---|---|---|
| `hero` | Full-bleed hero/banner imagery | Only one that generates AVIF |
| `cover` | Standard content images, illustrations, icons-as-photos | The common case — default here if unsure |
| `icon` | Small transparent glyphs | Only `purpose` that accepts SVG (rasterized on upload, never served raw) |

Properties are the one deliberate exception to all of this — a property
has an ordered *array* of images with its own staging/reorder system
(`lib/properties/image-staging.ts`), not a single `mediaAssetId`. Don't
generalize this guide's single-image pattern onto that screen.

## 3. Rendering an image: one shared component, several field names

Wherever a response carries an image, the *value* is always the same
shape — only the *key* it's mounted under changes by domain (`image` on
content blocks/event categories/items, `cover` on collections and
recommendations, `icon` where a module calls it that):

```ts
type MediaImageDto = {
  url: string;          // fallback <img src> — png or jpeg, alpha-aware
  srcset: string;        // webp, e.g. "https://.../400.webp 400w, .../800.webp 800w"
  srcsetAvif: string;    // "" when this asset has no AVIF variant (see purpose table above)
  placeholder: string | null; // small base64 data: URI, or null if not backfilled yet
  alt: string | null;
  width: number;
  height: number;
};
```

Build **one** component around this shape and reuse it everywhere an
`image`/`cover`/`icon` field shows up:

```tsx
function ResponsiveImage({ image, className }: { image: MediaImageDto | null; className?: string }) {
  if (!image) return null; // e.g. a service card with no icon attached yet
  return (
    <picture>
      {image.srcsetAvif && <source type="image/avif" srcSet={image.srcsetAvif} />}
      <source type="image/webp" srcSet={image.srcset} />
      <img
        src={image.url}
        alt={image.alt ?? ''}
        width={image.width}
        height={image.height}
        className={className}
        style={image.placeholder ? { backgroundImage: `url(${image.placeholder})`, backgroundSize: 'cover' } : undefined}
      />
    </picture>
  );
}
```

`image` (however it's named) can be `null` — every module that allows
an optional image (service cards, collections without a cover yet)
returns `null` rather than omitting the key. Always guard for it; don't
assume every row has a picture.

## 4. Ordering and visibility — check per module, don't assume

`sortOrder` (int, ties break by creation order, values don't need to be
contiguous) and a manual reorder-by-PATCH-each-changed-row flow (no bulk
reorder endpoint exists anywhere yet) is consistent everywhere it
appears.

**Visibility is not consistent — this is the one thing to actually
verify per module before building a toggle UI:**

- Content blocks, event categories: a plain `isActive: boolean`. Toggle
  it with a normal `PATCH`; the row keeps existing, just stops appearing
  on the public side.
- Event items (and likely anything with real inventory/booking
  history behind it): a full `draft → published → archived` lifecycle
  with its **own** dedicated `PATCH /:id/status` endpoint — normal field
  edits are **rejected with 409** while the row is `published` (move it
  back to `draft` first). Don't build a simple boolean switch against
  one of these; check
  [docs/event-support-admin-integration.md](event-support-admin-integration.md)
  §3 for the exact transition table before assuming.

## 5. There is no publish/staging step, anywhere

Every write is live immediately. Concretely: the handful of
public endpoints that are cached at all (`/homepage`, which content
blocks/collections/recommendations feed) are backed by Redis with an
explicit `bust()` call in the same request as the write — not a TTL
you wait out. Everything else (truck classes, storage, event support)
has **no cache layer in front of Postgres today** — a public `GET` is a
live query, so a write is visible on the very next request, full stop.

There is nothing in this API shaped like "save as draft" vs. "publish"
for any of these catalog resources (as opposed to event/storage
*bookings*, which do have a real pending → confirmed lifecycle — that's
a different kind of state machine, not a content-publishing one). If a
screen implies otherwise, that's a UI assumption to correct, not a
backend gap to file.

## 6. Deleting: images and owning rows are independent

Deleting a content block, truck class, storage unit type, etc. never
deletes the media asset it references — media assets are independent
rows that can be (and often are) reused, and are only ever deleted
explicitly:

```
DELETE /api/v1/admin/media/:id
```

which itself returns **409** if *anything* still references that asset
(the API discovers every foreign key into `media_assets` dynamically, so
this guard covers every module, including ones added after this doc was
written). Detach it from every owning row first, or just leave it — an
unattached asset costs nothing and is easy to find later:

```
GET /api/v1/admin/media?unused=true&withUsage=true
```

## 7. Regenerating your API types

Spec is served at `/docs-json` (not under `/api/v1`), Swagger UI at
`/docs`. Re-run your `gen:api` script against it after any backend
change — see
[docs/homepage-integration.md](homepage-integration.md) §1 for the exact
command. A quick way to sanity-check a new/changed module before wiring
a screen to it: open `/docs` and expand its `admin / *` tag.

## 8. Public vs. admin — don't assume a public read path exists

Content blocks (like the old hero slides before them) have **no public
route at all** — the landing page only ever reads them pre-joined
through `GET /homepage`'s `hero`/`services` keys, never
`/admin/content-blocks` directly, and that controller has no `@Public()`
counterpart. If a future asset type needs the admin panel to preview
exactly what the public site will render, check whether a public read
path exists for it before assuming you can just call the admin endpoint
with a user token — you generally can't, and shouldn't try to.

**Content blocks are also the one module where that answer is
type-dependent, not module-wide.** `type: "hero"` and `"service_card"`
rows follow the paragraph above — no public route, `/homepage` only.
`type: "property_promo"` rows are the exception: they *do* have a public
surfacing, `promoCards` on `GET /properties/:slug` (still never
`/admin/content-blocks` directly with a user token — the public path is
a different endpoint entirely, on the properties module, not this one).
Concretely: don't assume "content blocks" as a whole answers checklist
item 5 in §10 the same way for every row you fetch — check the `type`.

## 9. Current map of admin-manageable, image-bearing modules

| Module | Admin base path | Public read | Doc |
|---|---|---|---|
| Content blocks (hero + service strip + property promo cards) | `/admin/content-blocks` | type-dependent — hero/service_card via `/homepage`; property_promo via `/properties/:slug` (`promoCards`) — see §8 | [content-blocks-admin-integration.md](content-blocks-admin-integration.md) |
| Event support categories/items | `/admin/event-support` | `/event-support/*` | [event-support-admin-integration.md](event-support-admin-integration.md) |
| Moving truck classes | `/admin/moving/truck-classes` | `/moving/*` | [moving-admin-integration.md](moving-admin-integration.md) |
| Moving add-ons | `/admin/moving/addons` | `/moving/*` | [moving-admin-integration.md](moving-admin-integration.md) |
| Storage unit types/facilities | `/admin/storage/units`, `/admin/storage` | `/storage/*` | [storage-admin-integration.md](storage-admin-integration.md) |
| Collections | `/admin/collections` | via `/homepage` + `/collections/:slug` | [homepage-integration.md](homepage-integration.md) |
| Media library (upload/browse/delete) | `/admin/media` | — (never public) | §2 above |
| Properties (multi-image, own staging system) | `/admin/properties` | `/properties*` | out of scope here — see `lib/properties/image-staging.ts` |

Two more Moving admin surfaces exist but aren't image-bearing, so they're
not rows above: `/admin/moving/settings` (a pricing-policy singleton) and
`/admin/moving/leads` (read + triage of captured leads, no image field).
Both are covered in the same
[moving-admin-integration.md](moving-admin-integration.md).

## 10. Checklist for onboarding a new asset type

When backend ships a new admin-manageable, image-bearing resource,
confirm these before building the screen — most of this doc's answer is
"same as everything else," so the checklist is really just the handful
of things that legitimately vary per module:

1. What's the create/update DTO's image field actually called —
   `mediaAssetId`, or a prefixed variant? (§2)
2. Which `purpose` should this module's uploads use — does it need
   AVIF (→ `hero`), or is `cover`/`icon` more honest about how it's
   actually displayed? (§2)
3. Is the response field `image`, `cover`, or something else? Doesn't
   change how you render it (§3), just what you destructure.
4. Simple `isActive`, a full lifecycle (`PATCH /:id/status` + 409 guards
   on direct edits), or neither? (§4) — don't assume, check the module's
   own doc or `/docs`.
5. Is there a public read path at all, or does this only ever surface
   pre-joined through another payload like `/homepage`? (§8)
6. Paginated or not? Small admin-curated lists (content blocks, truck
   classes) tend not to be; anything that can grow unbounded (event
   items, properties) is.

Everything else — auth, envelope, errors, the upload-then-attach flow,
the `MediaImageDto` shape, delete-time 409s, and the total absence of a
publish step — is the same on every module and doesn't need
re-confirming each time.
