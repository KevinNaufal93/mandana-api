# Event Support — Web Admin Integration Guide

Audience: the admin panel — category/item management for the event-support
(venue/equipment rental) catalog, plus recording bookings that were agreed
over WhatsApp. There is no public booking endpoint; this panel is the only
place bookings get created. See `docs/event-support-integration.md` for the
public catalog + quote contract this data feeds.

## 1. Base URL, auth & response envelope

All routes live under `/api/v1/admin/event-support`, spec at `/docs-json`
(tagged `admin / event-support`). Every route requires a Bearer token for a
user with the `admin` role — `Authorization: Bearer <token>` from
`POST /api/v1/auth/login`; a non-admin (`editor`) token gets **403**.
Responses use the same envelope as everywhere else: `{ "data": ... }`, or
`{ "data": [...], "meta": { total, page, limit, totalPages } }` on the three
paginated lists (items, categories are **not** paginated — see below).

## 2. Categories

`GET /categories?isActive` · `GET /categories/:id` · `POST /categories` ·
`PATCH /categories/:id` · `DELETE /categories/:id`

Unpaginated (a handful of tabs). `isActive` filters when given, otherwise
returns both active and inactive. Each row carries `itemCount` — total items
in that category, **any** status (unlike the public list, which only counts
`published`).

```jsonc
// POST /categories →
{ "name": "Sound System", "description": "<p>...</p>", "mediaAssetId": "uuid", "sortOrder": 0 }
// slug is optional — auto-generated from name when omitted, must be
// lowercase-hyphenated and unique if you do supply one.

// ← 201, same shape for GET/PATCH
{ "data": {
  "id": "uuid", "slug": "sound-system", "name": "Sound System",
  "description": "<p>...</p>", "descriptionText": "...",
  "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
  "itemCount": 6, "isActive": true, "sortOrder": 0 } }
```

To attach an image: `POST /admin/media/upload` first (multipart, returns a
`mediaAssetId`), then pass that id here or on an item.

`DELETE /categories/:id` returns **409** while the category still has any
items — move or delete them first.

## 3. Items

`GET /items?categoryId&kind&status&search&page&limit` · `GET /items/:id` ·
`POST /items` · `PATCH /items/:id` · `PATCH /items/:id/status` ·
`DELETE /items/:id`

Paginated, default `page=1&limit=12`. `search` matches item name
(case-insensitive substring).

```jsonc
// POST /items →
{ "categoryId": "uuid", "name": "Medium Venue Package", "kind": "package",
  "description": "<p>Termasuk 2 speaker aktif, 1 mixer, mic x4</p>",
  "pricePerDay": 3500000, "stockQuantity": 3,
  "eightHourRate": 2100000, "supportsEightHour": true,
  "mediaAssetId": "uuid", "sortOrder": 0 }
// kind defaults to "package" if omitted. slug is optional, same rules as
// categories. `status` is NOT accepted here — see the lifecycle below.
// eightHourRate/supportsEightHour are both optional and every existing
// item defaults to supportsEightHour:false, eightHourRate:null (day-only,
// unchanged pricing) until you opt it in — see "8-hour pricing" below.
// Setting supportsEightHour:true without a positive eightHourRate (here
// or already on the item), or an eightHourRate above pricePerDay, is a 400.

// ← 201 — every field from the request plus:
{ "data": {
  "id": "uuid", "categoryId": "uuid", "categorySlug": "sound-system", "categoryName": "Sound System",
  "name": "Medium Venue Package", "slug": "medium-venue-package", "kind": "package",
  "description": "<p>...</p>", "descriptionText": "...",
  "pricePerDay": 3500000, "eightHourRate": 2100000, "supportsEightHour": true,
  "stockQuantity": 3, "status": "draft",
  "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
  "sortOrder": 0, "createdAt": "...", "updatedAt": "..." } }
```

### 8-hour pricing

`eightHourRate` is **independent of `pricePerDay`** — it's never derived
from it (a short rental costs more per hour to deliver/collect than a day
rental amortizes to), so set it explicitly for every item you opt in. It
must not exceed `pricePerDay` — the API rejects that as a 400, since a
half-day block priced above the full day makes no sense. None of this
takes effect on the public quote/catalog until `supportsEightHour: true`
**and** the requested window is at or under 8 hours — a fixed rule, not a
policy setting; see `docs/event-support-integration.md`. This section used
to describe a configurable hourly-pricing policy (threshold, rounding
step, minimum-hours floor) — that policy is gone; see migration
`1788600000000-ReplaceEventHourlyWithEightHourPricing`.

### Draft/published/archived lifecycle

- `POST /items` always creates a **draft** — `status` isn't a field on this
  body at all.
- `PATCH /items/:id` (name, price, stock, description, category, image, ...)
  returns **409** unless the item's current status is `draft`. To edit a
  published item: move it back to draft, edit, republish.
