# Event Support — Web (Client) Integration Guide

Audience: `mandana-web`, the public event-support (venue/equipment rental)
pages shown in the catalog mockup — category tabs (Sound System, Stage
Effect, AC & Cooling Fan, Party Equipment), each split into "PAKET" and "Add
on" sections. All real booking happens over WhatsApp; there is **no public
write endpoint**. An admin records what was agreed afterward via the
separate admin panel — see `docs/event-support-admin-integration.md`.

## 1. Base URL & response envelope

Same convention as the rest of the API: all routes live under `/api/v1`,
spec at `/docs-json`. Every response is wrapped as `{ "data": ... }`; list
endpoints that paginate wrap as `{ "data": [...], "meta": { total, page,
limit, totalPages } }`. Every route in this guide is `@Public()` — no auth
header needed.

## 2. Catalog model

- **Category** = a tab (Sound System, ...). `GET /event-support/categories`
  returns all active categories, unpaginated (it's a tab bar) — each carries
  `itemCount`, the number of published items in it.
- **Item** = a card inside a tab — either a `kind: "package"` ("PAKET"
  section) or `kind: "addon"` ("Add on" section). Render the two sections by
  grouping the item list on `kind`; there is no separate section entity.
- Item cards in a listing only need `name` / `pricePerDay` / `image` — that's
  what `GET /event-support/items` returns per row. Clicking through to a
  detail page calls `GET /event-support/items/:slug` for the full
  description HTML and live stock.

## 3. Endpoints

### `GET /event-support/categories`

```jsonc
{ "data": [
  { "id": "uuid", "slug": "sound-system", "name": "Sound System",
    "description": "<p>...</p>", "descriptionText": "...",
    "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
    "itemCount": 6, "isActive": true, "sortOrder": 0 } ] }
```

### `GET /event-support/items?categorySlug&kind&startDate&days&page&limit`

Published items only. `categorySlug`/`kind` filter the tab + section;
`startDate` + `days` (both optional, but only meaningful together) currently
have no effect on this list response — availability only appears on the
detail endpoint and the quote. Paginated, `page`/`limit` default `1`/`12`.

```jsonc
{ "data": [
  { "id": "uuid", "slug": "medium-venue-package", "name": "Medium Venue Package",
    "kind": "package", "pricePerDay": 3500000,
    "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 } } ],
  "meta": { "total": 6, "page": 1, "limit": 12, "totalPages": 1 } }
```

### `GET /event-support/items/:slug?startDate&days`

Full detail. When `startDate` + `days` are both given, `availableQuantity`
is the live stock free over that window; otherwise it's `null` and only
`stockQuantity` is meaningful.

```jsonc
{ "data": {
  "id": "uuid", "slug": "medium-venue-package", "name": "Medium Venue Package",
  "kind": "package", "pricePerDay": 3500000, "image": { "...": "..." },
  "description": "<p>Termasuk 2 speaker aktif...</p>", "descriptionText": "Termasuk 2 speaker aktif...",
  "categorySlug": "sound-system", "categoryName": "Sound System",
  "stockQuantity": 3, "availableQuantity": 2 } }
```

### `POST /event-support/quote`

Computes an authoritative price for a cart and returns a prefilled
Indonesian WhatsApp message. **Writes nothing** — this is the "Check Cart"
action from the mockup. All lines share `startDate`; a line may override the
cart-level `days` (e.g. the DJ set for only 1 of a 2-day event).

```jsonc
// →
{ "startDate": "2026-03-01", "days": 2, "eventLocation": "Balai Sarbini, Jakarta Selatan",
  "items": [ { "slug": "medium-venue-package", "quantity": 1 },
             { "slug": "dj-set", "quantity": 1, "days": 1 } ] }

// ←
{ "data": {
  "lines": [
    { "slug": "medium-venue-package", "name": "Medium Venue Package", "quantity": 1,
      "startDate": "2026-03-01", "days": 2, "endDate": "2026-03-02",
      "pricePerDay": 3500000, "lineTotal": 7000000, "availableQuantity": 2 },
    { "slug": "dj-set", "name": "DJ Set", "quantity": 1,
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "pricePerDay": 3500000, "lineTotal": 3500000, "availableQuantity": 1 } ],
  "startDate": "2026-03-01", "endDate": "2026-03-02",
  "subtotal": 10500000, "discountAmount": 0, "total": 10500000, "currency": "IDR",
  "whatsappMessage": "Halo Mandana, saya ingin menyewa perlengkapan acara.\n\n- Medium Venue Package x1 (2 hari, 2026-03-01 s/d 2026-03-02): Rp7.000.000\n- DJ Set x1 (1 hari, 2026-03-01 s/d 2026-03-01): Rp3.500.000\n\nTanggal acara: 2026-03-01 s/d 2026-03-02\nLokasi: Balai Sarbini, Jakarta Selatan\nTotal: Rp10.500.000\n\nMohon konfirmasi ketersediaan dan langkah selanjutnya." } }
```

A line's `availableQuantity` may be less than its `quantity` — the response
still returns 200 so the FE can warn ("only 1 left") without blocking the
WhatsApp handoff, which is the real point at which a human resolves it.
Append the FE's own `NEXT_PUBLIC_MANDANA_WHATSAPP` number when opening the
`wa.me` link, same pattern as Moving/Storage — `whatsappMessage` is plain
text, not URL-encoded, so `encodeURIComponent()` it into the `wa.me/<number>?text=` link yourself.

## 4. Availability model

Stock is a **date-aware pool**, not a plain counter or a decrementing
integer: `availableQuantity = stockQuantity − (peak same-day quantity held
by overlapping *confirmed* bookings)`. A booking only counts once an admin
confirms it, so the number here can still drop between your quote and the
customer's actual WhatsApp confirmation — treat it as a strong hint, not a
hold. It's computed per-day, not by summing the whole window (renting 2
units on day 1 and 2 different units on day 4 doesn't add up to 4 against a
stock of 3).

## 5. Money

All prices are **integer Rupiah** — no decimals, no currency conversion.
`currency` is always `"IDR"` in every response that includes it.

## 6. Errors

Same envelope as the rest of the API on any non-2xx response:

```jsonc
{ "statusCode": 404, "timestamp": "...", "path": "/api/v1/event-support/items/not-a-slug",
  "error": { "message": "Event item \"not-a-slug\" not found", "error": "Not Found", "statusCode": 404 } }
```

The only error you should expect to handle specially on these public routes
is **404** on `GET /items/:slug` (unknown or unpublished slug) and on
`POST /quote` (unknown or unpublished slug in the cart — check the message
for which one). Validation errors (400) come from malformed query/body
params, e.g. `days` outside 1–365.
