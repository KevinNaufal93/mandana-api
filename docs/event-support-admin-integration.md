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
  "hourlyRate": 75000, "supportsHourly": true, "minimumHours": 4,
  "mediaAssetId": "uuid", "sortOrder": 0 }
// kind defaults to "package" if omitted. slug is optional, same rules as
// categories. `status` is NOT accepted here — see the lifecycle below.
// hourlyRate/supportsHourly/minimumHours are all optional and every
// existing item defaults to supportsHourly:false, hourlyRate:null,
// minimumHours:null (day-only, unchanged pricing) until you opt it in —
// see "Hourly pricing" below. Setting supportsHourly:true without a
// positive hourlyRate (here or already on the item) is a 400.

// ← 201 — every field from the request plus:
{ "data": {
  "id": "uuid", "categoryId": "uuid", "categorySlug": "sound-system", "categoryName": "Sound System",
  "name": "Medium Venue Package", "slug": "medium-venue-package", "kind": "package",
  "description": "<p>...</p>", "descriptionText": "...",
  "pricePerDay": 3500000, "hourlyRate": 75000, "supportsHourly": true, "minimumHours": 4,
  "stockQuantity": 3, "status": "draft",
  "image": { "url": "...", "srcset": "...", "alt": null, "width": 800, "height": 600 },
  "sortOrder": 0, "createdAt": "...", "updatedAt": "..." } }
```

### Hourly pricing

`hourlyRate` is **independent of `pricePerDay`** — it's never derived from
it (a short hourly rental costs more per hour to deliver/collect than a day
rental amortizes to), so set it explicitly for every item you opt in.
`minimumHours` is the smallest billable block for that item specifically;
leave it `null` to fall back to the pricing policy's `defaultMinimumHours`
(see the Settings section below). None of this takes effect on the public
quote/catalog until `supportsHourly: true` **and** the window is at or under
the policy's `hourlyThresholdHours` — see `docs/event-support-integration.md`.

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
    { "itemId": "uuid-of-sound-system", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00" },
    { "itemId": "uuid-of-stage-backdrop", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00" } ] }
```

`itemId` must reference a currently **published** item or the request
fails with 404 naming which id(s) weren't found/published. `dropoffAt`/
`pickupAt` are naive local datetimes, same wire format as the public quote
(no `Z`/offset — see `docs/event-support-integration.md`). Each line's
`pricePerDay` (and, when it bills hourly, `hourlyRate` as `unitPrice`) is
looked up and snapshotted at creation time — later editing the item's price
never changes an existing booking. `billingMode`/`unitPrice`/`unitLabel`/
`billableUnits` are computed the same way `POST /event-support/quote` does,
against the pricing policy in effect at booking time.

```jsonc
// ← 201
{ "data": {
  "id": "uuid", "reference": "MDN-EVT-7K3PQ9", "status": "pending",
  "customerName": "Budi Santoso", "phone": "+628123456789", "email": "budi@example.com",
  "eventLocation": "Balai Sarbini, Jakarta Selatan", "notes": "...",
  "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
  "startDate": "2026-03-01", "endDate": "2026-03-01",
  "items": [
    { "id": "uuid", "itemId": "uuid", "itemName": "Sound System Medium", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "billingMode": "hourly", "pricePerDay": 500000,
      "unitPrice": 75000, "unitLabel": "jam", "billableUnits": 8,
      "extraHours": null, "extraHoursTotal": null, "lineTotal": 600000 },
    { "id": "uuid", "itemId": "uuid", "itemName": "Stage Backdrop", "quantity": 1,
      "dropoffAt": "2026-03-01T09:00", "pickupAt": "2026-03-01T17:00",
      "startDate": "2026-03-01", "days": 1, "endDate": "2026-03-01",
      "billingMode": "daily", "pricePerDay": 500000,
      "unitPrice": 500000, "unitLabel": "hari", "billableUnits": 1,
      "extraHours": null, "extraHoursTotal": null, "lineTotal": 500000 } ],
  "subtotal": 1100000, "discountAmount": 0, "total": 1100000,
  "adminNote": null, "createdByName": "Kevin", "confirmedAt": null, "confirmedByName": null,
  "createdAt": "...", "updatedAt": "..." } }
```

`days` on each line is now the **calendar days held**
(`endDate - startDate + 1`), not an input — it stays meaningful for an
hourly-billed line too (a same-day rental still reads `days: 1`).
Availability itself is still day-granular: a 3-hour rental holds the item
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

## 6. Settings — the hourly-pricing policy

`GET /admin/event-support/settings` · `PATCH /admin/event-support/settings`

A singleton — GET/PATCH only, no `POST`/`DELETE`/`:id` (same pattern as
`GET/PATCH /admin/moving/settings`). This is every commercial rule the
hourly-pricing rollout needed ops sign-off on, made editable here instead of
hardcoded, so a policy change ships instantly with no deploy. The public
`GET /event-support/pricing-config` (see `docs/event-support-integration.md`)
serves the same row read-only.

```jsonc
// GET → 200 / PATCH → 200 (body: any subset of these fields)
{ "data": {
  "hourlyThresholdHours": 24,
  "hourlyThresholdInclusive": true,
  "defaultMinimumHours": 2,
  "roundingUnitMinutes": 30,
  "capHourlyAtDailyRate": true,
  "overThresholdMode": "whole_days",
  "priceIncludesJabodetabekDelivery": true,
  "outsideJabodetabekNote": null } }
```

| Field | Meaning |
|---|---|
| `hourlyThresholdHours` / `hourlyThresholdInclusive` | The hourly/daily cutoff, and whether a window landing exactly on it (`<=`) still counts as hourly or falls to daily (`<`). |
| `defaultMinimumHours` | Fallback minimum billable hours for items that leave their own `minimumHours` unset. |
| `roundingUnitMinutes` | Billable hours round *up* to this step (e.g. 5h20m rounds to 5.5h at a 30-minute step). |
| `capHourlyAtDailyRate` | When on, an hourly line's total never exceeds `pricePerDay × quantity` — a long-but-still-hourly window can't price higher than just booking the day. |
| `overThresholdMode` | `"whole_days"` (default — ceils to the next full day, matches the pre-hourly-pricing behaviour) or `"day_plus_hourly"` (full days at `pricePerDay`, the remainder billed hourly on items that support it — surfaced per line as `extraHours`/`extraHoursTotal`). |
| `priceIncludesJabodetabekDelivery` | Drives the "Harga sudah termasuk ongkir Jabodetabek." line in `whatsappMessage`. |
| `outsideJabodetabekNote` | Free-text note; not yet auto-triggered by `eventLocation` — set it when you want the copy ready for a future check. |

Changing any of this reprices every subsequent quote and booking
immediately — nothing here retroactively changes a booking already
recorded, since each line snapshots its own `unitPrice`/`billingMode` at
creation time.

## 7. Money

All prices are **integer Rupiah**, no decimals. A line's `pricePerDay ×
quantity × billableUnits` (daily) or `unitPrice × billableUnits × quantity`
(hourly, capped per the settings above) computes `lineTotal`;
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
