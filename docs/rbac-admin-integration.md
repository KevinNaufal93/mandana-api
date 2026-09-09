# RBAC (Roles & Permissions) — Web Admin Integration Guide

Audience: `mandana-web-admin`. Covers three things that changed together:
(1) `editor` can now actually log in and use the panel — see §2 for what
that means for the login flow you already have; (2) a new module ×
role permission matrix, managed at `/admin/rbac`; (3) every existing
`admin/*` endpoint's authorization now falls into one of two buckets —
RBAC-grantable, or still hard-role-gated — see §5 for which is which.

The reference implementation for everything in this doc already exists
in `mandana-web-admin` — `lib/auth/dal.ts` (`requireModule`/
`requireAdmin`), `lib/ui/nav-items.ts` (sidebar filtering), and
`app/(app)/rbac/` (the matrix screen). This doc explains the contract
those files are built against, for anyone extending them.

## 1. Base URL, auth & response envelope

Same as every other admin surface: `/api/v1/admin/rbac/*`, spec at
`/docs-json` (tagged `admin / rbac`), Bearer JWT from
`POST /api/v1/auth/login`. Unlike most modules in this API, the RBAC
endpoints themselves are **not** grantable — they're hard-gated to the
`admin` role the same way `/admin/users` is (see §5), on purpose: the
screen that manages the permission matrix can never be granted away
through that same matrix. `{ "data": ... }` envelope throughout, same
error shape as everywhere else (§8).

## 2. What changed about logging in

Before this feature, `editor` was a role with no privileges at all —
every `admin/*` route 403'd, so the accounts existed but nothing they
did with them worked. That's no longer true. Two consequences for the
login flow:

- **Credentials being valid is no longer sufficient by itself, but the
  failure condition changed.** It used to be "role isn't admin." Now
  it's "the account is inactive, or has been granted zero modules" —
  the latter is a real, if unusual, state: a brand-new `editor` account
  before anyone has touched `/rbac` for that role, or every module for
  `editor` deliberately revoked. `'dashboard'` (see §3) is always-on
  for every active user, so in practice this only fires for a
  deactivated account today — but check `modules.length === 0`
  explicitly rather than assuming it can't happen.
- **A successful login no longer implies every screen is reachable.**
  Gate each page against the caller's `modules` (§4), not against
  `role === "admin"`.