- `PATCH /items/:id/status` — body `{ "status": "published" | "draft" | "archived" }` —
  is the *only* endpoint that changes status. Legal transitions:

  | From | To |
  |---|---|
  | `draft` | `published`, `archived` |
  | `published` | `draft`, `archived` |
  | `archived` | `draft` |

  There is no `archived → published` shortcut — route back through `draft`.
  An illegal transition (e.g. `draft → draft`... no-op returns 200 unchanged;
  anything not in the table above) returns **409**.
- Moving to `archived` returns **409** while the item has a `pending` or
  `confirmed` booking whose window (`endDate`) hasn't passed yet.

`DELETE /items/:id` returns **409** if any booking (of any status,
including old completed/cancelled ones) references it — the message names
the count. Archive it instead; archived items no longer show up in the
public catalog but keep their booking history intact.

Only `published` items can be added to a booking (`POST /bookings` below)
or appear in the public quote.

## 4. Bookings

`GET /bookings?status&search&from&to&startFrom&startTo&sortBy&sortOrder&page&limit` ·
`GET /bookings/:id` · `POST /bookings` · `PATCH /bookings/:id/confirm` ·
`PATCH /bookings/:id/cancel` · `PATCH /bookings/:id/complete`

See [`docs/booking-list-contract.md`](./booking-list-contract.md) for the
full list-query contract shared with Storage and Moving.

> **BREAKING CHANGE.** `from`/`to` used to filter by overlap with the
> booking's event window (`endDate >= from`, `startDate <= to`). They now
> filter by **`createdAt`** (capture date), matching Storage and Moving. The
> old window-overlap filter didn't go away — it moved to **`startFrom`/
> `startTo`** with the identical predicate. Fix: rename `from` → `startFrom`
> and `to` → `startTo` on this screen; no other change in behavior.

`status` filters exactly; `search` matches reference, customer name, phone,
or email; `sortBy` accepts `createdAt` (default), `reference`, `total`, or
`startDate`.

Every list/detail row also now carries a `source: "public" | "admin"` field
(see below) — a booking a customer submitted directly has
`createdByName: null`, which used to only mean "the recording admin's
account was deleted."

### Two ways a booking gets here

**Customers can now submit directly** — `POST /event-support/bookings`
(public, no auth), documented in `docs/event-support-integration.md`. It
takes the same cart shape as `POST /event-support/quote` (slug-keyed items,
plus contact fields) and prices it through the identical code path, so the
persisted total can never drift from the quote the customer saw. A
publicly-submitted booking has `source: "public"`, `createdByName: null`.

**Admins still record bookings agreed over WhatsApp** via the `POST
/bookings` documented below — unchanged except for the new `source:
"admin"` field on the response. `createdBy` is **not** a body field; it's
taken from your Bearer token automatically.

```jsonc
// POST /bookings →
{ "customerName": "Budi Santoso", "phone": "+628123456789", "email": "budi@example.com",
  "eventLocation": "Balai Sarbini, Jakarta Selatan", "notes": "Perlu akses loading dock jam 08:00",
  "items": [
    { "itemId": "uuid-of-sound-system", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00" },
    { "itemId": "uuid-of-stage-backdrop", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00" } ] }
```

`itemId` must reference a currently **published** item or the request
fails with 404 naming which id(s) weren't found/published. `dropoffAt`/
`pickupAt` are naive local datetimes, same wire format as the public quote
(no `Z`/offset — see `docs/event-support-integration.md`). Each line's
`pricePerDay` (and, when it bills as a block, `eightHourRate` as
`unitPrice`) is looked up and snapshotted at creation time — later editing
the item's price never changes an existing booking. `billingMode`/
`unitPrice`/`unitLabel`/`billableUnits` are computed the same way
`POST /event-support/quote` does.

```jsonc
// ← 201
{ "data": {
  "id": "uuid", "reference": "MDN-EVT-7K3PQ9", "status": "pending", "source": "admin",
  "customerName": "Budi Santoso", "phone": "+628123456789", "email": "budi@example.com",
  "eventLocation": "Balai Sarbini, Jakarta Selatan", "notes": "...",
  "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
  "startDate": "2026-03-01", "endDate": "2026-03-01",
  "items": [
    { "id": "uuid", "itemId": "uuid", "itemName": "Sound System Medium", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "billingMode": "eight_hour", "pricePerDay": 500000,
      "unitPrice": 75000, "unitLabel": "8 jam", "billableUnits": 1,
      "lineTotal": 600000 },
    { "id": "uuid", "itemId": "uuid", "itemName": "Stage Backdrop", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "billingMode": "daily", "pricePerDay": 500000,
      "unitPrice": 500000, "unitLabel": "hari", "billableUnits": 1,
      "lineTotal": 500000 } ],
  "subtotal": 1100000, "discountAmount": 0, "total": 1100000,
  "adminNote": null, "createdByName": "Kevin", "confirmedAt": null, "confirmedByName": null,
  "createdAt": "...", "updatedAt": "..." } }
```

