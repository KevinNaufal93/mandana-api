# Moving Support — Web Admin Integration Guide

Audience: the admin panel — truck-class and add-on catalog management for
the Moving Support ("Mandana Move") module, the pricing-policy singleton,
and reviewing bookings captured from the public quote page. See
[`docs/moving-integration.md`](./moving-integration.md) for the public
catalog/quote/booking-capture contract this data feeds.

## 1. Base URL, auth & response envelope

All routes live under `/api/v1/admin/moving`, spec at `/docs-json` (tagged
`admin / moving`). Every route requires a Bearer token for a user with the
`admin` role — `Authorization: Bearer <token>` from `POST /api/v1/auth/login`;
a non-admin (`editor`) token gets **403**. Responses use the same envelope
as everywhere else: `{ "data": ... }`, or `{ "data": [...], "meta": { total,
page, limit, totalPages } }` on the one paginated list.

**Which lists paginate — this module is the inverse of Event Support.**
Truck classes and add-ons are small admin-curated catalogs: both list
endpoints are unpaginated plain arrays, filterable only by
`?isActive=true|false` (omit it to get both active and inactive rows —
sending anything other than the literal string `true` is treated as
`false`, not rejected). Settings is a GET/PATCH singleton with no list at
all. **Only `/bookings` paginates** (default `page=1&limit=12`, max
`limit=100`) — it's the one surface here that grows unbounded. Build your
truck-class and add-on screens as plain tables, not paginated grids.

## 2. Truck classes

`GET /truck-classes?isActive` · `GET /truck-classes/:id` ·
`POST /truck-classes` · `PATCH /truck-classes/:id` ·
`DELETE /truck-classes/:id`

Sorted `sortOrder ASC, name ASC` on every read.

```jsonc
// POST /truck-classes →
{
  "name": "Pick Up Bak",
  "description": "<p>Cocok untuk isi kamar kos atau barang &plusmn;3 m&sup3;</p>",
  "capacityKg": 1000, "volumeM3": 3.5,
  "lengthCm": 210, "widthCm": 140, "heightCm": 120, "helperCount": 1,
  "baseFare": 250000, "per500mFare": 2250, "includedKm": 5, "minFare": 250000,
  "mediaAssetId": "uuid", "sortOrder": 10
}
// Only name/baseFare/per500mFare are required — everything else is optional.
// slug is auto-generated from name when omitted; if you supply your own
// (lowercase, hyphenated) and it collides, it's silently suffixed "-2",
// "-3", ... — there's no 409 on a duplicate slug. Read back `data.slug`
// rather than assuming the value you sent stuck.

// ← 201, same shape for GET/PATCH
{ "data": {
  "id": "uuid", "slug": "pickup-bak", "name": "Pick Up Bak",
  "description": "<p>...</p>",
  "descriptionText": "Cocok untuk isi kamar kos atau barang ±3 m³",
  "capacityKg": 1000, "volumeM3": 3.5,
  "dimensions": { "lengthCm": 210, "widthCm": 140, "heightCm": 120 },
  "helperCount": 1,
  "baseFare": 250000, "per500mFare": 2250, "includedKm": 5, "minFare": 250000,
  "mediaAssetId": "uuid",
  "image": { "url": "...", "srcset": "...", "srcsetAvif": "", "placeholder": "data:image/webp;base64,...", "alt": null, "width": 800, "height": 600 },
  "isActive": true, "sortOrder": 10 } }
```

What the rate-card fields drive on a customer quote (`docs/moving-integration.md`
has the full math):

| Field | Drives |
|---|---|
| `baseFare` | Flat Rupiah charged on **every leg** of a trip, covering up to `includedKm` — a 3-stop move pays this three times, once per leg. |
| `per500mFare` | Rupiah per whole **500 m step** charged beyond `includedKm`, per leg, rounded **up** — 5.001 km against a 5 km allowance bills 1 step, 5.500 km still bills 1, 5.501 km bills 2. The 500 m step size is fixed in the pricing engine, not admin-tunable. |
| `includedKm` | Km included in `baseFare` before `per500mFare` applies, per leg. Leave `null` to fall back to the settings singleton's `defaultIncludedKm` (§4). |
| `minFare` | Floors the trip-wide `travelSubtotal` **once**, after summing every leg — never applied per leg. |