`mandana-web-admin`'s own login gate (`app/actions/auth.ts`) and render
boundary (`lib/auth/dal.ts`'s `getCurrentUser()`) already implement
this — `role !== "admin"` became `!isActive || modules.length === 0`.
If you're reading this because you're building a **second** client
against this API, copy that pattern, not the old admin-only one.

## 3. The module catalog

`GET /admin/rbac/modules` — the fixed, closed set of product modules.
This is metadata, not per-user state; it changes only when the backend
ships a new module.

```jsonc
// GET /api/v1/admin/rbac/modules →
{ "data": [
  { "key": "dashboard", "label": "Dashboard",
    "description": "Halaman utama panel admin.",
    "grantable": false, "alwaysOn": true },
  { "key": "properties", "label": "Property Management",
    "description": "Kelola properti, fasilitas, dan koleksi.",
    "grantable": true, "alwaysOn": false },
  { "key": "event-support", "label": "Event Support",
    "description": "Kelola layanan dan pemesanan Event Support.",
    "grantable": true, "alwaysOn": false },
  { "key": "storage", "label": "Smart Storage",
    "description": "Kelola fasilitas, unit, dan pemesanan Smart Storage.",
    "grantable": true, "alwaysOn": false },
  { "key": "moving", "label": "Moving Support",
    "description": "Kelola armada, add-on, dan pemesanan Moving Support.",
    "grantable": true, "alwaysOn": false },
  { "key": "content-media", "label": "Content Media Management",
    "description": "Kelola media, konten halaman, dan homepage.",
    "grantable": true, "alwaysOn": false },
  { "key": "users", "label": "User Management",
    "description": "Kelola akun admin dan editor. Hanya untuk admin.",
    "grantable": false, "alwaysOn": false },
  { "key": "notifications", "label": "Notifikasi",
    "description": "Notifikasi admin real-time.",
    "grantable": true, "alwaysOn": false },
  { "key": "rbac", "label": "Roles & Permissions",
    "description": "Kelola hak akses modul per peran. Hanya untuk admin.",
    "grantable": false, "alwaysOn": false } ] }
```

Two flags per row, and they mean different things — don't conflate
them:

- **`alwaysOn: true`** — every active user has this module, `admin` or
  not, and it can never appear unchecked in the matrix UI. Only
  `dashboard` today. It is *never* stored as a grant row (§4's PUT is
  a no-op if you send it) — it's unioned into every read in code, so
  it can't be revoked by a bad write.
- **`grantable: false`** (and not `alwaysOn`) — the opposite kind of
  fixed: can **never** be granted to a non-admin role, checked
  server-side independent of the UI (§4's PUT rejects it with 400).
  `users` and `rbac` today. `users` specifically is non-grantable as a
  deliberate anti-escalation measure — see §5.

`label` is English (matches the sidebar's existing English labels);
`description` is Indonesian (matches the rest of the panel's body
copy) — render them as-is, don't re-translate.

## 4. The permission matrix

`GET /admin/rbac/permissions` — one entry per `UserRole`:

```jsonc
// GET /api/v1/admin/rbac/permissions →
{ "data": [
  { "role": "admin",
    "modules": ["dashboard", "properties", "event-support", "storage",
                "moving", "content-media", "users", "notifications", "rbac"],
    "locked": true },
  { "role": "editor",
    "modules": ["properties", "event-support", "storage",
                "content-media", "moving", "dashboard"],
    "locked": false } ] }
```

- **`locked: true`** means "don't render editable checkboxes for this
  row" — today that's `admin` only, whose `modules` is always the full
  catalog and is computed in code, never read from a table (there are
  no `admin` rows in the underlying `role_module_permissions` table at
  all — that's intentional, see the entity's own doc comment in
  `mandana-api`: it makes an admin lockout structurally impossible).
- **`modules` order is not meaningful.** It's DB row order for the
  stored grants with the always-on modules appended, not catalog order
  or alphabetical — treat it as a set (`.includes()`), never index into
  it or diff it positionally. `mandana-web-admin`'s
  `components/rbac/permission-matrix.tsx` builds a `Set` from it for
  exactly this reason.

`PUT /admin/rbac/permissions/:role` replaces one role's **entire**
grant set — not a toggle-one-module endpoint:

```jsonc
// PUT /api/v1/admin/rbac/permissions/editor
// body: { "modules": ["properties", "event-support", "storage", "content-media"] }
// →
{ "data": { "role": "editor",
            "modules": ["properties", "event-support", "storage", "content-media", "dashboard"],
            "locked": false } }
```

Send the **full** desired set every time (checked + unchecked state of
every grantable row in the UI), not a diff. Two things that look like
they should be errors and aren't, plus two that are:

- **Including an always-on module (`dashboard`) in the body is fine —
  it's silently ignored, not rejected.** This matters in practice: the
  natural client pattern is "PUT back what GET returned, with the
  boxes the admin changed" — and GET always includes `dashboard`. Do
  not filter it out before sending; the API already treats it as a
  no-op either way.
- **Omitting a module that's currently granted revokes it.** There's no
  separate "add" vs. "remove" call.
- **`role: "admin"` → 400**, always — `Role 'admin' has implicit access
  to every module and cannot be edited.` Don't render editable
  checkboxes for the admin column at all (§4's `locked` flag is exactly
  this signal).
- **Any module with `grantable: false` in the body (other than an
  always-on one) → 400** — `The following modules cannot be granted:
  users` (message lists every offending key). This is enforced
  server-side regardless of what the UI shows, so a stale client-side
  module list can't be used to grant `users` by hand-crafting the
  request.

## 5. How this changes every *other* admin endpoint

Every `admin/*` controller now falls into exactly one of two buckets.
This is the piece you need to know per-screen, not just for `/rbac`
itself:

| Module | Grantable to editor | Existing admin routes it gates |
|---|---|---|
| `properties` | ✅ | `/admin/properties`, `/admin/amenities`, `/admin/collections` |
| `event-support` | ✅ | `/admin/event-support`, `/admin/event-support/bookings`, `/admin/event-support/settings` |
| `storage` | ✅ | `/admin/storage`, `/admin/storage/units`, `/admin/storage/bookings` |
| `moving` | ✅ | `/admin/moving/truck-classes`, `/admin/moving/addons`, `/admin/moving/bookings`, `/admin/moving/settings` |
| `content-media` | ✅ | `/admin/media`, `/admin/content-blocks`, `/admin/homepage` |
| `users` | ❌ admin-only | `/admin/users` |
| `notifications` | ✅ | `/admin/notifications` (+ its SSE stream — see below) |
| — | ❌ admin-only, no UI today | `/admin/inquiries` — not RBAC-grantable; there's no admin-panel screen for it yet, so it stayed on the hard role check rather than being given a module nobody can reach |

**Nothing about calling these routes changed shape-wise** — same DTOs,
same response envelopes, same `docs/*-admin-integration.md` for each
one. What changed is *who* can get a 200: an `editor` token now
succeeds on a granted module's routes instead of always getting 403.
An **ungranted** module still 403s for `editor`, identically to before
this feature shipped — `GET /admin/moving/bookings` with an editor
token whose grants don't include `moving` still returns:

```jsonc
{ "statusCode": 403, "timestamp": "...", "path": "/api/v1/admin/moving/bookings",
  "error": { "message": "Forbidden resource", "error": "Forbidden", "statusCode": 403 } }
```

— so existing 403-handling in the frontend for these routes doesn't
need to change; only the *login-time and navigation-time* gating
around them does (§2, §6).

**`users` is deliberately not grantable — this is an anti-escalation
measure, not an oversight.** An editor with user CRUD could create or
promote an account to `admin`; keeping `/admin/users` hard-role-gated
(independent of the matrix) closes that off at the API layer regardless
of what the matrix ever allows.

**`notifications` is grantable, including its SSE stream — not just its
REST routes.** This needed more than flipping `grantable`, because a
stream authenticates differently: `POST /admin/notifications/stream-ticket`
is a normal Bearer-authenticated call (gated like any other route in the
table above), but `GET /admin/notifications/stream` itself authenticates
via a short-lived `?ticket=` — `EventSource` can't send an `Authorization`
header — checked by its own Passport strategy, not by the matrix directly.
That strategy now re-checks the live grant on every connection (not just
once at ticket-mint time), and the ticket itself carries a `module` claim
so a ticket minted for one stream can't be replayed against a different
one — load-bearing once different roles can hold different subsets of
grantable modules, where before every admin stream was equivalent because
every caller who could reach one could reach all of them. `storage`'s
identical SSE stream picked up the same live-grant re-check as part of
this change, since both streams share the same strategy shape (see
`mandana-api/src/modules/auth/strategies/jwt-stream.strategy.ts`) — not a
new capability for `storage` (it was already grantable), just a latent gap
closed: previously an editor granted `storage` got the REST routes but the
stream ticket strategy still hard-coded an `admin` check underneath.

## 6. `GET /auth/me` now returns the caller's modules

```jsonc
// GET /api/v1/auth/me (as editor) →
{ "data": {
  "id": "...", "email": "editor@mandana.com", "name": "...",
  "role": "editor", "isActive": true,
  "title": null, "phone": null, "whatsapp": null,
  "photoMediaAssetId": null, "photo": null,
  "modules": ["properties", "event-support", "storage",
              "content-media", "moving", "dashboard"] } }
```

`modules` is the union of the caller's role's grants and every
always-on module — for `role: "admin"` it's always the full catalog.
This is **additive to `GET /auth/me` only** — the same `UserDto` shape
returned by every `/admin/users` route (list, single, create, update)
does **not** carry `modules`, on purpose: there it would describe
someone else's grants, and cost a lookup per row for a field nothing
there reads. Don't expect `modules` on a `listUsers()`/`getUser()`
response; it only ever comes from `/auth/me`.

Use it for exactly two things, both already wired in
`mandana-web-admin`:

- **Sidebar filtering** — `lib/ui/nav-items.ts`'s `visibleNavItems()`
  filters `NAV_ITEMS` by `modules.includes(item.module)`. This is
  presentation only, not a security boundary (see next point) — it
  just keeps the rail honest about what the viewer can actually reach.
- **Per-page render guards** — `lib/auth/dal.ts`'s `requireModule(key)`
  and `requireAdmin()`, called as the first statement of every page
  under `app/(app)/` (mirroring the pre-existing `getCurrentUser()`
  convention documented in §1 of the general integration guide).
  `requireModule` redirects to `/` when the module is missing;
  `requireAdmin` redirects to `/` when `role !== "admin"` — used on the
  two hard-role-gated screens (`/users`, `/rbac`) instead. **This is
  the actual security boundary** — hiding the sidebar link is not.

## 7. Freshness — no re-login required, but no push either

A grant change made via `PUT /admin/rbac/permissions/:role` takes
effect on that role's **very next request** — `request.user` on the API
side is the live DB row on every call, not something baked into the JWT
at login time, and the grant lookup itself is cached for a few minutes
behind an explicit invalidation on every write (see `RbacService` in
`mandana-api`). Concretely: if an admin revokes `moving` from `editor`
while an editor is actively using the panel, that editor's *next*
navigation or API call reflects it immediately — no forced logout, no
token refresh needed, nothing for the frontend to do.

There is, however, **no push notification of a grant change to an
already-open tab** — an editor sitting on `/moving/truck-classes` when
access is revoked won't be kicked out until they navigate again (client
router cache aside, this is the same "next request" semantics every
other server-rendered page in this app already has, not something RBAC
introduces).

## 8. Errors

Same envelope as the rest of the API — `{ statusCode, timestamp, path,
error: { message, error, statusCode } }`. Specific to this module:

| Status | When |
|---|---|
| 400 | `PUT .../admin` (role is locked) |
| 400 | `PUT` including a non-grantable, non-always-on module |
| 403 | Any `/admin/rbac/*` route called by a non-admin token |
| 403 | Any other `admin/*` route called by a role missing the module that gates it (§5) — unchanged from before this feature |
| 404 | `PUT .../:role` with a value that doesn't parse as a `UserRole` (`ParseEnumPipe`) |

## 9. Regenerating your API types

Same as every other module — spec at `/docs-json`, re-run `gen:api`.
Worth calling out here specifically: unlike `/admin/users` and
`/auth/*` (which are hand-typed in `lib/api/users.ts` /
`lib/api/auth-endpoints.ts` because their generated schema entries are
`content?: never`), every `/admin/rbac/*` route carries a real
`@ApiOkResponse({ type })`, so `lib/api/rbac.ts` can and does use the
generated `components["schemas"][...]` types directly — no hand-rolled
response interfaces needed there, and none should be added.
