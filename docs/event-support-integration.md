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

### `GET /event-support/pricing-config`

The hourly-pricing policy — fetch these instead of hardcoding them
client-side, same pattern as `GET /moving/pricing-config`. If ops revisits
a value in the admin panel, this endpoint picks it up with no FE redeploy.

```jsonc
{ "data": {
  "hourlyThresholdHours": 24, "hourlyThresholdInclusive": true,
  "defaultMinimumHours": 2, "roundingUnitMinutes": 30,
  "capHourlyAtDailyRate": true, "overThresholdMode": "whole_days",
  "priceIncludesJabodetabekDelivery": true, "outsideJabodetabekNote": null } }
```

### `GET /event-support/items?categorySlug&kind&dropoffAt&pickupAt&page&limit`

Published items only. `categorySlug`/`kind` filter the tab + section;
`dropoffAt`/`pickupAt` (both optional, but must be given together) add each
item's live `activeRate` — the rate the web should render for that window,
already resolved server-side (§4). Paginated, `page`/`limit` default `1`/`12`.

```jsonc
{ "data": [
  { "id": "uuid", "slug": "medium-venue-package", "name": "Medium Venue Package",
    "kind": "package", "pricePerDay": 3500000,
    "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
    "activeRate": { "amount": 75000, "unit": "hour", "label": "jam" } } ],
  "meta": { "total": 6, "page": 1, "limit": 12, "totalPages": 1 } }
```

`activeRate` is omitted entirely when no window was given. When a window is
given but the item doesn't price hourly for it, it falls back to
`{ "amount": pricePerDay, "unit": "day", "label": "hari" }` — never a
hallucinated hourly figure. **Never compute which rate applies yourself —
always render whatever `activeRate` says.**

### `GET /event-support/items/:slug?dropoffAt&pickupAt`

Full detail. When `dropoffAt`/`pickupAt` are both given, `availableQuantity`
is the live stock free over that window and `activeRate` is included (same
rule as the list above); otherwise `availableQuantity` is `null` and only
`stockQuantity` is meaningful.

```jsonc
{ "data": {
  "id": "uuid", "slug": "medium-venue-package", "name": "Medium Venue Package",
  "kind": "package", "pricePerDay": 3500000, "image": { "...": "..." },
  "activeRate": { "amount": 75000, "unit": "hour", "label": "jam" },
  "description": "<p>Termasuk 2 speaker aktif...</p>", "descriptionText": "Termasuk 2 speaker aktif...",
  "categorySlug": "sound-system", "categoryName": "Sound System",
  "stockQuantity": 3, "availableQuantity": 2 } }
```

### `POST /event-support/quote`

Computes an authoritative price for a cart and returns a prefilled
Indonesian WhatsApp message. **Writes nothing** — this is the "Check Cart"
action from the mockup. `dropoffAt`/`pickupAt` are **naive local datetimes,
no `Z`/offset** (Asia/Jakarta by convention, e.g. `"2026-03-01T09:00"`) —
Indonesia has no DST, so treat two such values as directly comparable.
All lines share the cart-level window; a line may override it with its own
`dropoffAt`/`pickupAt` pair (both or neither — e.g. the DJ set picked up
earlier than the rest of the order).

A window of `hourlyThresholdHours` (24 by default, see `pricing-config`
above) or less prices **hourly** for any item with `supportsHourly: true`;
everything else prices by the day. The mode is decided **per line, not per
cart** — a cart can mix an hourly item with a day-only one in the same
window, and each line reports which mode it actually got.

```jsonc
// →
{ "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
  "eventLocation": "Balai Sarbini, Jakarta Selatan",
  "items": [ { "slug": "sound-system-medium", "quantity": 1 },
             { "slug": "stage-backdrop", "quantity": 1 } ] }

// ←
{ "data": {
  "lines": [
    { "slug": "sound-system-medium", "name": "Sound System Medium", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "endDate": "2026-03-01",
      "billingMode": "hourly", "unitPrice": 75000, "unitLabel": "jam", "billableUnits": 8,
      "extraHours": null, "extraHoursTotal": null,
      "lineTotal": 600000, "availableQuantity": 2 },
    { "slug": "stage-backdrop", "name": "Stage Backdrop", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "endDate": "2026-03-01",
      "billingMode": "daily", "unitPrice": 500000, "unitLabel": "hari", "billableUnits": 1,
      "extraHours": null, "extraHoursTotal": null,
      "lineTotal": 500000, "availableQuantity": 1 } ],
  "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
  "startDate": "2026-03-01", "endDate": "2026-03-01", "isMixedBilling": true,
  "subtotal": 1100000, "discountAmount": 0, "total": 1100000, "currency": "IDR",
  "whatsappMessage": "Halo Mandana, saya ingin menyewa perlengkapan acara.\n\n- Sound System Medium x1 (8 jam, 2026-03-01T09:00 s/d 2026-03-01T17:00): Rp600.000\n- Stage Backdrop x1 (1 hari, 2026-03-01T09:00 s/d 2026-03-01T17:00): Rp500.000\n\nWaktu sewa: 2026-03-01T09:00 s/d 2026-03-01T17:00\nLokasi: Balai Sarbini, Jakarta Selatan\nTotal: Rp1.100.000\nHarga sudah termasuk ongkir Jabodetabek.\n\nMohon konfirmasi ketersediaan dan langkah selanjutnya." } }
```

`isMixedBilling` is a rendering hint computed from the lines
(`true` when they don't all share one `billingMode`) — never an input to
pricing them, and never something to recompute client-side.
`unitLabel`/`billableUnits` replace the old `pricePerDay`/`days` fields —
render `"Rp75.000 / jam"` or `"Rp500.000 / hari"` from `unitPrice`/`unitLabel`
directly. `extraHours`/`extraHoursTotal` are only non-null under the
`day_plus_hourly` `overThresholdMode` (see `pricing-config`); ignore them
otherwise.

A line's `availableQuantity` may be less than its `quantity` — the response
still returns 200 so the FE can warn ("only 1 left") without blocking the
WhatsApp handoff, which is the real point at which a human resolves it.
Append the FE's own `NEXT_PUBLIC_MANDANA_WHATSAPP` number when opening the
`wa.me` link, same pattern as Moving/Storage — `whatsappMessage` is plain
text, not URL-encoded, so `encodeURIComponent()` it into the `wa.me/<number>?text=` link yourself.

> **Breaking change from the previous `{ startDate, days }` shape.** The old
> fields are gone — `forbidNonWhitelisted` on this API means a client still
> sending `days` gets a **400**, not a silent drop. Coordinate this deploy
> with removing `lib/event/datetime.ts`'s `toLegacyQuoteWindow` adapter and
> the "Sewa di bawah 24 jam saat ini dihitung sebagai 1 hari" copy.

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
params — a `dropoffAt`/`pickupAt` that isn't `YYYY-MM-DDTHH:mm` (no `Z`/
offset), `pickupAt` not after `dropoffAt`, one of the pair given without the
other, or a window over 365 days.
