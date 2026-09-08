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
      "per500mFare": 2250,
      "includedKm": 5,
      "minFare": 250000,
      "mediaAssetId": null,
      "image": null,
      "isActive": true,
      "sortOrder": 10
    }
  ]
}
```

Notes vs. the FE's original contract sketch:

- **Money is a JSON integer**, not a decimal string. `baseFare`, `per500mFare`,
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
- `mediaAssetId` (the raw attached-asset id, alongside the built `image`
  object) is present on this response mainly for the **admin** panel's
  benefit — see [`moving-admin-integration.md`](./moving-admin-integration.md) §2
  — but it's the same mapper for both surfaces, so the public page gets it
  too. Safe to ignore here; nothing about `image` changed.

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
      "mediaAssetId": null,
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

There is no client-side pricing preview — `mandana-web` deleted its local
copy (`lib/moving/pricing.ts`) on 2026-08-12 after it verifiably drifted from
this endpoint's rounding rule. This endpoint is the **sole** source of truth
for price; the frontend calls it and renders whatever comes back, so a rate
change takes effect without a frontend deploy.

`baseFare` and `includedKm` apply **once per trip, on the first leg only**
(array index 0). Every leg after the first has no allowance at all — its
entire distance bills in whole **500 m steps, rounded up**, from the first
metre. See "Multi-leg pricing" below and `chargeableSteps`.

```jsonc
// Request — truckSlug/legs are all that's required; everything else is
// optional and defaults to "no extras selected". legs is an ORDERED array,
// one entry per hop (pickup→stop1, stop1→stop2, ...) — send one entry for a
// single destination.
{
  "truckSlug": "cdd",
  "legs": [{ "distanceMeters": 20000 }],
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
    "chargeableSteps": 30,
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
    "legs": [
      { "distanceKm": 20, "includedKm": 5, "chargeableKm": 15, "chargeableSteps": 30, "baseFare": 850000, "distanceFare": 120000, "subtotal": 970000 }
    ],
    "currency": "IDR"
  }
}
```

Field notes:

- **`legs`** — **only the first leg (array index 0) gets `baseFare` and the
  `includedKm` allowance.** It's priced exactly like a single-destination
  trip: the flat `baseFare` covers up to `includedKm`, and only the excess
  bills in 500 m steps. **Every leg after the first has no `baseFare` and no
  allowance at all** — its entire distance bills in 500 m steps from the
  first metre, which is usually *more* expensive per km than the first leg,
  not less. See "Multi-leg pricing" below for the worked example and the
  reasoning. `distanceKm` / `includedKm` / `chargeableKm` / `chargeableSteps`
  / `baseFare` / `distanceFare` / `travelSubtotal` at the top level are all
  **sums across `legs[]`** — for a single-leg request, sum-of-one is
  numerically identical to a plain single-destination quote, so that price
  never moves. The response's `legs[]` array is unrounded — only `total` /
  `lowEstimate` / `highEstimate` are rounded — and deliberately has no
  per-leg `minFareApplied` (see `minFareApplied` note below).
- **`chargeableSteps`** — whole 500 m steps billed on a leg, rounded **up**,
  counted from that leg's *raw* metres (not from the 0.1-km-rounded
  `chargeableKm`) — against the first leg's excess over `includedKm`, or
  against a later leg's entire distance. This is the multiplicand behind
  `distanceFare`, not `chargeableKm` — the two can legitimately disagree:
  40 m of excess on the first leg displays `chargeableKm: 0` but still bills
  one step. Against a 5 km allowance: 5.000 km is 0 steps, 5.001 km is 1,
  5.500 km is still 1, 5.501 km is 2.
- **`roundTrip`** — see "Round trip + multiple legs" right below; it's not a
  flat "doubles distance" rule once there's more than one leg.
- **`tollRoute`** (default `true`) says whether the trip was computed via a
  toll-road route. **This must match what the FE's own Google Routes call
  actually requested** — send `routeModifiers.avoidTolls: !tollRoute` on
  that call, or the quoted legs and `tollFare` below will describe two
  different routes (see `moving-route-distance-proxy.md`). `tollFare` is `0`
  whenever no `toll`-kind addon is active yet (the seeded row starts
  inactive), regardless of `tollRoute` — the flag alone never invents a price.
- **`declaredValue`** (Rupiah) is required only when a `percent`-priced addon
  (currently just `insurance`) is in `addons[]`; omit it otherwise. Missing it
  while `insurance` is selected → `400`.
- **`minFareApplied`** only ever reflects the summed `travelSubtotal`
  (`baseFare + distanceFare` across every leg) against the truck's
  `minFare`, applied **once**, after summing — never per leg. The first leg
  already carries a de facto floor of its own (`baseFare`, paid flat
  regardless of distance); a per-leg floor on top of that would
  double-count, and every leg after the first has no `baseFare` to floor in
  the first place — it's pure metered distance. This is why there's no
  `minFareApplied` field inside each `legs[]` entry — it would be
  structurally meaningless at that level. Add-ons and toll are never
  absorbed into the minimum either way, they're always added on top.
- A non-`toll` kind (including any future addon kind) is never rejected by
  kind in `addons[]` — only `toll` is (see below).
- `addons[]` in the response is the priced breakdown for display — one line
  per requested slug, in the order the pricing engine processed them (not
  necessarily request order).

#### Round trip + multiple legs — read this before assuming anything

`roundTrip: true` behaves differently depending on leg count:

- **`legs.length === 1`** (single destination — unchanged from before this
  endpoint took `legs[]`): that one leg's `distanceFare` is doubled;
  `baseFare` is not. `tripMultiplier` echoes `2`.
- **`legs.length > 1`** (multi-stop): `roundTrip: true` does **NOT** double
  any leg's distance fare — `tripMultiplier` echoes `1` regardless of the
  flag. Want the return trip priced? Add it as its own explicit entry at the
  end of `legs[]` (e.g. last stop → pickup); it prices like any other
  non-first leg — no `baseFare`, no allowance, its full distance bills in
  500 m steps — this is deliberate, not a gap: doubling every leg would mean
  retracing every stop in reverse, which overstates a real direct return
  trip.
- **Toll and any add-on with `doublesOnRoundTrip: true`** are unaffected by
  leg count — they double whenever the bare `roundTrip` flag is `true`,
  exactly as always, independent of how many legs there are. So `roundTrip`
  is still worth sending on a multi-stop quote even without an explicit
  return leg, if you want toll/addon doubling.

Don't assume `roundTrip: true` alone doubles a multi-stop trip's distance the
way it does for a single destination — it doesn't.

Errors: unknown or inactive `truckSlug` → `404`. Unknown/inactive addon slug →
`404`, naming the missing slug(s). A `toll`-kind slug in `addons[]` → `400`
(any other kind prices normally, never rejected by kind). Duplicate addon
slug → `400`. `insurance` (or any `percent` addon) selected without
`declaredValue` → `400`. `legs` must be a non-empty array of 1–26 entries,
each `{ distanceMeters }` an integer in `[1, 5_000_000]` → `400` otherwise
(global `ValidationPipe`, `forbidNonWhitelisted: true` — a bare top-level
`distanceMeters` is now an unrecognized field and also `400`s).

**Recommended flow:** call this once distance + truck + any selected add-ons
are set (same trigger point the FE already debounces Routes calls on), and
render `total` / `lowEstimate` / `highEstimate` in place of the
client-computed preview before building the WhatsApp message. Treat the
client preview as instant feedback only, never as the number that ships in
the WA text.

**Constants — fetch, don't hardcode.** There is no frontend copy of the
pricing math to keep in sync (see above) — but `GET /moving/pricing-config`
and `GET /moving/addons` remain the source of truth for `roundToIdr` /
`bandPct` / `defaultIncludedKm` and every fee rate, for any UI (e.g. an admin
preview) that wants to display them without hardcoding a copy that can drift
when ops changes a rate.

### POST /moving/bookings (public)

Persists the order a customer configured — truck, pickup, an ordered list of
destinations, add-ons, and the priced result — the moment they click "Pesan
via WhatsApp", before the real conversation/confirmation happens over
WhatsApp with a human. This is the fix for the "No lead capture" gap
previously flagged in §5.

> **Renamed from `POST /moving/leads`.** The underlying record (and the
> admin review screen) moved from free-form CRM triage to the same
> `pending → confirmed/rejected → cancelled/completed` state machine Storage
> and Event Support use — see `docs/moving-admin-integration.md` §5.

Same request shape as `POST /moving/quote` (identical `truckSlug` / `legs` /
`roundTrip` / `tollRoute` / `declaredValue` / `addons` fields and validation
— this endpoint literally extends `QuoteMovingDto` and prices through the
same server-side path), plus `pickup` and `destinations`:

```jsonc
// Request — 3 destinations, so legs has 3 entries: pickup→dest1, dest1→dest2,
// dest2→dest3. Same 45,000m total road distance as this doc's previous
// (pre-per-leg) example, split into its real legs instead of pre-summed.
{
  "truckSlug": "cdd",
  "legs": [
    { "distanceMeters": 15000 },
    { "distanceMeters": 20000 },
    { "distanceMeters": 10000 }
  ],
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
  ],
  "notes": "Barang mudah pecah, tolong hati-hati. Butuh 2 orang angkat ke lantai 3."
}