Three things to get right before you build the edit screen:

- **Renaming silently changes the public slug.** `PATCH` regenerates the
  slug whenever the body contains **either** `name` or `slug` — even a
  name-only edit. Send the existing `slug` explicitly alongside a `name`
  change if you want it to survive; a collision is suffixed `-2`/`-3`
  silently, never a 409. This matters because the public doc promises
  `?truck=<slug>` deep links keep working, and because past bookings
  snapshot `truckSlug` as a plain string (§6) — a silent re-slug desyncs both.
- **`mediaAssetId` ↔ `image`.** Bind your image picker's value to
  `mediaAssetId` (the raw id) and render the preview from `image` (the
  built `{ url, srcset, ... }` projection of that same asset) — they
  describe one attached row, not two independent fields. `PATCH {
  "mediaAssetId": null }` detaches it; omitting the key entirely leaves
  whatever's attached unchanged. Upload first via `POST /admin/media/upload`
  (`purpose: "cover"` fits a truck photo), then pass the returned id here —
  see [`docs/web-admin-integration-guide.md`](./web-admin-integration-guide.md)
  §2/§3 for the full upload-then-attach flow and the shared image component;
  it's identical here.
- **`DELETE` is an unguarded hard delete.** It returns **204** even if 500
  bookings reference that truck by slug — there's no 409, nothing blocks it.
  Deliberate, not an oversight — see §6 for why.

## 3. Add-ons

`GET /addons?isActive` · `GET /addons/:id` · `POST /addons` ·
`PATCH /addons/:id` · `DELETE /addons/:id`

```jsonc
// POST /addons →
{
  "name": "Helper", "kind": "helper", "pricingModel": "per_unit",
  "unitPrice": 150000, "unitLabel": "orang", "minQty": 1, "maxQty": 6,
  "doublesOnRoundTrip": false, "mediaAssetId": null, "sortOrder": 10
}
// name/kind/pricingModel are always required. unitPrice is required (and
// must be > 0 — Swagger's documented "minimum: 0" is wrong; 0 itself is
// rejected) for flat/per_unit; percentBps is required (and must be > 0)
// for percent. Whichever one your chosen pricingModel doesn't use may be
// omitted.

// ← 201, same shape for GET/PATCH
{ "data": {
  "id": "uuid", "slug": "helper", "name": "Helper",
  "description": null, "descriptionText": null,
  "kind": "helper", "pricingModel": "per_unit",
  "unitPrice": 150000, "percentBps": null, "minCharge": null, "maxCharge": null,
  "unitLabel": "orang", "minQty": 1, "maxQty": 6, "doublesOnRoundTrip": false,
  "mediaAssetId": null, "image": null,
  "isActive": true, "sortOrder": 10 } }
```

| `kind` | Behavior |
|---|---|
| `helper`, `packaging`, `waiting`, `other` | Priced like any ordinary catalog line — quantity comes from the customer's request, clamped to `[minQty, maxQty]` for `per_unit`. |
| `insurance` | Always `percent` in practice — `amount = round(declaredValue * percentBps / 10_000)`, floored/capped by `minCharge`/`maxCharge`. The quote UI must collect `declaredValue` whenever an addon of this kind is selected, or the quote 400s. |
| `toll` | The one behaviorally special kind. **Never client-selectable** — a customer picking it by slug in a quote's `addons[]` gets `400`; it's applied automatically from the quote's `tollRoute` flag instead. Its `per_unit` "quantity" is the trip's total distance in km, not a customer-chosen number. **At most one `toll` row may be active at a time** — activating a second (on create, or flipping an existing row's `isActive` to `true`) returns **409**, naming the row that's already live. |

**Cross-field rules, enforced server-side (400, not encodable in
class-validator alone):** `pricingModel: "percent"` requires `percentBps >
0`; `flat`/`per_unit` require `unitPrice > 0`; `maxQty` must be `>= minQty`.
On `PATCH`, these are checked against the **merged** result of your partial
body and the row's current values — so switching `pricingModel` from
`percent` to `per_unit` without also sending a `unitPrice` fails, because
the stored `unitPrice` is `0` from when it was a percent row.

Same slug-regeneration and unguarded-hard-delete behavior as truck classes
(§2) applies here — renaming an add-on changes its slug silently, and
`DELETE` never checks whether any booking's `addons[]` references it.

## 4. Settings singleton

`GET /settings` · `PATCH /settings` — no `:id`, no `POST`, no `DELETE`.

```jsonc
// GET → 200 / PATCH → 200 (body: any subset of these fields)
{ "data": {
  "roundToIdr": 10000,
  "bandPct": 10,
  "defaultIncludedKm": 5 } }
```

| Field | Meaning |
|---|---|
| `roundToIdr` | The step every quote's `total`/`lowEstimate`/`highEstimate` rounds to. Per-leg figures inside a quote's `legs[]` are never rounded. |
| `bandPct` | The ± percentage band shown around `total` as `lowEstimate`/`highEstimate`. `0` collapses both onto `total` exactly. |
| `defaultIncludedKm` | Fallback included-km used per leg when a truck class leaves its own `includedKm` unset (§2). |

This row **auto-seeds** the first time it's read if missing (from
`roundToIdr: 10_000, bandPct: 10, defaultIncludedKm: 5`) — `GET /settings`
can never 404.

