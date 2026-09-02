# Moving Support — Frontend Integration Guide

Audience: `mandana-web`, `/layanan/moving`. This closes the gap flagged in the
page's build doc: `lib/api/trucks.ts` currently returns a hard-coded
`TRUCK_CLASSES_STUB` and `lib/moving/pricing.ts` computes the price band
entirely client-side. Both now have a real backend counterpart.

## 1. Base URL & type generation

Same as the rest of the API — all routes live under **`/api/v1`**, spec at
**`/docs-json`** (not under the version prefix):

```
openapi-typescript http://localhost:3000/docs-json -o lib/api/schema.d.ts
```

`gen:api` requires a running backend. This module is the first in the repo to
declare `@ApiOkResponse` on every handler, so — unlike the rest of the API
today — the generated types for `/moving/*` describe the real response body,
not `unknown`.

## 2. Response envelope

Same convention as everywhere else: `{ "data": ... }`, no pagination on these
endpoints (the truck list is a handful of rows).

## 3. Endpoints

### `GET /moving/truck-classes` (public)

Powers step 1 of the planner. Always active-only (an optional `isActive`
query param exists but only on the **admin** list — the public endpoint
ignores it and never returns retired classes). Sorted `sortOrder ASC, name ASC`.

```jsonc
{
  "data": [
    {
      "id": "uuid",
      "slug": "pickup-bak",
      "name": "Pick Up Bak",
      "description": "Cocok untuk isi kamar kos atau barang ±3 m³",
      "capacityKg": 1000,
      "volumeM3": 3.5,
      "dimensions": { "lengthCm": 210, "widthCm": 140, "heightCm": 120 },
      "helperCount": 1,
      "baseFare": 250000,
      "perKmFare": 4500,
      "includedKm": 5,
      "minFare": 250000,
      "image": null,
      "isActive": true,
      "sortOrder": 10
    }
  ]
}
```

Notes vs. the FE's original contract sketch:

- **Money is a JSON integer**, not a decimal string. `baseFare`, `perKmFare`,
  and `minFare` are Postgres `integer` columns specifically to avoid the
  `numeric` → string leak that `GET /properties` has today (its `price` field
  comes back `"45000000.00"`). No `Number()` coercion needed on these three.
- `volumeM3` **is** a `numeric` column (needs a fractional part), so it *can*
  arrive as a string from a raw client — the FE's existing type coercion
  habits from the properties endpoints still apply to this one field.
- `dimensions` is `null` unless all three of length/width/height are set —
  don't assume it's always present.
- `image` is `{ url, srcset, alt, width, height } | null` — the same
  `MediaImageDto` shape hero slides and property covers already use, not the
  plain `{ url, alt }` sketched in the original doc. It's a superset (extra
  `srcset`/`width`/`height`), so existing `{url, alt}`-only rendering still
  works; add `srcset` when ready for responsive images.
- No truck classes carry an image yet (seed data has `mediaAssetId: null`).
  Handle `image: null` in the truck card.

**The swap in `lib/api/trucks.ts`** is exactly what the FE's own plan
sketched — call the real endpoint and unwrap `data.data`:

```ts
export async function fetchTruckClasses(): Promise<TruckClassDto[]> {
  const { data, error } = await api.GET("/moving/truck-classes");
  if (error || !data) throw new Error("Failed to fetch truck classes");
  return data.data;
}
```

Do **not** fall back to the stub on failure — show an error card with the
WhatsApp escape hatch, per the page's own failure-mode table.

### `GET /moving/addons` (public) — new

The configurable fee catalog: helper, packaging, extra waiting time,
insurance, and a toll estimate. Active-only, same active-flag convention as
`GET /moving/truck-classes`, sorted `sortOrder ASC, name ASC`.

```jsonc
{
  "data": [
    {
      "id": "uuid",
      "slug": "helper",
      "name": "Helper",
      "description": null,
      "descriptionText": null,
      "kind": "helper",
      "pricingModel": "per_unit",
      "unitPrice": 150000,
      "percentBps": null,
      "minCharge": null,
      "maxCharge": null,
      "unitLabel": "orang",
      "minQty": 1,
      "maxQty": 6,
      "doublesOnRoundTrip": false,
      "image": null,
      "isActive": true,
      "sortOrder": 10
    }
  ]
}
```

**`kind: "toll"` rows are informational only — never render one as a
selectable checkbox.** The toll fee is applied automatically from the
`tollRoute` flag on the quote request (see below); if a client selects it by
slug in `addons[]`, the quote endpoint returns `400`. Use it to show a line
like "estimasi termasuk tol, Rp {unitPrice}/km" next to the toll toggle. As
seeded, this row is `isActive: false` and simply won't appear in this list
until ops turns it on.

