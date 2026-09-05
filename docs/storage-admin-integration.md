# Smart Storage — Web Admin Integration Guide

Audience: the admin panel — unit type/facility/inventory/unit catalog
management for Smart Storage, plus reviewing and transitioning bookings
customers submit publicly. See `docs/storage-integration.md` for the public
catalog + quote + booking contract this data feeds, and
`docs/storage-floor-plan-response.md` for the physical-unit/floor-plan model
behind `/admin/storage/units`. This doc assumes both.

## 1. Base URL, auth & response envelope

All routes live under `/api/v1/admin/storage`, spec at `/docs-json` (tagged
`admin / storage`). Every route requires a Bearer token for a user with the
`admin` role — `Authorization: Bearer <token>` from `POST /api/v1/auth/login`;
a non-admin (`editor`) token gets **403**. Responses use the same envelope as
everywhere else: `{ "data": ... }`, or `{ "data": [...], "meta": { total,
page, limit, totalPages } }` on the two paginated lists (bookings, units —
unit types/facilities/inventory are **not** paginated, see below).

## 2. Unit types

`GET /unit-types?isActive` · `GET /unit-types/:id` · `POST /unit-types` ·
`PATCH /unit-types/:id` · `DELETE /unit-types/:id`

Unpaginated (a handful of size classes). `isActive` filters when given,
otherwise returns both.

```jsonc
// POST /unit-types →
{ "name": "Medium", "volumeM3": 5, "lengthCm": 200, "widthCm": 150, "heightCm": 170,
  "monthlyRate": 650000, "minDurationMonths": 1,
  "weeklyRate": 200000, "supportsWeekly": true, "minDurationWeeks": 1,
  "mediaAssetId": "uuid", "sortOrder": 20 }
// slug is optional — auto-generated from name when omitted, must be
// lowercase-hyphenated and unique if you do supply one.

// ← 201, same shape for GET/PATCH
{ "data": {
  "id": "uuid", "slug": "medium", "name": "Medium",
  "description": null, "descriptionText": null,
  "volumeM3": 5, "dimensions": { "lengthCm": 200, "widthCm": 150, "heightCm": 170 },
  "monthlyRate": 650000, "minDurationMonths": 1,
  "weeklyRate": 200000, "supportsWeekly": true, "minDurationWeeks": 1,
  "image": null, "isActive": true, "sortOrder": 20 } }
```

To attach an image: `POST /admin/media/upload` first (multipart, returns a
`mediaAssetId`), then pass that id here.

### Weekly pricing

`weeklyRate` is **independent of `monthlyRate`** — it's never derived from
it (a short stay costs more per unit of time to service than a month
amortizes to), so set it explicitly for every unit type you opt in.
`supportsWeekly` is the opt-in flag; `minDurationWeeks` is that unit type's
smallest billable weekly duration, falling back to `1` when left `null`.

`weeklyRate`/`supportsWeekly`/`minDurationWeeks` are all optional and every
existing unit type defaults to `supportsWeekly: false`, `weeklyRate: null`,
`minDurationWeeks: null` (month-only, unchanged pricing) until you opt it
in. **Setting `supportsWeekly: true` without a positive `weeklyRate` (here
or already on the record) is a `400`** — this is checked against the
resolved post-merge values, so a `PATCH` that flips only the flag on a unit
type that has never had a rate is caught too, not just a create.

None of this takes effect on the public quote/booking flow until
`supportsWeekly: true` **and** the customer explicitly requests
`durationUnit: "week"` — there's no threshold or auto-switch, see
`docs/storage-integration.md`.

`DELETE /unit-types/:id` returns **409** while any booking (of any status)
or inventory row references it — same "won't silently orphan history" rule
as everywhere else in this module.

## 3. Facilities

`GET /facilities?isActive` · `GET /facilities/:id` · `POST /facilities` ·
`PATCH /facilities/:id` · `DELETE /facilities/:id`