Changing any of this **reprices every subsequent quote and booking capture
immediately** — no deploy, no cache to bust. It changes **nothing** about a
booking already captured: every booking snapshots its own priced figures at
submission time (§6). The public `GET /moving/pricing-config` serves this
same row read-only, so the customer-facing preview picks up a change the
moment you save it here.

## 5. Bookings

`GET /bookings?status&search&from&to&sortBy&sortOrder&page&limit` ·
`GET /bookings/:id` · `PATCH /bookings/:id` (adminNote only) ·
`PATCH /bookings/:id/confirm` · `PATCH /bookings/:id/reject` ·
`PATCH /bookings/:id/cancel` · `PATCH /bookings/:id/complete`

See [`docs/booking-list-contract.md`](./booking-list-contract.md) for the
query-param conventions shared with Smart Storage and Event Support
(pagination, `search`, the Jakarta-day `from`/`to` semantics, `sortBy`/
`sortOrder`). This section covers only what's specific to Moving.

```jsonc
// GET /bookings?status=pending&search=budi&from=2026-09-01&to=2026-09-03 →
{
  "data": [
    {
      "id": "uuid", "reference": "MDN-MOV-A7K92X", "status": "pending",
      // ...every field from the public MovingBookingDto (destinations[],
      // legs[], addons[], every priced figure) — see
      // moving-integration.md §3's POST /moving/bookings response — plus:
      "adminNote": null,
      "confirmedAt": null,
      "confirmedByName": null,
      "updatedAt": "2026-09-02T04:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 12, "totalPages": 1 }
}
```

`sortBy` accepts `createdAt` (default), `reference`, or `total`. There is no
`startDate`/window sort here — unlike Storage/Event, a booking has no rental
window of its own to sort by.

**Status is a real state machine now**, matching Storage's graph exactly
(including the same five values — Moving picked up `rejected` alongside
Storage/Event's `pending`/`confirmed`/`cancelled`/`completed`, replacing the
old CRM-only `new`/`contacted`/`converted`/`lost`):

```
pending ──confirm──▶ confirmed ──complete──▶ completed
   │                     │
   └──reject──▶ rejected └──cancel──▶ cancelled
```

Each transition takes an optional `{ "adminNote": "..." }` body and returns
the full updated booking. Calling one from the wrong starting status is
**409** (`"Booking MDN-MOV-... is confirmed, cannot reject"`) — the same
shape as Storage's and Event Support's transition errors. `confirm` also
stamps `confirmedAt`/`confirmedByName` from the acting admin. **Unlike
Storage/Event, none of these four transitions touch inventory** — Moving
reserves nothing, so there's no 409 from a stock shortfall, only from an
illegal status change.

`PATCH /bookings/:id` (no suffix) is now **adminNote-only** — sending
`status` in that body is a **400** (the global `ValidationPipe` rejects
unrecognized fields), not a silent no-op. Change status exclusively through
the four transition routes above.

```jsonc
// PATCH /bookings/:id/confirm → { "adminNote": "Dikonfirmasi via telepon" }
// ← 200, full booking with status: "confirmed", confirmedAt/confirmedByName set
```