Pricing models, so the FE knows how to render each row before it prices
anything client-side:

| `pricingModel` | Uses | Client input needed |
|---|---|---|
| `flat` | `unitPrice` | none — a single checkbox |
| `per_unit` | `unitPrice`, `minQty`, `maxQty`, `unitLabel` | a quantity stepper clamped to `[minQty, maxQty]` |
| `percent` | `percentBps`, `minCharge` | the cart-level `declaredValue` (Rupiah) |

### `GET /moving/pricing-config` (public) — new

The pricing policy previously hardcoded as `MOVING_DEFAULTS` in both repos.
**Fetch this instead of hardcoding a local copy** — see "Constants" below.

```jsonc
{
  "data": {
    "roundToIdr": 10000,
    "bandPct": 10,
    "defaultIncludedKm": 5
  }
}
```

### `POST /moving/quote` (public)

The FE's `lib/moving/pricing.ts` renders an instant preview from the truck
list + addon list + this pricing config (keep it — it's the right UX for step
2). This endpoint makes the **final** number the customer and WhatsApp see
authoritative, so a rate change takes effect without a frontend deploy.

```jsonc
// Request — truckSlug/distanceMeters are all that's required; everything
// else is optional and defaults to "no extras selected".
{
  "truckSlug": "cdd",
  "distanceMeters": 20000,
  "roundTrip": false,
  "tollRoute": true,
  "declaredValue": 50000000,
  "addons": [
    { "slug": "helper", "quantity": 2 },
    { "slug": "waiting-time", "quantity": 3 },
    { "slug": "insurance" }
  ]
}

// 200 response
{
  "data": {
    "truck": { "slug": "cdd", "name": "CDD (Colt Diesel Double)" },
    "distanceKm": 20,
    "includedKm": 5,
    "chargeableKm": 15,
    "roundTrip": false,
    "tripMultiplier": 1,
    "baseFare": 850000,
    "distanceFare": 120000,
    "travelSubtotal": 970000,
    "tollRoute": true,
    "tollFare": 0,
    "addons": [
      { "slug": "helper", "name": "Helper", "kind": "helper", "pricingModel": "per_unit", "quantity": 2, "unitPrice": 150000, "amount": 300000 },
      { "slug": "waiting-time", "name": "Waktu Tunggu Tambahan", "kind": "waiting", "pricingModel": "per_unit", "quantity": 3, "unitPrice": 100000, "amount": 300000 },
      { "slug": "insurance", "name": "Asuransi Barang", "kind": "insurance", "pricingModel": "percent", "quantity": 1, "unitPrice": 0, "amount": 100000 }
    ],
    "addonsTotal": 700000,
    "subtotal": 1670000,
    "total": 1670000,
    "minFareApplied": false,
    "lowEstimate": 1500000,
    "highEstimate": 1840000,
    "currency": "IDR"
  }
}
```

Field notes:

- **`roundTrip`** doubles `distanceFare` (and `tollFare`, if applicable) —
  `tripMultiplier` echoes back `1` or `2`. `baseFare` and every add-on except
  the toll row are charged once regardless.
- **`tollRoute`** (default `true`) says whether `distanceMeters` was computed
  via a toll-road route. **This must match what the FE's own Google Routes
  call actually requested** — send `routeModifiers.avoidTolls: !tollRoute` on
  that call, or `distanceMeters` and `tollFare` below will describe two
  different routes (see `moving-route-distance-proxy.md`). `tollFare` is `0`
  whenever no `toll`-kind addon is active yet (the seeded row starts
  inactive), regardless of `tollRoute` — the flag alone never invents a price.
- **`declaredValue`** (Rupiah) is required only when a `percent`-priced addon
  (currently just `insurance`) is in `addons[]`; omit it otherwise. Missing it
  while `insurance` is selected → `400`.
- **`minFareApplied`** only ever reflects `travelSubtotal` (`baseFare +
  distanceFare`) against the truck's `minFare` — add-ons and toll are never
  absorbed into the minimum, they're always added on top.
- `addons[]` in the response is the priced breakdown for display — one line
  per requested slug, in the order the pricing engine processed them (not
  necessarily request order).

`distanceMeters` is an input, not coordinates — reuse whatever distance the
FE's own Google Routes call (or its Next.js proxy) already produced. If/when
that proxy moves server-side (see §5), this DTO is designed to grow an
optional `origin`/`destination` alternative without breaking this shape.

