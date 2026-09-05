# Smart Storage — Frontend Integration Guide

Audience: `mandana-web`, `/layanan/storage` (not yet built — the footer link and
`lib/data.ts` entry exist, the page doesn't). Layout is meant to match
`/layanan/moving` (breadcrumb → title → stepped planner), and this module
follows the same backend shape as [`moving-integration.md`](./moving-integration.md)
— read that first if you haven't; this doc assumes it.

The one thing this module adds that Moving doesn't: **live availability**. A
customer looking at unit sizes sees the "left" count change without
refreshing, and a booking is a **real persisted request** (not a stateless
quote) — an admin confirms it before a unit is actually allocated.

## 1. Base URL & type generation

Same as everywhere else — `/api/v1`, spec at `/docs-json`:

```
openapi-typescript http://localhost:3000/docs-json -o lib/api/schema.d.ts
```

Every `/storage/*` handler declares `@ApiOkResponse`, so generated types
describe the real body — same standard the `moving` module set.

**One exception:** the two `@Sse()` routes (`GET /storage/availability/stream`,
`GET /admin/storage/stream`) generate as untyped/`unknown` in the OpenAPI spec
— there's no standard OpenAPI shape for `text/event-stream`. Their payload
shapes are documented by hand below; type them manually on the FE using the
`StorageAvailabilitySnapshotDto` shape.

## 2. Response envelope

Same convention as everywhere else: `{ "data": ... }`, `{ "data": [...], "meta": {...} }`
for paginated admin lists. **Do not change this** — see
[web-property-listing-requirements.md](./web-property-listing-requirements.md).

The two SSE streams are the one deliberate exception: each `event:` frame's
`data:` is the raw payload shape shown below, **not** wrapped in `{ data }`.
(Internally this is `@SkipTransform()` opting the route out of the global
envelope interceptor — mentioned here only so it's not mistaken for a bug.)

## 3. Public endpoints

### `GET /storage/unit-types`

Size classes. Always active-only, sorted `sortOrder ASC, name ASC`. Same
shape family as `GET /moving/truck-classes`.

```jsonc
{
  "data": [
    {
      "id": "uuid",
      "slug": "medium",
      "name": "Medium",
      "description": "Cocok untuk isi 1 kamar penuh termasuk furnitur kecil",
      "volumeM3": 5,
      "dimensions": { "lengthCm": 200, "widthCm": 150, "heightCm": 170 },
      "monthlyRate": 650000,
      "minDurationMonths": 1,
      "weeklyRate": 200000,
      "supportsWeekly": true,
      "minDurationWeeks": 1,
      "image": null,
      "isActive": true,
      "sortOrder": 20
    }
  ]
}
```

- **Money is a JSON integer** (`monthlyRate`), same rationale as
  `TruckClass.baseFare` — avoids the `numeric` → string leak `Property.price`
  has. No `Number()` coercion needed.
- `dimensions` is `null` unless length/width/height are all set.
- `image` is the same `{ url, srcset, alt, width, height } | null` shape as
  everywhere else. No unit types carry an image in the seed data yet.
- **`weeklyRate` is independent of `monthlyRate`, never derived from it** —
  same reasoning as Event Support's `hourlyRate` vs `pricePerDay` (a short
  stay costs more per unit of time to service than a month amortizes to).
  `supportsWeekly` is the opt-in; every unit type ships with it `false` and
  `weeklyRate: null` until an admin turns it on
  (`PATCH /admin/storage/unit-types/:id`) — nothing changes for existing
  customers on deploy. `minDurationWeeks` falls back to `1` when `null`. See
  [storage-admin-integration.md](storage-admin-integration.md) for the admin
  contract and the invariant behind `supportsWeekly`.

### `GET /storage/facilities`

Active facilities with coordinates, for the map. **Coordinates are exact** —
unlike `Property`, no `location-privacy.ts` fuzzing applies here (these are
commercial addresses customers need to actually find).

```jsonc
{
  "data": [
    {
      "id": "uuid",
      "slug": "bsd-city",
      "name": "Mandana Storage BSD City",
      "description": "Fasilitas penyimpanan dengan CCTV 24 jam...",
      "address": "Jl. Letnan Sutopo No. 1, BSD City",
      "area": "BSD City",
      "city": "Tangerang Selatan",
      "province": "Banten",
      "latitude": -6.3019,
      "longitude": 106.6528,
      "image": null,
      "isActive": true,
      "sortOrder": 10
    }
  ]
}
```

### `GET /storage/facilities/:slug`

Single facility, same shape as above, `data` not `data[]`. 404 if unknown or
inactive.

### `GET /storage/availability`

The availability snapshot — **polling fallback** for the SSE stream below.
Supports `ETag`/`If-None-Match` → `304`, same pattern as `GET /homepage`
(see `homepage.controller.ts`), but keyed off the snapshot's own content hash
rather than an `md5` of the whole response, so it's identical to the
`version` field inside the body.

```jsonc
// 200
{
  "data": {
    "version": "9f2a7c1e4b3d8f0a2c5e6b1d9f4a7c3e",
    "generatedAt": "2026-08-13T09:14:22.104Z",
    "facilities": [
      {
        "facilitySlug": "bsd-city",
        "facilityName": "Mandana Storage BSD City",
        "units": [
          { "unitTypeSlug": "small", "total": 20, "available": 20, "monthlyRate": 350000, "weeklyRate": null, "supportsWeekly": false },
          { "unitTypeSlug": "medium", "total": 12, "available": 9, "monthlyRate": 650000, "weeklyRate": 200000, "supportsWeekly": true }
        ]
      }
    ]
  }
}
```

- `available` is already clamped `≥ 0` — never negative.
- `monthlyRate`/`weeklyRate` here already account for a per-facility
  override, if one is set — always use these values for display, not
  `StorageUnitType.monthlyRate`/`weeklyRate`. `weeklyRate` is `null` unless
  `supportsWeekly` is `true`.
- Send `If-None-Match: "<version>"` (quoted, matches the `ETag` header
  literally) on repeat polls → `304` with no body.
- **One-time `version` churn on deploy.** `version` hashes the complete
  snapshot body (see `storage-floor-plan-response.md` §5) — adding
  `weeklyRate`/`supportsWeekly` changes that hash for every facility the
  first time this runs after deploy, so every cached client `ETag` misses
  once and the SSE stream pushes one full frame to every connected listener.
  Harmless, but expected — not a sign anything is wrong.

### `GET /storage/availability/stream` — SSE, public, counts only

Live push of the same snapshot shown above. Native `EventSource`, no new
dependency:

```ts
const es = new EventSource(`${API_BASE}/storage/availability/stream`);

es.addEventListener("availability", (e) => {
  const snapshot: StorageAvailabilitySnapshotDto = JSON.parse(e.data);
  queryClient.setQueryData(["storage", "availability"], snapshot);
});

es.addEventListener("ping", () => {
  // Optional: track this to detect a half-open connection client-side —
  // if none arrives for ~45s (3 missed heartbeats), es.close() + reopen.
});

es.onerror = () => {
  // EventSource auto-reconnects on its own; this fires on every drop.
  // No action needed unless you want a "reconnecting…" indicator.
};
```

Behavior worth knowing before you build the client:

- **First event on connect is always a fresh `availability` snapshot** — no
  need to also call `GET /storage/availability` first; the stream's initial
  emission already IS that cached-or-fresh read. Prefetch via
  `GET /storage/availability` server-side (Next.js) for the first paint, then
  hand off to the stream for live updates client-side — same
  `prefetchQuery` → `HydrationBoundary` pattern the Moving page already uses.
- **`event: ping` fires roughly every 15s** with `data: {"time": "…"}`.
  Purely a keep-alive (CloudFront's origin timeout is 30s and applies
  *between* packets, not just to the first byte) — no action required, but
  don't be surprised by it in the Network tab.
- **Full snapshots, not deltas.** Every `availability` event is the complete
  current state — `setQueryData(fullSnapshot)` is always correct; there's no
  merge/patch logic to write.
- **Reconnects need no special handling.** Because every push is a full
  snapshot, a reconnecting `EventSource` (browser's default retry, ~3s) just
  gets fresh state on its next `availability` event — there's no
  `Last-Event-ID` replay to implement.
- Availability changes only on a **confirmed** booking (or an admin catalog
  edit) — submitting a booking request does **not** move any count. Don't
  expect the number to drop the moment your own `POST /storage/bookings`
  resolves.

### `POST /storage/quote`

Authoritative price for a facility + unit type + duration. Mirrors
`POST /moving/quote`'s role: render an instant client-side estimate for feel,
but use this response for anything that ships in the WhatsApp message.

```jsonc
// Request — monthly (unchanged, still accepted)
{ "facilitySlug": "bsd-city", "unitTypeSlug": "medium", "quantity": 1, "durationMonths": 6 }

// 200 response
{
  "data": {
    "facility": { "slug": "bsd-city", "name": "Mandana Storage BSD City" },
    "unitType": { "slug": "medium", "name": "Medium" },
    "monthlyRate": 650000,
    "quantity": 1,
    "durationMonths": 6,
    "durationUnit": "month",
    "duration": 6,
    "unitRate": 650000,
    "unitLabel": "bulan",
    "subtotal": 3900000,
    "discountPct": 10,
    "discountAmount": 390000,
    "total": 3510000,
    "currency": "IDR"
  }
}
```

```jsonc
// Request — weekly (new)
{ "facilitySlug": "bsd-city", "unitTypeSlug": "medium", "quantity": 1, "durationUnit": "week", "duration": 3 }

// 200 response
{
  "data": {
    "facility": { "slug": "bsd-city", "name": "Mandana Storage BSD City" },
    "unitType": { "slug": "medium", "name": "Medium" },
    "monthlyRate": 650000,
    "quantity": 1,
    "durationMonths": null,
    "durationUnit": "week",
    "duration": 3,
    "unitRate": 200000,
    "unitLabel": "minggu",
    "subtotal": 600000,
    "discountPct": 0,
    "discountAmount": 0,
    "total": 600000,
    "currency": "IDR"
  }
}
```

**Additive, not breaking.** `durationMonths` still works exactly as before
and is equivalent to `durationUnit: "month"` — provide exactly one of
`durationMonths` or (`durationUnit` + `duration`). `monthlyRate` is always
present as the reference monthly rate, even on a weekly quote; `unitRate` is
what was actually applied. A weekly request against a unit type that hasn't
been opted into weekly pricing (`supportsWeekly: false` or no `weeklyRate`
set) → `400` naming the unit type.

Errors: unknown/inactive `facilitySlug` or `unitTypeSlug`, or a combination
with no inventory row at all → `404`. Out-of-range `quantity`/`duration`, or
sending both/neither of `durationMonths`/`duration` → `400` (global
`ValidationPipe`, `forbidNonWhitelisted: true`).

**Constants must stay in sync.** `STORAGE_DEFAULTS` (`roundToIdr: 1_000`, the
duration-discount tiers: 0% under 3mo, 5% at 3mo+, 10% at 6mo+, 15% at 12mo+)
lives in `storage-pricing.ts` in this repo. If you build a client-side instant
estimate (recommended, same UX reasoning as Moving), mirror these constants
exactly — there is no shared source between the two repos today. Cross-check
periodically: same inputs should produce byte-identical totals. **These
tiers are month-only** — a weekly quote's `discountPct` is always `0`, never
derived from them (13 weeks must not quietly land in the 3-month bracket). A
mirrored client-side estimate must apply the same rule: no discount logic on
a weekly quote, full stop.

### `POST /storage/bookings`

Creates a **pending** booking — persisted, not just computed. **Does not
reserve a unit** — only a confirmed booking (admin action) takes stock, so
`available` in the snapshot above won't move when this resolves.

```jsonc
// Request — same durationMonths | (durationUnit + duration) choice as the quote endpoint
{
  "customerName": "Budi Santoso",
  "email": "budi@example.com",
  "phone": "+628123456789",
  "notes": "Barang berupa furnitur dan dus, akses akhir pekan",
  "facilitySlug": "bsd-city",
  "unitTypeSlug": "medium",
  "quantity": 1,
  "startDate": "2026-09-01",
  "durationMonths": 6
}

// 201 response
{
  "data": {
    "id": "uuid",
    "reference": "MDN-STG-7K3XQP",
    "status": "pending",
    "customerName": "Budi Santoso",
    "email": "budi@example.com",
    "phone": "+628123456789",
    "facilitySlug": "bsd-city",
    "facilityName": "Mandana Storage BSD City",
    "unitTypeSlug": "medium",
    "unitTypeName": "Medium",
    "quantity": 1,
    "startDate": "2026-09-01",
    "durationMonths": 6,
    "endDate": "2027-03-01",
    "durationUnit": "month",
    "duration": 6,
    "unitRate": 650000,
    "unitLabel": "bulan",
    "monthlyRate": 650000,
    "subtotal": 3900000,
    "discountAmount": 390000,
    "total": 3510000,
    "currency": "IDR",
    "createdAt": "2026-08-13T09:20:00.000Z",
    "whatsappMessage": "Halo Mandana, saya baru saja mengajukan booking Smart Storage.\n\nNo. Referensi: MDN-STG-7K3XQP\n..."
  }
}
```

A weekly booking (`{ "durationUnit": "week", "duration": 3, ... }`) returns
`"durationMonths": null`, `"endDate"` computed as exactly `7 × duration` days
after `startDate` (no calendar-month clamping — a week is a fixed-length
unit), and a `whatsappMessage` reading e.g. `"Mulai: 2026-09-01 (3 minggu)"`.

**`whatsappMessage` is plain text, not a URL.** The API has no business
WhatsApp number of its own — `NEXT_PUBLIC_MANDANA_WHATSAPP` is (and stays)
frontend-only config, same as it already is for Moving
(`lib/moving/whatsapp.ts`). Build the deep link exactly the way
`buildMovingWaLink()` already does:

```ts
import { getMandanaWaNumber, buildMovingWaLink } from "@/lib/moving/whatsapp"; // or a shared helper

const waNumber = getMandanaWaNumber();
if (waNumber) {
  const link = buildMovingWaLink(waNumber, data.whatsappMessage); // `https://wa.me/<number>?text=...`
}
```

Errors: unknown/inactive facility or unit type, or no inventory row for that
pair → `404`. `quantity` greater than the facility's total capacity for that
unit type → `400` (a sanity bound, not the concurrency check — see below).
`durationMonths` under the unit type's `minDurationMonths` → `400`; a weekly
`duration` under `minDurationWeeks` (falls back to 1) → `400` the same way.
A weekly booking against a unit type not opted into weekly pricing → `400`,
same rule as the quote endpoint.

**On persistence, not reservation:** because pending doesn't hold stock, two
customers can request the same last unit — both succeed, and it's the admin
who decides who actually gets it (`PATCH /admin/storage/bookings/:id/confirm`,
see below), which is where the real oversell guard lives. Design this into
the UI: after submitting, show the reference code and "menunggu konfirmasi
tim kami," not "unit reserved."

## 4. Admin endpoints

Bearer JWT, `role: admin`, same as every other admin surface. Full contract
(request/response shapes, the `supportsWeekly` invariant, money conventions)
is in [storage-admin-integration.md](storage-admin-integration.md) — this
table is the quick route reference.

```
GET|POST|PATCH|DELETE  /admin/storage/unit-types[/:id]
GET|POST|PATCH|DELETE  /admin/storage/facilities[/:id]
GET|POST|PATCH|DELETE  /admin/storage/inventory[/:id]      monthlyRateOverride / weeklyRateOverride
GET|POST|PATCH|DELETE  /admin/storage/units[/:id]           individual physical units, see storage-floor-plan-response.md §3
POST                    /admin/storage/units/bulk           { facilityId, unitTypeId, count, codePrefix } — add capacity fast
DELETE                  /admin/storage/units/bulk           { ids: string[] } — atomic, 404 naming any id(s) not found
GET                    /admin/storage/bookings             paginated; ?status=&facilitySlug=&unitTypeSlug=
GET                    /admin/storage/bookings/:id
PATCH                  /admin/storage/bookings/:id/confirm  atomically allocates the unit(s); 409 if not enough remain
PATCH                  /admin/storage/bookings/:id/reject
PATCH                  /admin/storage/bookings/:id/cancel   releases the unit(s)
PATCH                  /admin/storage/bookings/:id/complete releases the unit(s)
```

Attach an image the same way truck classes / hero slides do: upload via
`POST /admin/media/upload`, pass the returned `mediaAssetId`.

### `GET /admin/storage/stream` — SSE, admin panel, counts + booking events

Same idea as the public stream, but multiplexes four event types over one
connection and needs a different auth flow, because **`EventSource` cannot
send an `Authorization` header**:

```
event: availability     → identical StorageAvailabilitySnapshotDto shape
event: booking.created  → { reference, facilitySlug, facilityName, unitTypeSlug,
                             unitTypeName, quantity, customerName, total, createdAt }
event: booking.updated  → { reference, status, confirmedByName, updatedAt }
event: ping             → keep-alive, same as the public stream
```

**Auth flow — mint a 60-second ticket, then open the stream with it:**

```ts
// 1. Normal Bearer-authenticated POST, mints a short-lived ticket
const { data } = await api.POST("/admin/storage/stream-ticket"); // { ticket, expiresIn: 60 }

// 2. Open the stream with the ticket in the query string
const es = new EventSource(`${API_BASE}/admin/storage/stream?ticket=${data.ticket}`);

es.addEventListener("booking.created", (e) => { /* toast + refetch the bookings list */ });
es.addEventListener("booking.updated", (e) => { /* update the row in place */ });
es.addEventListener("availability", (e) => { /* same handling as the public stream */ });
```

- The ticket is **single-purpose and expires in 60 seconds** — it only needs
  to survive long enough to open the connection; once the stream is
  established there's no re-check. Mint a fresh one on every reconnect
  (`es.onerror` → re-`POST /admin/storage/stream-ticket` → new `EventSource`).
  Don't cache/reuse a ticket across reconnects — by the time you need one
  the previous one has likely expired anyway.
- **Never a normal access token in `?ticket=`.** The endpoint rejects it —
  it checks a `purpose` claim the ticket-mint endpoint sets and a regular
  login token doesn't have. This is intentional: a 15-minute Bearer token
  sitting in a URL is a much bigger exposure (browser history, proxy/CDN
  logs) than a 60-second single-purpose one.
- The booking events carry customer names — this stream is **not** meant to
  be reachable from the public storage page under any circumstance.

## 5. Known gaps — flagged, not built in this phase

- **Multi-instance push isn't instant.** The push mechanism lives in one
  Node process's memory. If the API ever runs on more than one instance
  behind a load balancer, a confirm handled by instance A won't immediately
  push to a viewer connected to instance B — it converges within one
  heartbeat interval (~15s) instead of instantly, because each instance
  independently notices its cached snapshot's version changed. Today's
  single-instance deployment (see `deployment.md`) isn't affected.
- **No lead-loss protection beyond persistence.** Unlike Moving's WhatsApp-
  only flow, a booking here IS recorded server-side the moment the form is
  submitted — so, unlike Moving, there's no "customer closed the tab" gap.
- **No customer-facing booking status lookup.** There's no
  `GET /storage/bookings/:reference` for a customer to check their own
  request's status — the WhatsApp thread is the status channel for now.
- **Seeded rates and capacities are placeholders** pending ops sign-off —
  same caveat as the Moving truck-class seed. Check current values via
  `GET /admin/storage/unit-types` and `GET /admin/storage/inventory` before
  relying on them for anything beyond development.

## 6. Prerequisites

- Migration `1786600000000-AddStorageModule` creates all four tables and
  seeds 4 unit types (`small`, `medium`, `large`, `extra-large`) × 2
  facilities (`bsd-city`, `kelapa-gading`) = 8 inventory rows, so the page
  has real data to render on day one.
- Migration `1788100000000-AddStorageWeeklyPricing` adds weekly pricing —
  behaviour-neutral, every unit type ships with `supportsWeekly: false`.
- No new env vars for this phase — the SSE ticket reuses the existing
  `JWT_ACCESS_SECRET`.