Each list row is the **complete** booking object — destinations, add-ons,
and the per-leg price breakdown included — so no separate detail fetch is
needed to render a row, but it does mean a high `?limit` on multi-stop
bookings is a heavier response than the equivalent Event Support booking
row. Still no `POST` here — a booking is only ever created by the public
quote-and-WhatsApp flow — and no `DELETE`.

## 6. What a booking snapshots, and why

Every price field on a booking — `baseFare`, `distanceFare`, `travelSubtotal`,
`total`, every `legs[]` entry, every `addons[]` line — plus `truckSlug` and
`truckName` themselves, is a **point-in-time snapshot**, computed once via
the exact same pricing path `POST /moving/quote` uses, at the moment the
customer clicked "Pesan via WhatsApp." None of it is a live join back to the
catalog:

- There is **no foreign key** from a booking to `truck_classes`, and none
  from a booking's add-on lines to `moving_addons`. `truckSlug`/`truckName`
  are copied strings; each add-on line copies its own
  `name`/`unitPrice`/`amount` at the moment it was priced.
- This is exactly why §2/§3's `DELETE` is unguarded: a real foreign key
  would permanently block deleting a truck class or add-on that any booking
  ever referenced (or force a soft-delete dance). The snapshot design means
  catalog cleanup and booking history never fight each other.
- The flip side: a booking can point at a `truckSlug` that's since been
  renamed, deactivated, or deleted outright, and there is no join path to
  repair or even detect that from the booking alone. Don't build a "click
  through to the truck class" link on a booking row — there may be nothing
  on the other end.
- A later change to a rate card, an add-on's price, or the settings
  singleton (§4) **never** rewrites a number on an already-captured booking.
  If a customer disputes a quoted price, the booking's own stored fields are
  the source of truth, not a live recalculation.
- `chargeableSteps` (trip-level and per `legs[]` entry) is `null` on a
  booking captured before 500 m step pricing shipped — those were priced
  per kilometre, so a step count doesn't apply and was deliberately not
  back-filled from `chargeableKm` (a rounded display value can't recover it
  exactly). Treat `null` as "pre-migration," not as a data bug.

## 7. Money

Integer Rupiah everywhere, never decimals. Two footguns worth knowing
before you build a rate-editing form:

- **`percentBps` is basis points, not a percent.** The seeded `insurance`
  add-on has `percentBps: 20` — that's **0.20%**, not 20%.
  `amount = round(declaredValue * percentBps / 10_000)`.
- **`bandPct` (§4) is a whole percent, not basis points** — `10` means
  ±10%. Same module, two different scales for what look like the same kind
  of field; don't carry one's convention onto the other.
- `minFare` (§2) floors the trip-wide `travelSubtotal` **once**, after
  summing every leg — never per leg, and never absorbing toll or add-on
  charges (those are always added on top of the floored amount).
- `per500mFare` is Rupiah per whole **500 m step**, rounded up, applied per
  leg beyond that leg's own `includedKm` — **not** a per-kilometre rate.
  **Label the rate-card input "Tarif per 500 m", never "per km"** — a stale
  "per km" label above this value is exactly how ops ends up doubling every
  price on a truck class by mistake.

## Errors

Same envelope as the rest of the API:

```jsonc
{ "statusCode": 409, "timestamp": "...", "path": "...",
  "error": { "message": "...", "error": "Conflict", "statusCode": 409 } }
```

**409** fires from two unrelated places: activating a second active
`kind: "toll"` add-on (§3), and calling a booking transition (§5) from the
wrong starting status. Explicitly: **there is still no delete-time 409
anywhere in Moving**, unlike Event Support's category/item deletes — and
Moving's transition 409s never involve inventory, unlike Storage's/Event's
(nothing here is reserved). **400** comes from the add-on cross-field rules
(§3) and from every ordinary DTO validator — an out-of-range `sortOrder`, a
malformed `from`/`to`, an unknown `status`, a `unitPrice`/`percentBps` of
`0`, or a `status` key sent to the adminNote-only `PATCH /bookings/:id`
(§5). **404** on any `:id` that doesn't resolve. A duplicate `slug` you
supply yourself never 409s — it's silently suffixed `-2`, `-3`, ... (§2/§3)
— read back `data.slug` after create if you need to know what actually
landed.
