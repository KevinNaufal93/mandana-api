# API Handoff — Property Detail Page

> Handoff spec for **mandana-web**. These are the backend changes behind the new
> property detail page (`/properties/[slug]`).
>
> ⚠️ **Phase 2 update:** this now includes a breaking change to `GET /properties`
> (the listing page) — public coordinates are fuzzed and `address` is dropped from
> *every* public endpoint, list included. See "Location privacy" below before you
> touch the map or the listing cards.
>
> ⚠️ **Phase 3 update:** `description` is now sanitized **HTML rich text**, not plain
> text — the admin CMS switched to a WYSIWYG editor. See "Rich text description" below
> before you touch the description field.
>
> ⚠️ **Phase 4 update:** `listingType` gained a third value, `new` ("Properti Baru"),
> and every card/detail response now also carries `handoverDate`/`constructionStatus`.
> See `docs/new-property-listing-type.md` and the "Properti Baru" section below.

## Summary

| Endpoint | Status |
| --- | --- |
| `GET /properties` | ⚠️ **Changed** — `address` removed, `latitude`/`longitude` are now fuzzed (~300 m), `locationPrecision`/`approximateRadiusM` added, `description` is now HTML with a new plain-text `descriptionText` sibling. Every other field is unchanged. |
| `GET /properties/:slug` | ✅ Existing route, richer payload — now includes `amenities`, `agent`, a deterministically-ordered gallery, and fuzzed location (see below). `latitude`/`longitude`/`price`/`areaSqm` are JSON **numbers**, not strings. `description` is now HTML — see "Rich text description" below. |
| `GET /properties/:slug/similar` | 🆕 New — "Pilihan Properti Serupa" |
| `GET /amenities` | 🆕 New — full facility picklist (for icon/label lookup, if you render facility filters later) |

---

## `GET /properties/:slug`

Same route as before. Response shape:

```jsonc
{ "data": {
  "id": "3f8a1c92-...", "slug": "blossom-residence", "title": "Blossom Residence",
  "listingType": "sale", "handoverDate": null, "constructionStatus": null,
  "price": 1200000000, "currency": "IDR",
  "bedrooms": 3, "bathrooms": 2, "areaSqm": 60,
  "area": "Sunter", "city": "Jakarta Utara", "province": "DKI Jakarta",
  "latitude": -6.1445, "longitude": 106.8689,
  "locationPrecision": "approximate", "approximateRadiusM": 300,
  "isFeatured": false,
  "description": "<p>Dijual Rumah <strong>Modern Classic</strong> Siap Huni...</p>",
  "descriptionText": "Dijual Rumah Modern Classic Siap Huni...",
  "propertyType": { "id": "...", "name": "Rumah", "slug": "rumah" },
  "images": [
    { "id": "...", "url": "...", "srcset": "... 768w, ... 1280w, ... 1920w",
      "alt": null, "width": 1600, "height": 900, "isCover": true, "sortOrder": 0 }
  ],
  "amenities": [
    { "id": "...", "slug": "air-conditioning", "name": "Air-conditioning", "icon": "ac", "category": "interior" },
    { "id": "...", "slug": "balcony", "name": "Balcony", "icon": "balcony", "category": "interior" }
  ],
  "agent": {
    "id": "...", "name": "Ahmad F.", "title": "Agen Independen",
    "whatsapp": "+628777123456", "phone": "08777123456",
    "photo": { "url": "...", "srcset": "...", "alt": "Ahmad F.", "width": 400, "height": 400 }
  },
  "createdAt": "2026-07-01T03:12:00.000Z", "updatedAt": "2026-08-01T09:40:00.000Z"
} }
```

**Notes:**

