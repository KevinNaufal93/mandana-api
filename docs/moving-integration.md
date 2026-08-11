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

### `POST /moving/quote` (public) — new, not in the original FE plan

The FE's `lib/moving/pricing.ts` renders an instant preview from the truck
list (keep it — it's the right UX for step 2). This endpoint makes the
**final** number the customer and WhatsApp see authoritative, so a rate change
takes effect without a frontend deploy and the formula/constants aren't the
only copy living in a public bundle.

```jsonc
// Request
{ "truckSlug": "pickup-bak", "distanceMeters": 151200 }

// 200 response
{
  "data": {
    "truck": { "slug": "pickup-bak", "name": "Pick Up Bak" },
    "distanceKm": 151.2,
    "includedKm": 5,
    "chargeableKm": 146.2,
    "baseFare": 250000,
    "distanceFare": 657900,
    "subtotal": 907900,
    "total": 910000,
    "minFareApplied": false,
    "lowEstimate": 820000,
    "highEstimate": 1000000,
    "currency": "IDR"
  }
}
```

`distanceMeters` is an input, not coordinates — reuse whatever distance the
FE's own Google Routes call (or its Next.js proxy) already produced. If/when
that proxy moves server-side (see §5), this DTO is designed to grow an
optional `origin`/`destination` alternative without breaking this shape.

Errors: unknown or inactive `truckSlug` → `404`. `distanceMeters` outside
`[1, 5_000_000]` or non-integer → `400` (global `ValidationPipe`,
`forbidNonWhitelisted: true` — extra body fields also 400).

**Recommended flow:** call this once distance + truck are both set (same
trigger point the FE already debounces Routes calls on), and render `total` /
`lowEstimate` / `highEstimate` in place of the client-computed preview before
building the WhatsApp message. Treat the client preview as instant feedback
only, never as the number that ships in the WA text.

**Constants must stay in sync.** `MOVING_DEFAULTS`
(`includedKm: 5, roundToIdr: 10_000, bandPct: 10`) exists in both repos —
`lib/moving/pricing.ts` here and `moving-pricing.ts` in the backend. If a
constant changes on one side without the other, the client-side preview and
this endpoint's `total` will silently disagree. There is no shared source
today; changing one requires remembering to change the other. Cross-check
periodically: same truck + same `distanceMeters` should produce byte-identical
totals from both.

## 4. Admin endpoints (not needed by the public page, for completeness)

```
GET    /admin/moving/truck-classes            includes inactive; ?isActive=true|false
GET    /admin/moving/truck-classes/:id
POST   /admin/moving/truck-classes
PATCH  /admin/moving/truck-classes/:id
DELETE /admin/moving/truck-classes/:id         204
```

Bearer JWT, `role: admin`. Attach an image the same way hero slides do:
upload via the existing `POST /admin/media/upload`, then pass the returned
`mediaAssetId` in the create/update body.

## 5. Known gaps — flagged, not built in this phase

- **No lead capture.** The page's payoff is a `wa.me` deep link built
  entirely client-side; nothing on the backend records that a quote happened.
  If the customer closes the tab before sending, there is no trace of the
  lead anywhere. A `POST /moving/leads` + admin inbox (near-identical to the
  existing [`inquiries`](../src/modules/inquiries/) module) would close this
  — not built yet.
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
- No new env vars for this phase.
