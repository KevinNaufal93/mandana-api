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
  "pricePerDay": 3500000, "stockQuantity": 3, "mediaAssetId": "uuid", "sortOrder": 0 }
// kind defaults to "package" if omitted. slug is optional, same rules as
// categories. `status` is NOT accepted here — see the lifecycle below.

// ← 201 — every field from the request plus:
{ "data": {
  "id": "uuid", "categoryId": "uuid", "categorySlug": "sound-system", "categoryName": "Sound System",
  "name": "Medium Venue Package", "slug": "medium-venue-package", "kind": "package",
  "description": "<p>...</p>", "descriptionText": "...",
  "pricePerDay": 3500000, "stockQuantity": 3, "status": "draft",
  "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
  "sortOrder": 0, "createdAt": "...", "updatedAt": "..." } }
```

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

`GET /bookings?status&from&to&search&page&limit` · `GET /bookings/:id` ·
`POST /bookings` · `PATCH /bookings/:id/confirm` ·
`PATCH /bookings/:id/cancel` · `PATCH /bookings/:id/complete`

`status` filters exactly; `from`/`to` filter by overlap with the booking's
event window (`endDate >= from`, `startDate <= to`); `search` matches
reference, customer name, or phone.

### Recording a booking

Every real booking is agreed over WhatsApp first — this is where you write
down what was agreed. `createdBy` is **not** a body field; it's taken from
your Bearer token automatically.

```jsonc
// POST /bookings →
{ "customerName": "Budi Santoso", "phone": "+628123456789", "email": "budi@example.com",
  "eventLocation": "Balai Sarbini, Jakarta Selatan", "notes": "Perlu akses loading dock jam 08:00",
  "items": [
    { "itemId": "uuid-of-medium-venue-package", "quantity": 1, "startDate": "2026-03-01", "days": 2 },
    { "itemId": "uuid-of-dj-set", "quantity": 1, "startDate": "2026-03-01", "days": 1 } ] }
```

`itemId` must reference a currently **published** item or the request
fails with 404 naming which id(s) weren't found/published. Each line's
`pricePerDay` is looked up and snapshotted at creation time — later editing
the item's price never changes an existing booking.

```jsonc
// ← 201
{ "data": {
  "id": "uuid", "reference": "MDN-EVT-7K3PQ9", "status": "pending",
  "customerName": "Budi Santoso", "phone": "+628123456789", "email": "budi@example.com",
  "eventLocation": "Balai Sarbini, Jakarta Selatan", "notes": "...",
  "startDate": "2026-03-01", "endDate": "2026-03-02",
  "items": [
    { "id": "uuid", "itemId": "uuid", "itemName": "Medium Venue Package", "quantity": 1,
      "startDate": "2026-03-01", "days": 2, "endDate": "2026-03-02",
      "pricePerDay": 3500000, "lineTotal": 7000000 },
    { "id": "uuid", "itemId": "uuid", "itemName": "DJ Set", "quantity": 1,
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "pricePerDay": 3500000, "lineTotal": 3500000 } ],
  "subtotal": 10500000, "discountAmount": 0, "total": 10500000,
  "adminNote": null, "createdByName": "Kevin", "confirmedAt": null, "confirmedByName": null,
  "createdAt": "...", "updatedAt": "..." } }
```

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

## 6. Money

All prices are **integer Rupiah**, no decimals. `subtotal`/`discountAmount`/
`total` are computed server-side from each line's snapshotted
`pricePerDay × quantity × days`; there's currently no discount-tier support
(`discountAmount` is always `0`) — it's a real field in the response shape
so one can be added later without a breaking change.

## 7. Errors

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