- Note there is **no `address` key** — see "Location privacy" below.
- `images` is now returned **cover-first, then by `sortOrder`** — always safe to render `images[0]` as the hero image.
- `agent` is `null` if the listing has no assigned agent (shouldn't happen for existing data — backfilled to the oldest admin).
- `agent` never includes `email`/`role` — don't rely on those being absent-but-present; they simply aren't sent.
- **Breaking type change:** `price`, `areaSqm`, `latitude`, `longitude` are JSON numbers (previously strings, since Postgres `numeric`/`decimal` columns come back from `pg` as strings). If your code does `parseFloat(property.price)` or similar, it still works but is now redundant — safe either way.

---

## Rich text description ⚠️ breaking change

`description` is now sanitized HTML, not plain text — render it with
`dangerouslySetInnerHTML` (React) or equivalent, not as a plain string. The admin CMS
posts whatever its WYSIWYG editor produces; the API sanitizes it against a fixed
allow-list before it's ever stored, so it's safe to render directly without further
escaping. Allowed tags: `p br span strong b em i u s strike blockquote ol ul li a
h1–h6 img pre code hr`, plus `color`/`background-color`/`text-align` inline styles.
Links always carry `target="_blank" rel="noopener noreferrer nofollow"`. No `data:`
URIs — images are always `https://` (uploaded through the media pipeline).

A plain-text sibling, `descriptionText`, ships alongside it (also on `GET /properties`
list rows and `GET /homepage` collection cards) for anywhere you need text without
markup — SEO `<meta description>`, share previews, search snippets. Both fields can be
`null`.

```jsonc
{
  "description": "<p>Rumah <strong>modern</strong> di BSD.</p><ul><li>3 kamar tidur</li></ul>",
  "descriptionText": "Rumah modern di BSD. 3 kamar tidur"
}
```

Existing plain-text descriptions were migrated automatically (wrapped in `<p>`, blank
lines split into paragraphs) — no content was lost, but re-check a few listings after
deploy since automated HTML conversion is a best-effort transform, not a guarantee of
identical rendering.

---

## Location privacy ⚠️ affects both list and detail

The `latitude`/`longitude` on every **public** endpoint (`GET /properties`, `GET /properties/:slug`)
are **displaced by up to 250 m** from the real point, deterministically per property — the same
listing always fuzzes to the same coordinates, so a map doesn't jump between page loads or
between the listing card and the detail page. `address` is **not sent at all** on public
endpoints (it's still indexed server-side, so `?search=` still matches street names).

```jsonc
"latitude": -6.1445, "longitude": 106.8689,
"locationPrecision": "approximate", "approximateRadiusM": 300
```

**Render a circle, not a pin.** The true location is always inside the circle:

```tsx
import { MapContainer, TileLayer, Circle } from "react-leaflet";

<MapContainer center={[property.latitude, property.longitude]} zoom={15} scrollWheelZoom={false}>
  <TileLayer
    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    attribution="&copy; OpenStreetMap &copy; CARTO"
  />
  <Circle
    center={[property.latitude, property.longitude]}
    radius={property.approximateRadiusM}
    pathOptions={{ color: "#1d4ed8", fillOpacity: 0.15, weight: 1 }}
  />
</MapContainer>
```

Don't use `tile.openstreetmap.org` directly — its usage policy blocks commercial/high-volume
apps. CARTO's basemap above is free at low volume and matches the mockup's gray/blue look;
MapTiler or Stadia Maps are the paid upgrade path if traffic grows. `scrollWheelZoom={false}`
keeps the map from hijacking page scroll on mobile.

For the listing page's city/area labels (`"Sunter, Jakarta Utara"`), keep using `area`/`city` as
today — nothing changed there, only `address` disappeared, and the mockup never rendered the
raw street address on a card anyway.

---

## `GET /properties/:slug/similar?limit=4` 🆕

Returns up to `limit` (default 4, max 12) other published properties, same `listingType`,
ranked by same property type → same city → same area → price within ±30%, falling back to
newest. Never includes the source property itself.

```jsonc
{ "data": [
  { "id": "...", "slug": "bio-district-bsd", "title": "BIO District BSD",
    "listingType": "sale", "handoverDate": null, "constructionStatus": null,
    "price": 20000000, "currency": "IDR",
    "bedrooms": 3, "bathrooms": 2, "areaSqm": 102,
    "area": "BSD City", "city": "Tangerang Selatan",
    "propertyType": { "id": "...", "name": "Apartemen", "slug": "apartemen" },
    "cover": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 } }
] }
```

This is the same "card" shape used on the homepage (`GET /homepage` → `recommendations[]`)
and `GET /properties` list rows — `id`, `slug`, `title`, `listingType`, `handoverDate`,
`constructionStatus`, `price`, `currency`, `bedrooms`, `bathrooms`, `areaSqm`, `area`, `city`,
`province`, `propertyType`, `cover`.

Returns `404` if the slug doesn't exist or isn't published. Returns `{ "data": [] }` (not an
error) if there's genuinely nothing else published in that listing type.

---

## `GET /amenities` 🆕

Full facility list, ordered by `category`, then `sortOrder`, then `name`:

```jsonc
{ "data": [
  { "id": "...", "name": "Air-conditioning", "slug": "air-conditioning", "icon": "ac", "category": "interior", "sortOrder": 10 }
] }
```

`icon` is a key (e.g. `"ac"`, `"pool"`) for you to map to your own icon set — the API doesn't
serve icon assets. Not paginated; the list is small (~12 seeded facilities) and expected to
stay that way.

---

## Properti Baru 🆕

`listingType` now has a third value: `new` ("Properti Baru" — brand-new units sold
directly by a developer, as opposed to `sale`'s resale/secondary market). It behaves
identically to `sale`/`rent` everywhere — same filters, same pagination, same detail
shape, same `/similar` (which stays within the source's `listingType`, so a properti
baru listing only recommends other properti baru).

Two extra fields ship on every card and detail response, only ever non-`null` when
`listingType` is `new`:

```jsonc
{
  "listingType": "new",
  "handoverDate": "2027-06-30",
  "constructionStatus": "under_construction"
}
```

- `handoverDate` — `YYYY-MM-DD` string or `null`. Expected completion/handover date.
- `constructionStatus` — `"ready"` \| `"under_construction"` \| `null`.

Full details in `docs/new-property-listing-type.md`, including the badge-mapping and
"no filter now returns three types" callouts for the listing page.

---

## Nothing else changes

- `GET /properties` (listing page) is unchanged **except** `address` is dropped and
  `latitude`/`longitude`/`locationPrecision`/`approximateRadiusM` per "Location privacy" above —
  every filter, `meta`, and every other field is identical. List rows also carry
  `description` (now HTML) and the new `descriptionText`, same as the detail endpoint —
  see "Rich text description" above.
- `GET /homepage` gains an `srcset` on `recommendations[].cover` (previously missing); every
  other field is unchanged. Homepage/`similar` cards never carried `address` or coordinates in
  the first place, so nothing changes there.
- The KPR simulator ("Simulasi Cicilan KPR") is pure client-side math over `price` — no API
  involved.
- "Saya Tertarik" / WhatsApp CTA still posts to the existing `POST /inquiries` with
  `propertyId`.
