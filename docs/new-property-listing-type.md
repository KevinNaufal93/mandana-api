# API Handoff — "Properti Baru" (New Property Listing Type)

> Handoff spec for **mandana-web**. `ListingType` gained a third value, `new`
> ("Properti Baru" — brand-new units sold directly by a developer), alongside
> the existing `sale` ("Dijual") and `rent` ("Disewa"). Treatment is otherwise
> identical to `sale`: same fields, same admin CRUD, same public endpoints, same
> response envelope.

## What changed

| Surface | Change |
| --- | --- |
| `listingType` | Now `"sale"` \| `"rent"` \| `"new"` everywhere it appears — `GET /properties`, `GET /properties/:slug`, `GET /properties/:slug/similar`, `GET /homepage` recommendations, collection cards. |
| Every card/detail response | Two new fields, `handoverDate` and `constructionStatus` (see below). Additive — nothing existing was renamed or removed. |
| `POST/PATCH /admin/properties` | Accepts `listingType: "new"` plus `handoverDate`/`constructionStatus`. |

No new routes, no new query params beyond the existing `listingType` filter accepting
one more value.

## The two new fields

Present on every property card and detail payload; only ever non-`null` when
`listingType` is `"new"`:

```jsonc
{
  "listingType": "new",
  "handoverDate": "2027-06-30",
  "constructionStatus": "under_construction"
}
```

- **`handoverDate`** — `string | null`, `YYYY-MM-DD`. Expected completion/handover date
  from the developer.
- **`constructionStatus`** — `"ready" | "under_construction" | null`.

Both are always `null` on `sale`/`rent` listings.

## Filtering

`GET /properties?listingType=new` returns only properti baru listings — same
pagination, sort, `city`/`propertyTypeSlug`/`price`/`bedrooms` filters as `sale`/`rent`.

⚠️ **Breaking for any page that relied on "no `listingType` = sale + rent":** an
unfiltered `GET /properties` now returns all three types mixed together. If a page
(e.g. a "Dijual & Disewa" combined view) needs to keep excluding properti baru, it must
now filter explicitly rather than relying on the absence of a third value.

## Frontend action items

1. **Badge mapping.** `docs/homepage-integration.md` documents:
   ```ts
   const badgeOf = (t: "sale" | "rent") => t === "sale" ? "Dijual" : "Disewa";
   ```
   This falls through to `"Disewa"` for `"new"` — wrong. Change it to an explicit
   three-way map:
   ```ts
   const badgeOf = (t: "sale" | "rent" | "new") =>
     t === "sale" ? "Dijual" : t === "rent" ? "Disewa" : "Properti Baru";
   ```

2. **Price suffix.** The existing rule appends `"/ bulan"` when `listingType === "rent"`.
   That's still correct as-is for `"new"` (no suffix), but recommend making it an
   explicit three-way check too, so it doesn't silently rely on `"new" !== "rent"`.

3. **"Jenis Properti" vs listing type.** `propertyTypeSlug` (Rumah/Apartemen/Villa/…)
   is unrelated to `listingType` — a properti baru listing still has a normal
   `propertyType`. No change needed there.

4. **New UI, optional:** `handoverDate`/`constructionStatus` aren't rendered anywhere
   yet. If the properti baru detail page wants a "Serah Terima: Q2 2027" /
   "Sedang Dibangun" badge, source it from these two fields.

## Admin payload

`POST /admin/properties` / `PATCH /admin/properties/:id`:

```jsonc
{
  "title": "Cluster Anggrek Tower A",
  "listingType": "new",
  "price": 850000000,
  "handoverDate": "2027-06-30",
  "constructionStatus": "under_construction"
}
```

`handoverDate`/`constructionStatus` are rejected with **400** if sent while
`listingType` is `sale` or `rent` (existing or in the same request). Switching an
existing `new` listing's `listingType` away to `sale`/`rent` clears both fields back to
`null` automatically.

## Nothing else changes

Everything else about properties — images, amenities, agent, rich-text description,
location privacy/fuzzing, `/similar` recommendations staying within the same
`listingType` — behaves exactly the same for `new` as it already does for `sale`/`rent`.
