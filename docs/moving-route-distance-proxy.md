# Moving Support — Google Routes distance proxy (future work, design only)

**Status: not built.** This documents a design for moving the FE's
`POST /api/moving/route-distance` Next.js Route Handler onto this backend.
Nothing in this file has been implemented — it exists so a future phase can
execute against an agreed contract instead of re-deriving one, and so the
current split (Next.js owns the Google Routes call, NestJS owns truck classes
+ quoting) is a documented decision, not an oversight.

## Why move it at all

The frontend's own cost analysis (see their build doc) already does the hard
part of this argument: **Autocomplete Requests, not Routes, is the dominant
line item** on Google's bill, and Autocomplete has no server-side
counterpart to proxy — it has to stay client-side, talking to Google's JS SDK
directly. So this is not about the biggest cost line.

What moving the *Routes* call specifically buys:

1. **A real cache.** The Next.js handler runs per-instance/per-lambda-cold-start
   with no shared state. This backend already has a global Redis cache
   (`CacheModule`, see `homepage-cache.service.ts` for the pattern) reachable
   from every instance. Caching on the same 4-decimal-place quantized
   coordinate pair the FE's own query-key dedup already uses turns repeat
   routes on common corridors (e.g. Jakarta ↔ BSD, a likely frequent pair)
   into zero-cost cache hits instead of duplicate billed calls, something a
   single Vercel function instance cannot do as well.
2. **One server key, in one place, with one deploy surface.** Today the FE's
   `.env.example` plan calls for `GOOGLE_MAPS_SERVER_API_KEY` to live in the
   Next.js deployment. Moving the call here means only this backend's secret
   store ever holds it.
3. **Rate limiting that actually works.** The FE plan's own abuse-control
   list admits their in-memory IP limiter is "per-instance, resets on cold
   start, a speed bump not a limiter." This backend is a single long-running
   process (or a small fixed pool behind a normal load balancer), so an
   in-memory limiter here is a meaningfully stronger control, and it composes
   with a normal edge/WAF rule the same way either side would need anyway.

None of this is urgent — the FE's own numbers put the whole feature at
roughly $0.05 per completed quote and ~$133/mo at 25,000 visits with the
proxy where it is today. This is a "do it when traffic or cache-hit-rate
data justifies it" item, not a launch blocker.

## Proposed contract

Kept **identical** to the frontend's own design so moving the call is a
client base-URL change, not a rewrite of their error handling:

```
POST /api/v1/moving/route-distance
Body: { "origin": {"lat":-6.2,"lng":106.8}, "destination": {"lat":-6.9,"lng":107.6} }

200 { distanceMeters, durationSeconds, source: "google" | "mock" }
400 INVALID_INPUT | OUT_OF_AREA | SAME_POINT
404 NO_ROUTE          Google returned 200 with an empty routes array
429 RATE_LIMITED
500 NOT_CONFIGURED    server key absent
502 UPSTREAM_ERROR    non-2xx or timeout from Google
```

`POST /moving/quote` (already built) is designed to absorb this later without
a breaking change — it currently takes `distanceMeters` directly; a future
version could accept `origin`/`destination` instead and internally call this
proxy, collapsing two round-trips into one for the FE.

## Upstream call

```
POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-Api-Key: <GOOGLE_MAPS_SERVER_API_KEY>
X-Goog-FieldMask: routes.distanceMeters,routes.duration

{
  "origin":      { "location": { "latLng": { "latitude": -6.2, "longitude": 106.8 } } },
  "destination": { "location": { "latLng": { "latitude": -6.9, "longitude": 107.6 } } },
  "travelMode": "DRIVE",
  "routingPreference": "TRAFFIC_UNAWARE",
  "computeAlternativeRoutes": false,
  "routeModifiers": { "avoidTolls": true },
  "languageCode": "id-ID", "regionCode": "ID", "units": "METRIC"
}
```

