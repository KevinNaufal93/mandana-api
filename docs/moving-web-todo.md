# Moving Support — Web TODO: "Additional notes" + multi-destination

Audience: `mandana-web`. Two open gaps on the Moving Support page
(`/layanan/moving`), both already fully supported by the API — this doc is
the "what to build" handoff for each. See `docs/moving-integration.md` for
the complete endpoint reference; this file only covers what's new/actionable
here.

Both items below hang off the same endpoint: **`POST /moving/leads`**, fired
when the customer clicks "Pesan via WhatsApp" (already wired — see
`components/moving/moving-quote.tsx`'s `handleWhatsAppClick`). Nothing below
requires a new endpoint or a backend change to consume; the contract is live
today.

---

## 1. "Additional notes" field

**What it is:** a free-text field for the customer to add anything the
structured fields don't capture — fragile items, floor/access notes,
special timing. Optional, max 2000 characters.

**API contract** — `CreateMovingLeadDto.notes?: string`:

```jsonc
// POST /moving/leads request — notes is the only new field here
{
  "truckSlug": "cdd",
  "distanceMeters": 45000,
  "pickup": { "address": "...", "lat": -6.2088, "lng": 106.8231 },
  "destinations": [{ "address": "...", "lat": -6.2297, "lng": 106.8253 }],
  "notes": "Barang mudah pecah, tolong hati-hati. Butuh 2 orang angkat ke lantai 3."
}
```

The response echoes it back as `data.notes` (`string | null`).

**What to build:**

1. A `notes` textarea in the extras section (`components/moving/moving-extras.tsx`
   is the natural home — it already renders `roundTrip`/`declaredValue`
   alongside the add-on checkboxes/steppers). Suggested label: "Catatan
   Tambahan" (or "Additional notes"), placeholder something like "Contoh:
   barang mudah pecah, butuh bantuan angkat ke lantai atas". Optional field
   — no validation beyond a soft max-length hint (server enforces 2000 hard).
2. New state in `moving-planner.tsx`: `const [notes, setNotes] = useState<string | null>(null);`
   — same pattern as `declaredValue`. Thread it down through
   `MovingMapLoaderProps` → `ManualWorkspace/MovingWorkspace` → `MovingExtras`,
   same as every other extras field already does.
3. In `moving-quote.tsx`'s `handleWhatsAppClick` (the function that builds
   the `POST /moving/leads` body), add `notes` as a new prop and include it
   in the request: `...(notes?.trim() ? { notes: notes.trim() } : {})`.
