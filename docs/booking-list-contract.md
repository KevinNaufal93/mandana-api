# Pemesanan (Booking) List — Shared Query Contract

Audience: web admin, or anyone building an admin list screen against one of
the three "pemesanan" surfaces — `GET /admin/storage/bookings`,
`GET /admin/moving/bookings`, `GET /admin/event-support/bookings`. All three
now share one query-param vocabulary, so this doc is the single place that
vocabulary is defined; each module's own admin-integration doc links here
and covers only what's specific to it.

## Shared params (every list accepts all of these)

| Param | Meaning |
|---|---|
| `page` | 1-based, default `1`. |
| `limit` | Default `12`, max `100`. |
| `search` | Case-insensitive substring match over `reference`, customer name, phone, and email (where the module has one) — combined in a single OR, never split across separate filters. |
| `status` | Exact match against that module's own status enum (see each module's doc — the values differ, even though the shape doesn't). |
| `from` / `to` | Inclusive **Jakarta calendar days**, filtering on **`createdAt`** — when the pemesanan came in, not when the rental/event happens. Any time component you send is ignored; a full local day either side of the boundary counts. |
| `sortBy` | Allow-listed per module — always includes `createdAt` (default), `reference`, `total`; Storage and Event Support additionally allow `startDate`. An unrecognized value is a **400**, never silently ignored or passed through to SQL. |
| `sortOrder` | `asc` or `desc`, default `desc`. |

**Empty vs. omitted matters.** An empty `?status=` fails enum validation and
is a **400**. An empty `?search=`, `?from=`, etc. is simply a no-op filter,
not an error. **Omit a filter key you're not using — don't send it blank.**

**Sorting always has a stable tiebreaker.** Every list appends `id DESC`
after whatever `sortBy`/`sortOrder` you chose, so two rows sharing the same
`createdAt` (or the same `total`) never swap positions between pages.

## Per-module additions

Storage and Event Support — both of which have a rental/event window,
unlike Moving — additionally accept:

| Param | Meaning |
|---|---|
| `startFrom` / `startTo` | The booking's rental/event window **overlaps** this range — `endDate >= startFrom AND startDate <= startTo`. Despite the name, this is an overlap test against the whole window, not a start-date-only match: a booking that started before `startFrom` still matches if it hasn't ended yet. |

Storage also keeps its own module filters (`facilitySlug`, `unitTypeSlug`);
Event Support's booking list has no additional module filter today.

## Response shape

Unchanged: `{ "data": [...], "meta": { "total", "page", "limit", "totalPages" } }`.
Each module's own `*AdminDto` shape (and its own status enum's values) is
documented in that module's admin-integration doc.

## Why `from`/`to` mean `createdAt`, not the rental window

Before this contract, Moving's `from`/`to` already filtered `createdAt`
(there being nothing else to filter — a lead/booking has no window), while
Event Support's `from`/`to` filtered the *event window*. Unifying the two
required picking one meaning for the shared name — `createdAt` won because
"bookings that came in this week" is the more common admin question across
all three modules, and it's the one meaning Storage never had a filter for
at all. Event Support's old window-filter behavior didn't disappear — it
moved to `startFrom`/`startTo` unchanged.

**This was a breaking change for Event Support's existing admin page**,
which sent `from`/`to` expecting the old (window) semantics. The fix on the
consumer side is a mechanical rename — `from` → `startFrom`, `to` →
`startTo` — with no other behavior change.