**`routeModifiers.avoidTolls` must mirror the caller's `tollRoute` flag** —
send `avoidTolls: !tollRoute` (see `moving-integration.md`'s `POST
/moving/quote` section). Without this, Google silently returns its default
route, which is the toll route for most Jabodetabek/intercity pairs, while
`POST /moving/quote` prices toll-route kilometers and (until an ops toll rate
is active) charges Rp 0 toll — a systematic under-quote either way: take the
toll and it's eaten, avoid it and the real distance is longer than quoted.
`avoidTolls` is a plain route modifier, not a Pro/Enterprise feature — it
stays on the Essentials SKU, so this costs nothing extra. See "Phase 2: toll
pricing" below for what *does* cost more.

**`routingPreference: "TRAFFIC_UNAWARE"` is not optional** — `TRAFFIC_AWARE`
silently upgrades the call to the Compute Routes *Pro* SKU: double the price
($10/1k vs $5/1k) and half the free tier (5,000/mo vs 10,000/mo), for a
traffic ETA this feature never displays.

`duration` returns as `"9120s"` — strip the trailing `s` before use.
**No-route is HTTP 200 with an empty/absent `routes` array**, not a non-2xx
status — must be handled explicitly, not caught by generic error handling.
Use `AbortSignal.timeout(8000)` and `cache: 'no-store'` on the fetch.

**Never forward Google's raw error body to the client** — it names the GCP
project ID and which APIs are/aren't enabled on it. Log it server-side (this
repo already has a request logger via the global exception filter pattern —
see `all-exceptions.filter.ts`), return only the opaque code above.

## Validation, before any network call

Same shape as the hand-rolled `parseRouteDistanceRequest` the FE already
speced, reimplemented as a Nest DTO + a small guard function (this repo's
existing convention is class-validator DTOs, not a hand-rolled parser, so a
`ComputeRouteDistanceDto` with `@ValidateNested()` lat/lng objects is the
natural fit here rather than porting their parser verbatim):

1. Both points structurally valid `{ lat: number, lng: number }`,
   `Number.isFinite()` on both (catches `NaN`/`Infinity`/stringified numbers
   that slipped past `class-transformer`).
2. **Indonesia bounding box**: `lat ∈ [-11.5, 6.5]`, `lng ∈ [94.5, 141.5]` →
   `400 OUT_OF_AREA` otherwise. This is the single highest-value control in
   the whole proxy — it's the difference between "compute any route on
   Earth for free" and "compute routes in our service area."
3. Haversine distance between the two points `< 0.05 km` → `400 SAME_POINT`,
   short-circuits before any billed call.
4. Quantize both points to 4 decimal places (~11m) before both the cache key
   and the upstream call — this is what makes the Redis cache in §"Why move
   it" actually hit on repeated near-identical drags.

## Caching & rate limiting

- **Redis, keyed on quantized coordinates**: `moving:route:{o.lat},{o.lng}:{d.lat},{d.lng}`
  (post-quantization), reusing the existing `CACHE_MANAGER` injection this
  repo already has globally available (`CacheModule.registerAsync` in
  `app.module.ts`). TTL: a road distance between two fixed points doesn't
  change meaningfully day to day — 24h is reasonable, `homepage-cache.service.ts`
  is the pattern to mirror (`get<T>()` / `set()` / `bust()` wrapper class).
- **In-memory per-instance rate limit** as a cheap first layer (20 req/60s per
  IP, module-scope `Map`, same idea the FE already planned) — acceptable here
  specifically because this backend, unlike a serverless FE deployment, is
  not cold-starting per request.
- **The real production control is still infra-level**, same conclusion the
  FE reached: a rate-limit rule at the load balancer / WAF in front of this
  API, plus a **GCP billing budget alert and a daily Routes quota cap**
  (suggest 2,000/day, inside the 10k/mo free tier) set in the Google Cloud
  Console *before* this endpoint takes live traffic.

## New configuration this would need

- `GOOGLE_MAPS_SERVER_API_KEY` — added to `env.validation.ts` as
  `Joi.string().required()`, namespaced `google.serverApiKey` in
  `configuration.ts`, following the existing `storage.*` / `jwt.*` pattern.
  **API-restrict this key to Routes API only** in the Google Cloud Console —
  HTTP-referrer restriction is meaningless server-to-server, so API
  restriction is the only real containment if the key leaks.
- `MOVING_MOCK_DISTANCE` — optional escape hatch (`"1"` → return
  `haversine × 1.35` instead of calling Google), so this endpoint is
  exercisable in CI/dev without a Google Cloud account. Read directly via
  `ConfigService`, not added to the required-vars Joi schema.

## What does *not* move

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (the **browser** key, for Maps JS,
`PlaceAutocompleteElement`, and the Leaflet-adjacent Maps display) stays
entirely on the frontend regardless of this change — it's referrer-restricted
and inlined into the client bundle by design. This proxy only ever concerns
the **server** key.

## Phase 2: toll pricing (researched, deferred)

Avoiding tolls (`routeModifiers.avoidTolls`, above) is free; asking Google
what they'd cost is not. This section documents what pulling a real toll
*price* from Google would take, and why `POST /moving/quote` instead uses an
ops-configured toll estimate (`moving_addons.kind = 'toll'` — see
`moving-integration.md`) for now.

- **`routeModifiers.avoidTolls`** is a basic modifier — it appears in neither
  the Compute Routes Pro nor Enterprise feature list, so it stays on the
  **Essentials** SKU (~$5/1k, 10,000 free/month).
- **Toll *calculation*** — `extraComputations: ["TOLLS"]` plus
  `routes.travelAdvisory.tollInfo` in the field mask — is explicitly an
  **Enterprise** feature: ~**$15/1k**, free tier drops to 1,000/month, ~3× the
  cost per uncached quote. It would also undo the saving this proxy design
  already gets from forcing `routingPreference: TRAFFIC_UNAWARE`.
- **Indonesia is supported** — `ID_E_TOLL` is a real `TollPass` enum value
  ("E-card provided by multiple banks… all e-cards are charged the same").
  But Indonesia is specifically a region where the pass is **mandatory**:
  omit `tollPasses` and Google reports that a toll exists with no price.
- **The blocker**: `estimatedPrice` is **non-commercial (passenger car)**
  pricing; Google's docs warn it differs for commercial vehicles. Indonesian
  tolls bill by *golongan*, and a CDD or Fuso is Gol II–IV — roughly
  1.5–2.5× the Gol I rate. So at 3× the API cost the figure is still wrong
  for three of the four truck classes without a hand-maintained golongan
  multiplier per truck — at which point ops is tuning a multiplier either
  way, which is exactly what the `toll-estimate` addon already is.

**If volume ever justifies it:** build this proxy for real (still "not
built" as of this writing — today the FE calls Google directly and this
backend only receives `distanceMeters`), add `GOOGLE_MAPS_SERVER_API_KEY` to
`env.validation.ts` + `configuration.ts` per the section above, add a
`toll_golongan_multiplier_bps` column to `truck_classes`, and Redis-cache by
4dp-quantized coordinates for 24h as already specified. `MovingQuoteExtras.toll`
in `moving-pricing.ts` is the seam: swapping the ops estimate for a
Google-derived number at quote time is a service-layer change only — no
schema or response-shape break.

Sources: [Calculate toll fees](https://developers.google.com/maps/documentation/routes/calculate_toll_fees) ·
[RouteModifiers / TollPass](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteModifiers) ·
[Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) ·
[SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details) ·
[Maps Platform pricing](https://mapsplatform.google.com/pricing/)