4. Optional but recommended: also append it to the WhatsApp message text
   itself (`lib/moving/whatsapp.ts`'s `buildMovingWaMessage`) — right now
   nothing the customer types outside the structured fields reaches the WA
   text, so if they write something important in "Additional notes" but the
   admin only skims the chat, it could get missed. A line like `Catatan: {notes}`
   near the end of the message (before "Mohon konfirmasi...") covers this.

This is the smallest of the two items — one new field, no architecture change.

---

## 2. Multi-destination

**Status: the API already supports this today, unlimited and ordered.**
Nothing on the backend needs to change. The entire gap is frontend: current
state, the distance proxy, and the WhatsApp message builder are all still
hard-coded to exactly one destination.

### API contract (already live)

`CreateMovingLeadDto.destinations` is an **array**, 1–25 entries (the cap is
an abuse guard, not a product limit), each `{ address?, lat, lng }`, in
route order:

```jsonc
// POST /moving/leads — 3 destinations, in the order the customer added them
{
  "truckSlug": "cdd",
  "distanceMeters": 45000,
  "pickup": { "address": "Jl. Sudirman No. 1, Jakarta Selatan", "lat": -6.2088, "lng": 106.8231 },
  "destinations": [
    { "address": "Jl. Gatot Subroto, Jakarta Selatan", "lat": -6.2297, "lng": 106.8253 },
    { "address": "BSD City, Tangerang Selatan", "lat": -6.3021, "lng": 106.6528 },
    { "address": "Bogor Kota", "lat": -6.5971, "lng": 106.8060 }
  ]
}
```

The response echoes them back as `data.destinations[]`, each carrying a
`stopIndex` (0-based, matches the order submitted).

**Important — `distanceMeters` stays a single number.** Pricing
(`POST /moving/quote`, unchanged) doesn't know or care how many stops
produced that total — Rp/km math is the same whether it's one leg or five.
So the only new client-side work for distance is: **compute the total road
distance across every leg** (pickup → stop 1 → stop 2 → ... → stop N) and
send that one summed number, exactly like today. No new pricing field, no
per-leg pricing.

### What to build

This does touch several files — current architecture is genuinely
single-destination end to end (`destination: PlacePoint | null`, not an
array, everywhere). In dependency order:

1. **State** — `components/moving/moving-planner.tsx`:
   Change `const [destination, setDestination] = useState<PlacePoint | null>(null)`
   to `const [destinations, setDestinations] = useState<PlacePoint[]>([])`
   (or keep a single "active/last" destination plus a list — whatever fits
   the existing `activePin` click-to-place UX best). This is the root
   change everything else flows from.

2. **Distance calculation** — `lib/moving/route-distance.ts` +
   `app/api/moving/route-distance/route.ts`: today's contract is
   `{ origin, destination } → { distanceMeters, durationSeconds }`, a single
   leg. Two ways to extend it, in order of recommendation:
   - **Preferred:** change the request to `{ origin, destinations: LatLng[] }`
     and have the route handler call Google's Routes API with an
     `intermediates` array (waypoints) in one `computeRoutes` request,
     summing the returned leg distances server-side (or reading the total
     `distanceMeters` the API already returns for the whole route). One
     billed call regardless of stop count, same as today.
   - **Simpler fallback:** call the existing single-leg endpoint N times
     (pickup→stop1, stop1→stop2, ...) and sum the results client-side. More
     Google billing per quote, but zero backend proxy changes. Reasonable
     if the "preferred" option is too much for this pass.
   Either way, the thing that ultimately reaches `POST /moving/quote` and
   `POST /moving/leads` is still one summed `distanceMeters` number.

3. **Map UI** — `components/moving/moving-map-panel.tsx`: currently places
   exactly two markers (origin, destination) and fits the map to that one
   leg. Needs: a marker per destination (numbered, e.g. "1", "2", "3" — the
   existing origin/destination pin styling is a reasonable starting point),
   and route polylines/fit-bounds across all legs. `activePin` (currently
   `"origin" | "destination"`) becomes something like
   `"origin" | { destinationIndex: number }` or similar, so a map click
   still knows which pin to move.

4. **Route fields UI** — `components/moving/moving-route-fields.tsx`: needs
   an "add destination" affordance (e.g. a "+ Tambah Tujuan" button under
   the existing Titik Tujuan field) that appends an empty slot, one address
   field per destination with a remove ("×") button per row once there's
   more than one, and ideally drag-to-reorder (order matters — it becomes
   `stopIndex`). The manual-entry fallback in `moving-map-loader.tsx`'s
   `ManualPointFields` needs the equivalent treatment for the no-Google-key
   path.

5. **WhatsApp message** — `lib/moving/whatsapp.ts`'s `buildMovingWaMessage`:
   currently takes one `destination: PlacePoint` and prints one "Tujuan:"
   line. Needs to loop over `destinations: PlacePoint[]` and print one
   numbered line per stop (e.g. "Tujuan 1:", "Tujuan 2:", ...), each with
   its own Google Maps pin link, same format as today's single line.

6. **Lead capture** — `moving-quote.tsx`'s `handleWhatsAppClick` (already
   built for the notes field above and for today's single-destination
   case): change `destinations: [{ address: destination.address ?? undefined, lat: destination.lat, lng: destination.lng }]`
   (currently hard-coded to a length-1 array) to map over the full
   `destinations` array/state, preserving order.

### Suggested build order

Notes (§1) first — it's small and independent. For multi-destination,
recommend landing state + map/UI (steps 1, 3, 4) behind a working
single-destination-equivalent first (i.e. an array that just happens to
hold one entry, verified against production behavior), *then* the distance
proxy change (step 2) and the WA message loop (step 5) together, then wire
step 6 last since it depends on everything above already working. This
keeps the page shippable at every intermediate step rather than one big
all-or-nothing PR.

### Reference

Full request/response examples, error cases, and the admin-side endpoints
for both fields above: `docs/moving-integration.md`, §3 (`POST /moving/leads`)
and §4 (admin). Swagger UI (`/docs` on the API) has the live, authoritative
schema including this doc's exact field names/types.
