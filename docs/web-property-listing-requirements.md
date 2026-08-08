# API Requirements — Web Property Listing Page

> Handoff spec for the **mandana-api** agent. These are the backend changes the
> new web listing page (`/properties` in `mandana-web`) needs. The page is
> already live and wired to `GET /properties` and `GET /property-types`; the
> items below unblock its filters and sorting.

## Current state

| Endpoint | Status |
| --- | --- |
| `GET /properties` | ✅ Pagination + filters work: `listingType`, `city` (partial LIKE), `propertyTypeSlug`, `minPrice`, `maxPrice`, `isFeatured`. `meta { total, page, limit, totalPages }` is complete. Sort is **hardcoded** `createdAt DESC`. |
| `GET /property-types` | ⚠️ Returns `[]` — no types are seeded and there's no way to create them. |

**Do not change the response envelope.** The web relies on the `TransformInterceptor`
behavior: paginated handlers return `{ data, meta }` (passed through), other
handlers return `{ data }`. Keep `GET /properties` returning `{ data, meta }` at
the top level and `GET /property-types` returning `{ data: [...] }`.

---

## Task 1 — Seed property types  ⛔ BLOCKER

**Problem:** `GET /property-types` is empty, so the web "Jenis Properti" dropdown
falls back to static options and `?propertyTypeSlug=…` matches nothing.

**Do:**
1. Add a migration that inserts the canonical types. **Slugs must match the web
   exactly** (see `mandana-web/lib/data.ts` → `propertyTypes`):

   | name | slug |
   | --- | --- |
   | Rumah | `rumah` |
   | Apartemen | `apartemen` |
   | Townhouse | `townhouse` |
   | Villa | `villa` |
   | Kavling | `kavling` |
   | Ruko | `ruko` |

2. Backfill existing published properties with a `propertyTypeId` so filtering by
   type actually returns rows (currently `propertyTypeId` is null on seed data).

**Files:** new migration in `src/database/migrations/`;
`src/modules/properties/entities/property-type.entity.ts` (reference only).

**Optional (nice-to-have):** add an admin CRUD for property types
(`PropertyTypesController` + service methods, `@Roles(ADMIN)`) so ops can manage
categories without migrations. Not required to unblock the web.

**Acceptance:**
- `GET /property-types` → the 6 types above.
- `GET /properties?propertyTypeSlug=villa` → only villas.

---

## Task 2 — Bedroom filter ("Kamar")

**Problem:** the public endpoint has no bedroom filter, so the web "Kamar" chip
can't be wired. The `Property.bedrooms` column already exists.

**Do:** add `minBedrooms` to `QueryPropertiesDto` and one `andWhere` in
`findAll`. Semantics: **`bedrooms >= N`** (so `3` means "3+").

```ts
// query-properties.dto.ts
@ApiPropertyOptional({ minimum: 0 })
@IsOptional()
@Type(() => Number)
@IsInt()
@Min(0)
minBedrooms?: number;
```
```ts
// properties.service.ts → findAll
if (minBedrooms !== undefined)
  qb.andWhere('p.bedrooms >= :minBedrooms', { minBedrooms });
```

**Files:** `src/modules/properties/dto/query-properties.dto.ts`,
`src/modules/properties/properties.service.ts`.

**Contract:** web sends `?minBedrooms=3`.

**Acceptance:** `?minBedrooms=3` returns only properties with 3 or more bedrooms.

---

## Task 3 — Server-side sort

**Problem:** sort is fixed `createdAt DESC`; there's no user-selectable sort. The
client cannot sort across pages (it only holds one page), so this must be done in
the DB before pagination.

**Do:** add a `sort` enum param to `QueryPropertiesDto`, applied in `findAll`
before `.skip/.take`. Agreed web ↔ api values:

| `sort` value | Order | Notes |
| --- | --- | --- |
| `newest` | `createdAt DESC` | **default** (current behavior) |
| `oldest` | `createdAt ASC` | |
| `price_asc` | `price ASC` | numeric — `price` is a decimal column |
| `price_desc` | `price DESC` | |

```ts
// src/modules/properties/enums/property-sort.enum.ts
export enum PropertySort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
}
```
```ts
// properties.service.ts → findAll (replace the fixed orderBy)
const orderMap = {
  [PropertySort.NEWEST]: ['p.createdAt', 'DESC'],
  [PropertySort.OLDEST]: ['p.createdAt', 'ASC'],
  [PropertySort.PRICE_ASC]: ['p.price', 'ASC'],
  [PropertySort.PRICE_DESC]: ['p.price', 'DESC'],
} as const;
const [col, dir] = orderMap[sort ?? PropertySort.NEWEST];
qb.orderBy(col, dir).skip(offset).take(limit);
```

**Files:** new `src/modules/properties/enums/property-sort.enum.ts`;
`query-properties.dto.ts`; `properties.service.ts`.

**Contract:** web sends `?sort=price_asc`.

**Acceptance:** `?sort=price_asc` orders ascending by numeric price consistently
across pages; omitting `sort` behaves exactly as today.

---

## Task 4 — Pagination  ✅ NO CHANGE

`meta { total, page, limit, totalPages }` is already complete and `limit` is
honored (capped at 100 by `PaginationQueryDto`). The web consumes it as the
source of truth and does not recompute totals. Just keep echoing `limit` in
`meta` — the web reads it for the "Menampilkan X–Y dari N" label.

---

## Optional — broader location search

The web "Cari lokasi" box maps to `city` (partial LIKE), which is sufficient. If
you want it to also match `address` / `area` / `title`, add a `search` param to
`QueryPropertiesDto` like the admin endpoint already has. Coordinate the param
name with the web before implementing.

---

## Full query-param contract — `GET /properties`

| Param | Type | Notes |
| --- | --- | --- |
| `page` | int ≥ 1 | default 1 |
| `limit` | int 1–100 | default 12 |
| `listingType` | `sale` \| `rent` | |
| `city` | string | partial, case-insensitive |
| `propertyTypeSlug` | string | needs Task 1 |
| `minPrice` | int (IDR) | |
| `maxPrice` | int (IDR) | |
| `isFeatured` | bool | |
| `minBedrooms` | int ≥ 0 | **NEW — Task 2** |
| `sort` | enum | **NEW — Task 3** |

Response stays `{ data: PropertyListItemDto[], meta: { total, page, limit, totalPages } }`.