Unpaginated. Same shape as the public `GET /storage/facilities`, plus
`isActive`/`sortOrder` are always writable here (the public endpoint only
ever returns active ones).

```jsonc
// POST /facilities →
{ "name": "Mandana Storage BSD City", "address": "Jl. Letnan Sutopo No. 1, BSD City",
  "area": "BSD City", "city": "Tangerang Selatan", "province": "Banten",
  "latitude": -6.3019, "longitude": 106.6528, "mediaAssetId": "uuid", "sortOrder": 10 }
```

Coordinates are **exact** — no `location-privacy.ts` fuzzing applies to
facilities, unlike `Property`. `DELETE /facilities/:id` returns **409**
while any booking or inventory row references it.

## 4. Inventory — "is this size offered here, at what rate"

`GET /inventory?facilityId&unitTypeId` · `GET /inventory/:id` ·
`POST /inventory` · `PATCH /inventory/:id` · `DELETE /inventory/:id`

Unpaginated. One row per (facility, unit type) pair — config only, not unit
counts (those are derived live from `/admin/storage/units`, see §5).

```jsonc
// POST /inventory →
{ "facilityId": "uuid", "unitTypeId": "uuid",
  "monthlyRateOverride": 700000, "weeklyRateOverride": 220000, "isActive": true }
// Both overrides are optional and independent — set one without the
// other. null (or simply omitted) means "use the unit type's base rate."

// ← 201
{ "data": {
  "id": "uuid", "facilityId": "uuid", "facilitySlug": "bsd-city",
  "unitTypeId": "uuid", "unitTypeSlug": "medium",
  "monthlyRateOverride": 700000, "weeklyRateOverride": 220000, "isActive": true } }
```