Errors: unknown or inactive `truckSlug` → `404`. Unknown/inactive addon slug →
`404`, naming the missing slug(s). A `toll`-kind slug in `addons[]` → `400`.
Duplicate addon slug → `400`. `insurance` (or any `percent` addon) selected
without `declaredValue` → `400`. `distanceMeters` outside `[1, 5_000_000]` or
non-integer → `400` (global `ValidationPipe`, `forbidNonWhitelisted: true` —
extra body fields also 400).

**Recommended flow:** call this once distance + truck + any selected add-ons
are set (same trigger point the FE already debounces Routes calls on), and
render `total` / `lowEstimate` / `highEstimate` in place of the
client-computed preview before building the WhatsApp message. Treat the
client preview as instant feedback only, never as the number that ships in
the WA text.

**Constants — fetch, don't hardcode.** `moving-pricing.ts`'s exported
*function bodies* are still mirrored byte-for-byte in `lib/moving/pricing.ts`
— changing the math on one side without the other silently desyncs the
preview from the quote. The **numbers** are a different story now: `GET
/moving/pricing-config` and `GET /moving/addons` are the source of truth for
`roundToIdr` / `bandPct` / `defaultIncludedKm` and every fee rate. Delete any
locally hardcoded copy of `MOVING_DEFAULTS` in the frontend and pass the
fetched config as the 3rd argument to `movingQuote()` client-side instead —
that removes the "remember to change both repos" hazard for every value
except the math itself.

### POST /moving/leads (public) — new

Persists the order a customer configured — truck, pickup, an ordered list of
destinations, add-ons, and the priced result — the moment they click "Pesan
via WhatsApp", before the real conversation/confirmation happens over
WhatsApp with a human. This is the fix for the "No lead capture" gap
previously flagged in §5.

Same request shape as `POST /moving/quote` (identical `truckSlug` /
`distanceMeters` / `roundTrip` / `tollRoute` / `declaredValue` / `addons`
fields and validation — this endpoint literally extends `QuoteMovingDto` and
prices through the same server-side path), plus `pickup` and `destinations`:

```jsonc
// Request
{
  "truckSlug": "cdd",
  "distanceMeters": 45000,
  "roundTrip": false,
  "tollRoute": true,
  "pickup": {
    "address": "Jl. Sudirman No. 1, Jakarta Selatan",
    "lat": -6.2088,
    "lng": 106.8231
  },
  "destinations": [
    { "address": "Jl. Gatot Subroto, Jakarta Selatan", "lat": -6.2297, "lng": 106.8253 },
    { "address": "BSD City, Tangerang Selatan", "lat": -6.3021, "lng": 106.6528 },
    { "address": "Bogor Kota", "lat": -6.5971, "lng": 106.8060 }
  ]
}

// 201 response
{
  "data": {
    "id": "uuid",
    "reference": "MDN-MOV-A7K92X",
    "status": "new",
    "truckSlug": "cdd",
    "truckName": "CDD (Colt Diesel Double)",
    "pickupAddress": "Jl. Sudirman No. 1, Jakarta Selatan",
    "pickupLat": -6.2088,
    "pickupLng": 106.8231,
    "destinations": [
      { "stopIndex": 0, "address": "Jl. Gatot Subroto, Jakarta Selatan", "lat": -6.2297, "lng": 106.8253 },
      { "stopIndex": 1, "address": "BSD City, Tangerang Selatan", "lat": -6.3021, "lng": 106.6528 },
      { "stopIndex": 2, "address": "Bogor Kota", "lat": -6.5971, "lng": 106.8060 }
    ],
    "distanceKm": 45,
    "includedKm": 5,
    "chargeableKm": 40,
    "roundTrip": false,
    "tollRoute": true,
    "declaredValue": null,
    "baseFare": 850000,
    "distanceFare": 320000,
    "travelSubtotal": 1170000,
    "tollFare": 0,
    "addons": [],
    "addonsTotal": 0,
    "subtotal": 1170000,
    "total": 1170000,
    "minFareApplied": false,
    "lowEstimate": 1050000,
    "highEstimate": 1290000,
    "currency": "IDR",
    "customerName": null,
    "phone": null,
    "email": null,
    "createdAt": "2026-09-02T04:00:00.000Z"
  }
}
```

Field notes:

