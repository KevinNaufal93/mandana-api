# Smart Storage — Floor Plan: API Response

Audience: `mandana-web`. Direct reply to
[`storage-floor-plan-requirements.md`](./storage-floor-plan-requirements.md), section
numbers below match theirs so this reads as a diff against what was asked. A second,
shorter reply below responds to the follow-up implementation-plan doc (the one with the
`version` hashing catch).

Companion docs: [`storage-integration.md`](./storage-integration.md) (the original
contract — still accurate for everything it covers) and
[`storage-floor-plan-requirements.md`](./storage-floor-plan-requirements.md) (their ask,
referenced throughout).

---

## §1–2 — current state & the gap

Both confirmed accurate against the code before any of this was built, not just taken on
trust: the 44-units/facility count, the SSE behavior (15s heartbeat, full snapshots,
`version`≡`ETag`), and the gap analysis (aggregate counts only, no per-unit identity, no
`on_hold` concept anywhere server-side). Nothing to add.

## §3 — `StorageUnit`: adopted, schema trimmed

Built essentially as proposed, with one deliberate difference driven by the §4 decision
below: **no `hold_booking_id` / `hold_expires_at`, and a 3-value status enum**
(`available | occupied | maintenance`), not 5. Nothing server-side will ever populate a
hold, so those columns would sit permanently null — worse than not having them. Adding
them back later, if the policy ever reverses, is a small additive migration, not a
rewrite.

```
storage_units
  id, facility_id, unit_type_id, code (unique per facility)
  grid_column, grid_row, column_span, row_span   -- all null this phase
  status            available | occupied | maintenance
  booking_id        set only while status = occupied
  is_active
```

`storage_inventory` is trimmed, not dropped — it keeps `monthlyRateOverride` + `isActive`
(still genuinely config), and drops `totalUnits`/`occupiedUnits`, which are now derived by
counting `storage_units` rows. Exactly the "don't leave two independently-writable sources
of truth" point from your doc — agreed, and it's what we did.

Migration seeded 88 rows from the existing per-type counts, codes numbered per facility +
type — `S-01..S-20`, `M-01..M-12`, `L-01..L-08`, `XL-01..XL-04` — matching the numbering
your own doc used as an example, so nothing needs renaming later. Positions are `null` for
all of them.

**New admin surface**, not in your original ask but worth knowing about:

```
GET|POST|PATCH|DELETE  /admin/storage/units[/:id]
POST                    /admin/storage/units/bulk   { facilityId, unitTypeId, count, codePrefix }
```

`bulk` adds ops-facing capacity in one call instead of one-row-at-a-time — the same
prefix+sequence logic the migration's own seed step needed, exposed as an endpoint. Not
part of the public page's contract; flagging in case whatever eventually becomes the
admin panel wants it.

## §4 — hold semantics: declined

Admin still resolves contention, exactly like today — no first-come-first-served, no
change to the booking-creation behavior at all. Two reasons, not just one:

1. **No client identity.** There's no customer auth anywhere in this system —
   `POST /storage/bookings` is `@Public()`, unauthenticated, rate-limited only by nothing.
   A hold that anyone can trigger with no way to attribute or throttle it is stock a bad
   actor (or just a bored browser tab) can tie up for 30 minutes with zero cost, repeatedly.
2. **It reuses zero existing infrastructure.** The atomic confirm-time allocation
   (`SELECT ... FOR UPDATE SKIP LOCKED`, described below) was already required by adopting
   §3 regardless of this decision — claiming specific rows instead of incrementing a
   counter needs real locking either way. Holds would add a _second_, genuinely new
   subsystem on top: an expiry sweep, an `expired` booking status, and idempotency-key
   handling to stop a retried request from burning two holds for one booking. None of that
   exists in this codebase today.

If this ever needs revisiting, it's a scoped follow-up — the transaction/locking
foundation is already in place, so adding a hold step at `create()` time later doesn't
require re-touching `confirm()`.

## §5 — `layout` block: adopted, trimmed to match §4

```jsonc
{
  "facilitySlug": "bsd-city",
  "facilityName": "Mandana Storage BSD City",
  "units": [
    {
      "unitTypeSlug": "medium",
      "total": 12,
      "available": 9,
      "occupied": 3,
      "maintenance": 0,
      "monthlyRate": 650000,
    },
  ],
  "layout": {
    "layoutVersion": "2026-08-16T09:00:00.000Z",
    "columns": null,
    "rows": null,
    "cellCm": 50,
    "units": [
      { "code": "M-01", "unitTypeSlug": "medium", "status": "available" },
      // gridColumn/gridRow/columnSpan/rowSpan omitted per unit — derive
      // from unitType.dimensions / cellCm until positions are populated
    ],
  },
}
```

No `onHold` — same reasoning as §3, a field that always reads `0` is worse than an absent
one. `occupied`/`maintenance` counts are new on the per-type summary row.
`cellCm` lives on the facility (`layoutCellCm`, default 50), not hardcoded, so a facility
with a different physical layout later isn't a schema change. `layoutVersion` only moves
when an admin edits positions — no such action exists yet, so it's constant for now; safe
to memoize placement on it starting today.

**Privacy, unchanged from the base contract:** the public snapshot builder reads
`code`/`unitTypeSlug`/`status` off `storage_units` and nothing else — never `bookingId`,
never anything requiring a join to `storage_bookings`. Same mechanism as always: a
dedicated public-only build path, not a filter applied after the fact.

## §6 — `unitCodes`: deferred, as you already gated it

Agreed it's meaningless before real positions exist. No action taken.

## §7 — both fixed

1. `POST /storage/bookings` now declares `@ApiCreatedResponse` — `/docs-json` says `201`,
   matching the actual `@HttpCode`.
2. `app.enableCors({ exposedHeaders: ['ETag'] })`, applied globally (not just on this one
   route) — anything else that ever sets an `ETag` gets the same fix for free.

---

## Reply to the follow-up doc

One real technical action item came out of that doc, and it's been built exactly as
requested:

**`version` hashes the complete per-facility object, `layout.units[]` included — not just
the aggregate counts.** Confirmed as a genuine gap in the first draft and closed before
anything shipped: the snapshot builder composes the summary `units[]` and `layout`
together into one object _first_, then hashes that whole thing. A same-type, net-zero
status swap (one unit `available→maintenance`, another `maintenance→available`) now
changes `version`, which means it also changes the `ETag` and triggers a real SSE
`availability` frame — verified as an explicit test case before merging (flip two units,
confirm the hash moves).

**The lockstep correction — agreed, fixed.** Nothing in this phase assumes the FE's
layout-present/positions-null handling path already exists. Ship whenever suits; there's
no dependency in either direction.

---

## Verification, if you want to confirm any of the above independently

- `GET /storage/availability`: per-type `total` equals `available + occupied + maintenance`
  for every type/facility, and `layout.units` length matches `total` per facility.
- Every unit's `gridColumn`/`gridRow`/`columnSpan`/`rowSpan` is absent (all positions
  null, this phase).
- Grep any response from the public endpoints/stream for `bookingId` — should return
  nothing.
- The `version`-hash case above: flip two units' status within one type so the aggregate
  counts don't move, confirm `version` still changes.

## Known gaps, unchanged from before

Multi-instance push still converges within one heartbeat (~15s) rather than instantly if
this ever runs on more than one API instance — today's single-instance deployment isn't
affected. Seeded rates/capacities are still placeholders pending ops sign-off.
