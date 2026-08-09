# API Handoff — Property Detail Page

> Handoff spec for **mandana-web**. These are the backend changes behind the new
> property detail page (`/properties/[slug]`). `GET /properties` (the listing page) is
> **unchanged** — see `docs/web-property-listing-requirements.md`.

## Summary

| Endpoint | Status |
| --- | --- |
| `GET /properties/:slug` | ✅ Existing route, richer payload — now includes `amenities`, `agent`, and a deterministically-ordered gallery. `latitude`/`longitude`/`price`/`areaSqm` are now JSON **numbers**, not strings. |
| `GET /properties/:slug/similar` | 🆕 New — "Pilihan Properti Serupa" |
| `GET /amenities` | 🆕 New — full facility picklist (for icon/label lookup, if you render facility filters later) |

---

## `GET /properties/:slug`

Same route as before. Response shape:

```jsonc
{ "data": {
  "id": "3f8a1c92-...", "slug": "blossom-residence", "title": "Blossom Residence",
  "listingType": "sale", "price": 1200000000, "currency": "IDR",
  "bedrooms": 3, "bathrooms": 2, "areaSqm": 60,
  "address": "Jl. Danau Sunter Utara", "area": "Sunter", "city": "Jakarta Utara",
  "province": "DKI Jakarta", "latitude": -6.1421, "longitude": 106.8712,
  "isFeatured": false,
  "description": "Dijual Rumah Modern Classic Siap Huni Di daerah Sunter Jakarta Utara...",
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

- `images` is now returned **cover-first, then by `sortOrder`** — always safe to render `images[0]` as the hero image.
- `agent` is `null` if the listing has no assigned agent (shouldn't happen for existing data — backfilled to the oldest admin).
- `agent` never includes `email`/`role` — don't rely on those being absent-but-present; they simply aren't sent.
- **Breaking type change:** `price`, `areaSqm`, `latitude`, `longitude` are now JSON numbers (previously strings, since Postgres `numeric`/`decimal` columns come back from `pg` as strings). If your code does `parseFloat(property.price)` or similar, it still works but is now redundant — safe either way.
- `address`/`latitude`/`longitude` are still **exact** in this phase. **Phase 2 (not yet shipped)** will fuzz public coordinates to a ~300 m radius for privacy and drop `address` from the public payload, adding `locationPrecision`/`approximateRadiusM` fields instead. We'll ping you with a follow-up contract before that ships — it changes what you can render on the map.

---

## `GET /properties/:slug/similar?limit=4` 🆕

Returns up to `limit` (default 4, max 12) other published properties, same `listingType`,
ranked by same property type → same city → same area → price within ±30%, falling back to
newest. Never includes the source property itself.

```jsonc
{ "data": [
  { "id": "...", "slug": "bio-district-bsd", "title": "BIO District BSD",
    "listingType": "sale", "price": 20000000, "currency": "IDR",
    "bedrooms": 3, "bathrooms": 2, "areaSqm": 102,
    "area": "BSD City", "city": "Tangerang Selatan",
    "propertyType": { "id": "...", "name": "Apartemen", "slug": "apartemen" },
    "cover": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 } }
] }
```

This is the same "card" shape used on the homepage (`GET /homepage` → `recommendations[]`)
and `GET /properties` list rows — `id`, `slug`, `title`, `listingType`, `price`, `currency`,
`bedrooms`, `bathrooms`, `areaSqm`, `area`, `city`, `province`, `propertyType`, `cover`.

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

## Nothing else changes

- `GET /properties` (listing page) response is byte-identical to before.
- `GET /homepage` gains an `srcset` on `recommendations[].cover` (previously missing); every
  other field is unchanged.
- The KPR simulator ("Simulasi Cicilan KPR") is pure client-side math over `price` — no API
  involved.
- "Saya Tertarik" / WhatsApp CTA still posts to the existing `POST /inquiries` with
  `propertyId`.