- **`destinations`** accepts 1–25 entries (no product limit — the array cap
  is only an abuse guard, mirroring the existing `addons` field's own cap).
  Order is preserved as `stopIndex`. Pricing is unaffected by stop count —
  it still runs on the single `distanceMeters` total, same math as
  `POST /moving/quote` (Rp/km pricing doesn't care how many stops produced
  that total).
- **`customerName`/`phone`/`email`** are optional and not currently sent by
  the Moving Support page (it collects no contact fields) — future-proofing,
  not a requirement.
- No `whatsappMessage` in the response, unlike Storage/Event Support's quote
  endpoints — for Moving Support the WA message is still assembled entirely
  client-side and this call fires fire-and-forget alongside it, not before
  it, so the server-generated `reference` isn't available in time to embed
  in the WA text (a known, accepted limitation — admin correlates a WhatsApp
  conversation to this record by timestamp + route/price).
- Errors mirror `POST /moving/quote` exactly, since this reuses the same
  validated pricing path: unknown/inactive `truckSlug` → `404`. Unknown/
  inactive addon slug → `404`. A `toll`-kind slug in `addons[]` → `400`.
  Duplicate addon slug → `400`. `insurance` (or any `percent` addon)
  selected without `declaredValue` → `400`. Additionally: empty
  `destinations` → `400` (`ArrayMinSize`).

## 4. Admin endpoints (not needed by the public page, for completeness)

```
GET    /admin/moving/truck-classes            includes inactive; ?isActive=true|false
GET    /admin/moving/truck-classes/:id
POST   /admin/moving/truck-classes
PATCH  /admin/moving/truck-classes/:id
DELETE /admin/moving/truck-classes/:id         204

GET    /admin/moving/addons                    includes inactive; ?isActive=true|false
GET    /admin/moving/addons/:id
POST   /admin/moving/addons
PATCH  /admin/moving/addons/:id
DELETE /admin/moving/addons/:id                204

GET    /admin/moving/settings                  singleton — GET/PATCH only, no :id
PATCH  /admin/moving/settings

GET    /admin/moving/leads                     paginated; ?status=new|contacted|converted|lost
GET    /admin/moving/leads/:id                  includes destinations + add-on lines
PATCH  /admin/moving/leads/:id                  status/adminNote only — no confirm/reject flow, nothing here is reserved
```

Bearer JWT, `role: admin`. Attach an image the same way hero slides do:
upload via the existing `POST /admin/media/upload`, then pass the returned
`mediaAssetId` in the create/update body.

**Add-on cross-field rules**, enforced server-side (not encodable purely in
class-validator, so they 400 from the service instead): `pricingModel:
"percent"` requires `percentBps > 0`; `flat`/`per_unit` require `unitPrice >
0`; `maxQty` must be `>= minQty`; activating a second `kind: "toll"` row while
one is already active → `409` (at most one toll rate can be live at a time).

## 5. Known gaps — flagged, not built in this phase

- **The Google Routes distance proxy stays in the frontend's own Next.js
  route handler** (`/api/moving/route-distance`) for now. See
  [`moving-route-distance-proxy.md`](./moving-route-distance-proxy.md) for the
  design if/when it's worth moving server-side — the short version is that a
  server-side proxy can cache repeated coordinate pairs in Redis, which a
  per-instance Next.js handler structurally can't do as well.

## 6. Prerequisites

- Migration `1786500000000-AddMovingTruckClasses` seeds four standard
  Indonesian truck classes (`pickup-bak`, `cde`, `cdd`, `fuso`) matching the
  slugs the FE's stub already assumed, so `?truck=<slug>` deep links keep
  working on swap day. **Every seeded fare is a placeholder** pending sign-off
  from ops — check current values via `GET /admin/moving/truck-classes`
  before relying on them for anything beyond development.
- Migration `1787100000000-AddMovingAddonsAndSettings` seeds the pricing
  policy singleton at today's exact defaults (`roundToIdr: 10000, bandPct:
  10, defaultIncludedKm: 5` — behavior-neutral) and six add-ons: `helper`,
  `packaging-basic`, `packaging-full`, `waiting-time`, `insurance` (all
  active), and `toll-estimate` (seeded **inactive** — turn it on via `PATCH
  /admin/moving/addons/:id` once the per-km rate is checked against real
  receipts). **Every seeded rate here is also a placeholder**, same caveat as
  the truck classes above.
- Migration `1787600000000-AddMovingLeads` creates `moving_leads`,
  `moving_lead_stops`, and `moving_lead_addons` (plus the
  `moving_leads_status_enum` type) for the lead-capture endpoint in §3 above.
  No seed data — an empty transactional table.
- No new env vars for this phase.