`days` on each line is now the **calendar days held**
(`endDate - startDate + 1`), not an input — it stays meaningful for an
8-hour-block line too (a same-day rental still reads `days: 1`).
Availability itself is still day-granular: an 8-hour rental holds the item
for its whole calendar day, same as before — see §5.

### Status transitions

A booking starts `pending`. `pending` and `confirmed` bookings can be
`cancel`led; only `confirmed` can be `complete`d. All three transition
endpoints take an optional body `{ "adminNote": "..." }` (internal note,
never shown to the customer) — an empty `{}` or omitted body is fine.

```
pending ──confirm──▶ confirmed ──complete──▶ completed
   │                     │
   └──────cancel─────────┴──────cancel──▶ cancelled
```

**`PATCH /bookings/:id/confirm`** is the only place stock is actually
claimed. It re-checks live availability for every line inside a database
transaction and returns **409** if any line no longer has enough stock —
e.g. another booking for an overlapping date range was confirmed first:

```jsonc
// 409 →
{ "statusCode": 409, "timestamp": "...", "path": "/api/v1/admin/event-support/bookings/.../confirm",
  "error": { "message": "Only 1 unit(s) of \"Medium Venue Package\" left for 2026-03-01 to 2026-03-02",
             "error": "Conflict", "statusCode": 409 } }
```

On a 409 here, re-fetch the booking and either lower the quantity (via a new
booking — bookings aren't editable in place) or pick a different item/date
before retrying. `confirm` also sets `confirmedByName`/`confirmedAt` from
your token. `cancel`/`complete` don't re-check anything — they just release
whatever stock the booking held (see availability model below) and are safe
to call any time the booking is in a valid starting state; calling them from
the wrong state (e.g. `complete` on a `pending` booking) returns 409.

## 5. Availability model — why `confirm` can 409

Stock is a **date-aware pool**, not a static counter you decrement by hand:

```
availableQuantity = stockQuantity − peak-per-day quantity held by
                     overlapping bookings with status = confirmed
```

Only `confirmed` bookings count. `pending` reserves nothing — two admins
can both record a request against the same last unit; only whichever one
calls `confirm` first actually claims it, and the second gets the 409 above.
"Peak-per-day" (not summed across the window) means renting 2 units on day 1
and 2 *different* units on day 4 of the same item never reads as needing 4
against a stock of 3.

There's no manual "release stock" action — `cancel`/`complete` simply flip
the booking out of `confirmed`, and since only `confirmed` bookings count
toward the peak, the stock is freed as a side effect.

## 6. Settings — delivery-area disclosure

`GET /admin/event-support/settings` · `PATCH /admin/event-support/settings`

A singleton — GET/PATCH only, no `POST`/`DELETE`/`:id` (same pattern as
`GET/PATCH /admin/moving/settings`). This used to also hold every
commercial rule the flexible-hourly-pricing rollout needed ops sign-off
on; that policy is gone now that pricing is a fixed 8-hour block, so this
row is just the Jabodetabek delivery disclosure. The public
`GET /event-support/pricing-config` (see `docs/event-support-integration.md`)
serves the same row read-only.

```jsonc
// GET → 200 / PATCH → 200 (body: any subset of these fields)
{ "data": {
  "priceIncludesJabodetabekDelivery": true,
  "outsideJabodetabekNote": null } }
```

| Field | Meaning |
|---|---|
| `priceIncludesJabodetabekDelivery` | Drives the "Harga sudah termasuk ongkir Jabodetabek." line in `whatsappMessage`. |
| `outsideJabodetabekNote` | Free-text note; not yet auto-triggered by `eventLocation` — set it when you want the copy ready for a future check. |

Changing any of this reprices every subsequent quote and booking
immediately — nothing here retroactively changes a booking already
recorded, since each line snapshots its own `unitPrice`/`billingMode` at
creation time.

## 7. Money

All prices are **integer Rupiah**, no decimals. A line's `pricePerDay ×
quantity × billableUnits` (daily) or `eightHourRate × quantity` (one
8-hour block, `billableUnits` always `1`) computes `lineTotal`;
`subtotal`/`discountAmount`/`total` sum across lines server-side. There's
currently no discount-tier support (`discountAmount` is always `0`) — it's
a real field in the response shape so one can be added later without a
breaking change.

## 8. Errors

Same envelope as the rest of the API:

```jsonc
{ "statusCode": 409, "timestamp": "...", "path": "...",
  "error": { "message": "...", "error": "Conflict", "statusCode": 409 } }
```

Expect **404** on any `:id` that doesn't exist, **409** on the lifecycle/
delete/confirm guards described above, and **400** on validation failures
(e.g. `quantity` outside 1–1000, malformed dates). A duplicate `slug` on
create/update surfaces as a generic 409 "Resource already exists" — if that
happens on a slug you supplied yourself, just pick a different one or omit
it to auto-generate.