// 201 response
{
  "data": {
    "id": "uuid",
    "reference": "MDN-MOV-A7K92X",
    "status": "pending",
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
    "chargeableSteps": 80,
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
    "legs": [
      { "distanceKm": 15, "includedKm": 5, "chargeableKm": 10, "chargeableSteps": 20, "baseFare": 850000, "distanceFare": 80000, "subtotal": 930000 },
      { "distanceKm": 20, "includedKm": 0, "chargeableKm": 20, "chargeableSteps": 40, "baseFare": 0, "distanceFare": 160000, "subtotal": 160000 },
      { "distanceKm": 10, "includedKm": 0, "chargeableKm": 10, "chargeableSteps": 20, "baseFare": 0, "distanceFare": 80000, "subtotal": 80000 }
    ],
    "currency": "IDR",
    "customerName": null,
    "phone": null,
    "email": null,
    "notes": "Barang mudah pecah, tolong hati-hati. Butuh 2 orang angkat ke lantai 3.",
    "createdAt": "2026-09-02T04:00:00.000Z"
  }
}
```

#### Multi-leg pricing — one flat fee, then pure metered distance

Only the **first** leg (`legs[0]`) gets `baseFare` and the `includedKm`
allowance — priced exactly like a single-destination trip. Every leg after
the first gets neither: its entire distance bills in 500 m steps from the
first metre, no free km, no separate flat fee. This models a crew that
charges one dispatch/first-stop fee for the job, then bills pure distance
for every additional stop after that — it does **not** mean "three stops
means three flat fees."

In the example above, `travelSubtotal` (**1,170,000**) happens to land on
exactly what a single continuous 45 km trip would cost (`baseFare 850,000` +
`(45−5) km` of steps `= 320,000`) — splitting one route into legs doesn't
change the price as long as the split points fall on clean 500 m
boundaries. It generally can't come out *cheaper* than that continuous
figure, though: each leg after the first rounds its own full distance up to
the 500 m grid independently (never pooled with another leg — see
`chargeableSteps`), so an awkward split can round up more than once where a
single continuous distance would have rounded up only at the very end.

Field notes:

- **`destinations`** accepts 1–25 entries (no product limit — the array cap
  is only an abuse guard, mirroring the existing `addons` field's own cap).
  Order is preserved as `stopIndex`.
- **`legs`** — **pricing now runs per leg** (see `POST /moving/quote`'s
  field notes and "Round trip + multiple legs" section above, which apply
  identically here). `legs.length` must equal `destinations.length` — or
  `destinations.length + 1` when `roundTrip: true` and you choose to include
  an explicit return leg (optional, not mandatory) — checked before any
  pricing happens; a mismatch is `400`.
- **`chargeableSteps`** (trip-level and per-leg) is `null` on a booking
  captured before 500 m step pricing shipped — those were priced per
  kilometre, so a step count doesn't apply and isn't back-filled. Every
  booking created after that release has a real integer here.
- **`customerName`/`phone`/`email`** are optional and not currently sent by
  the Moving Support page (it collects no contact fields) — future-proofing,
  not a requirement.
- **`notes`** (optional, max 2000 chars) is the web form's "Additional
  notes" field — free text the customer types for anything the structured
  fields don't capture (fragile items, floor/access notes, special timing).
  Distinct from the admin-only `adminNote` on the admin endpoints below,
  which a customer never sends or sees.
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
  `destinations` → `400` (`ArrayMinSize`); `legs.length` not matching
  `destinations.length` (±1 for an explicit round-trip return leg) → `400`.

## 4. Admin endpoints (not needed by the public page)

Not this doc's concern — see
[`docs/moving-admin-integration.md`](./moving-admin-integration.md) for the
full admin contract (truck-class/add-on CRUD, the pricing-policy singleton,
and reviewing bookings), written for the admin panel. Keeping it in one place
instead of two so the endpoint list, the add-on cross-field rules, and the
media-upload note don't drift out of sync.

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
- Migration `1787700000000-AddMovingLeadNotes` adds the `notes` column to
  `moving_leads` (the "Additional notes" field) — additive follow-up, run
  after the migration above.
- Migration `1787900000000-AddMovingLeadLegs` creates `moving_lead_legs` (a
  per-leg priced breakdown snapshot, alongside the existing
  `moving_lead_stops`/`moving_lead_addons`) for the per-leg pricing change in
  §3 above — additive follow-up, run after the migration above. No seed data.
- Migration `1788200000000-RenameMovingLeadsToBookings` drops the three
  `moving_lead*` tables above and recreates them as `moving_bookings` /
  `moving_booking_stops` / `moving_booking_addons` / `moving_booking_legs`,
  with a new 5-value status enum (`pending`/`confirmed`/`rejected`/
  `cancelled`/`completed`) and new `confirmed_at`/`confirmed_by_id` columns.
  **Row data is not preserved** — every `moving_leads` row was disposable
  test data at the time of this migration. Run after all four migrations
  above.
- No new env vars for this phase.