A duplicate `(facilityId, unitTypeId)` pair → **409** "Resource already
exists" — there's already a row for that combination, `PATCH` it instead.
Unknown `facilityId`/`unitTypeId` → **404**. `DELETE /inventory/:id`
succeeds even with existing bookings against that pair (bookings snapshot
their own price and don't read inventory after creation) but is blocked
implicitly by the physical units still pointing at it in practice — clear
out `/admin/storage/units` for that pair first if you actually mean to stop
offering it, rather than just setting `isActive: false`.

## 5. Units — the individual physical rows behind the counts

`GET /units?facilityId&unitTypeId&status&page&limit` · `GET /units/:id` ·
`POST /units` · `PATCH /units/:id` · `POST /units/bulk` ·
`DELETE /units/bulk` · `DELETE /units/:id`

Paginated (default `page=1&limit=20`). Every count shown anywhere in this
module — public availability, `total`/`available` — is derived by counting
these rows live; there's no separate stored counter to drift out of sync.
No pricing fields live here — a unit's rate comes from its unit type +
facility's inventory row (§4), not from the physical unit itself.

```jsonc
// POST /units →
{ "facilityId": "uuid", "unitTypeId": "uuid", "code": "M-13",
  "gridColumn": 3, "gridRow": 2, "status": "available" }
// code is a stable, human-facing identifier, unique per facility — never
// renumber an existing one. gridColumn/gridRow/columnSpan/rowSpan are all
// optional; omit until a real floor survey exists (see
// docs/storage-floor-plan-response.md).

// POST /units/bulk → adds capacity fast, codes generated as "<prefix>-<NN>"
{ "facilityId": "uuid", "unitTypeId": "uuid", "count": 8, "codePrefix": "M" }

// DELETE /units/bulk → atomic; 404 naming any id(s) not found, nothing
// deleted if any id is missing
{ "ids": ["uuid1", "uuid2"] }
```

`status` is `available | occupied | maintenance` — deliberately no
`on_hold`: a `pending` booking never reserves a unit (see §6), so a hold
state would never be populated. Setting `status`/`booking_id` directly here
is an escape hatch for corrections; the normal path is the booking
transition endpoints in §6, which manage both automatically.

## 6. Bookings

`GET /bookings?status&facilitySlug&unitTypeSlug&page&limit` ·
`GET /bookings/:id` · `PATCH /bookings/:id/confirm` ·
`PATCH /bookings/:id/reject` · `PATCH /bookings/:id/cancel` ·
`PATCH /bookings/:id/complete`

Paginated, default `page=1&limit=20`. **No `POST /bookings` here** —
customers create bookings publicly (`POST /storage/bookings`); this panel
only reviews and transitions what they submitted.

```jsonc
// GET /bookings/:id →
{ "data": {
  "id": "uuid", "reference": "MDN-STG-7K3XQP", "status": "pending",
  "customerName": "Budi Santoso", "email": "budi@example.com", "phone": "+628123456789",
  "notes": "Barang berupa furnitur dan dus, akses akhir pekan",
  "facilitySlug": "bsd-city", "facilityName": "Mandana Storage BSD City",
  "unitTypeSlug": "medium", "unitTypeName": "Medium", "quantity": 1,
  "startDate": "2026-09-01", "durationMonths": null, "endDate": "2026-09-22",
  "durationUnit": "week", "duration": 3, "unitRate": 200000, "unitLabel": "minggu",
  "monthlyRate": 650000, "subtotal": 600000, "discountAmount": 0, "total": 600000,
  "adminNote": null, "confirmedAt": null, "confirmedByName": null,
  "createdAt": "...", "updatedAt": "..." } }
```

This is a weekly booking, so `durationMonths` is `null` — read
`duration`/`durationUnit`/`unitLabel` instead; they're always present
regardless of which unit was booked. `monthlyRate` is still populated even
here — it's the *reference* monthly rate at booking time, not what was
billed (`unitRate` is what was billed). A monthly booking has
`durationUnit: "month"`, a real `durationMonths`, and `duration ===
durationMonths`.

### Status transitions

Same graph as before weekly pricing — nothing about it changed:

```
pending ──confirm──▶ confirmed ──complete──▶ completed
   │                     │
   └──────reject──┐      └──────cancel──┐
                  ▼                     ▼
              rejected              cancelled
```

All four transition endpoints take an optional body `{ "adminNote": "..." }`
— an empty `{}` or omitted body is fine. `confirm` is the only place
occupancy is claimed: it locks and allocates `quantity` physical units for
that facility + unit type via `SELECT ... FOR UPDATE SKIP LOCKED`, and
returns **409** naming how many are actually left if two admins race for
the last unit. `cancel`/`complete` release whatever units the booking held;
`reject` (from `pending`, before anything was ever claimed) does not. Any
transition attempted from the wrong starting status → **409**.

## 7. Money

All prices are **integer Rupiah**, no decimals. `monthlyRate`/`weeklyRate`/
`monthlyRateOverride`/`weeklyRateOverride`/`unitRate` are all plain JSON
integers — the same convention as everywhere else in this API, avoiding the
`numeric` → string leak `Property.price` has. Use `formatIDRFull`/
`formatIDRShort` (or your local equivalent) for display, never `Number()`
coercion.

A booking's `subtotal`/`discountAmount`/`total` are snapshotted at creation
time and never recomputed — a later rate or policy change never rewrites a
historical booking. **Weekly bookings never discount** —
`discountAmount` is always `0` on one; the duration-discount tiers
(`docs/storage-integration.md`, `POST /storage/quote`) are month-only.

## 8. Errors

Same envelope as the rest of the API:

```jsonc
{ "statusCode": 400, "timestamp": "...", "path": "...",
  "error": { "message": "supportsWeekly requires a positive weeklyRate",
             "error": "Bad Request", "statusCode": 400 } }
```

Expect **404** on any `:id`/slug that doesn't exist, **409** on the
delete-guard/confirm-race/wrong-starting-status cases described above, and
**400** on validation failures (e.g. `supportsWeekly: true` with no rate,
`quantity`/`duration` out of range, a malformed date). A duplicate `slug` or
`(facilityId, unitTypeId)` pair on create/update surfaces as a generic 409
"Resource already exists."
