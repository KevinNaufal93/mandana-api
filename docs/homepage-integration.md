# Homepage & Listings — Frontend Integration Guide

Audience: `mandana-web`. This aligns the existing TanStack Query + `openapi-fetch`
layer to the **real** Mandana API. Your current `lib/api/schema.d.ts` is a
hand-written stub for endpoints/fields that don't exist — regenerate it and adjust
the three touch points below (client config, endpoints, mapper).

## 1. Base URL, versioning, and type generation

All routes live under **`/api/v1`**. Set the request base URL to include it:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
```

The OpenAPI spec is served at **`/docs-json`** (Swagger UI at `/docs`), and it
is **not** under `/api/v1`. Point codegen at the spec, not the API base:

```
openapi-typescript http://localhost:3000/docs-json -o lib/api/schema.d.ts
```

Update the `gen:api` script accordingly, then delete the hand-written stub.

## 2. Response envelope

Every response is wrapped as `{ "data": ... }`. Paginated lists are
`{ "data": [...], "meta": { total, page, limit, totalPages } }`. With
`openapi-fetch`, `const { data } = await api.GET(...)` gives you that body, so:

- List: `data.data` (array) + `data.meta`
- Homepage: `data.data` (object: `{ hero, collections, recommendations }`)

## 3. Endpoints you actually call

### `GET /homepage` (public) — powers hero **and** "Rekomendasi Untukmu"

Returns everything the landing page needs in one cacheable request. Response
includes ETag + `Cache-Control: max-age=60, stale-while-revalidate=300`. There
is **no** `/properties/featured` endpoint — use this instead.

```jsonc
{
  "data": {
    "hero": {
      "intervalMs": 5000,
      "slides": [
        {
          "id": "uuid",
          "title": "string | null",
          "subtitle": "string | null",
          "ctaText": "string | null",
          "ctaLink": "string | null",
          "sortOrder": 0,
          "imageOnly": false,
          "image": { "url": "...", "srcset": "...", "alt": "...", "width": 1920, "height": 1080 }
        }
      ]
    },
    "collections": [
      {
        "id": "uuid", "slug": "bsd-city", "name": "BSD City", "description": "string | null",
        "sortOrder": 0, "propertyCount": 4,
        "cover": { "url": "...", "srcset": "...", "alt": "...", "width": 1280, "height": 720 }
      }
    ],
    "recommendations": [
      {
        "id": "uuid", "slug": "rumah-mewah-bsd",
        "title": "Rumah Mewah di BSD City",
        "listingType": "sale",
        "price": 4200000000, "currency": "IDR",
        "bedrooms": 4, "bathrooms": 4, "areaSqm": 260,
        "area": "BSD City", "city": "Tangerang Selatan", "province": null,
        "propertyType": { "id": "uuid", "name": "House", "slug": "house" },
        "cover": { "url": "http://localhost:9000/assets/...", "alt": "..." }
      }
    ]
  }
}
```

### `GET /properties` (public) — search results grid

Query params (renamed from the old stub):

| Old stub param | Real param | Notes |
|---|---|---|
| `type` | `propertyTypeSlug` | slug string, e.g. `"house"` |
| `location` | `city` | partial match, case-insensitive |
| `priceMin` | `minPrice` | number |
| `priceMax` | `maxPrice` | number |
| `badge` | `listingType` | `"sale"` or `"rent"` |
| `bedrooms` | _(not supported)_ | drop from filters for now |
| `page`, `limit` | same | unchanged |

Each item: `{ id, slug, title, listingType, price, currency, bedrooms, bathrooms, areaSqm, area, city, province, propertyType, images[] }`.

`images[]` shape: `{ url, alt, isCover }` — the `isCover` flag marks the primary image.

### `GET /properties/{slug}` (public) — detail page

Returns `{ "data": <property> }` with the same shape as a list item.

## 4. Map API → your `Property` type (one shared mapper)

Presentation stays on the frontend by design — the API returns raw numbers/enums.
Dedupe the two copies of `toProperty` into `lib/api/mappers.ts`. Note the two
different image shapes: recommendations expose `cover`, list items expose `images[]`.

```ts
// lib/format.ts
export function formatIDRShort(v: number): string {
  const units: [number, string][] = [
    [1e12, "Triliun"], [1e9, "Miliar"], [1e6, "Juta"], [1e3, "Ribu"],
  ];
  for (const [factor, label] of units) {
    if (v >= factor)
      return `Rp ${(v / factor).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${label}`;
  }
  return `Rp ${v.toLocaleString("id-ID")}`;
}

export const composeLocation = (p: {
  area?: string | null;
  city?: string | null;
  province?: string | null;
}) => [p.area, p.city, p.province].filter(Boolean).join(", ");

export const badgeOf = (t: "sale" | "rent") => (t === "sale" ? "Dijual" : "Disewa");
```

```ts
// lib/api/mappers.ts
type PropertyCore = {
  id: string; slug: string; title: string; listingType: "sale" | "rent";
  price: number; bedrooms: number | null; bathrooms: number | null;
  areaSqm: number | null; area: string | null; city: string | null; province: string | null;
};

function base(c: PropertyCore, imageSrc?: string): Property {
  return {
    id: c.id, slug: c.slug, title: c.title,
    location: composeLocation(c),
    price: formatIDRShort(c.price),
    priceNote: c.listingType === "rent" ? "/ bulan" : undefined,
    beds: c.bedrooms ?? 0, baths: c.bathrooms ?? 0, area: c.areaSqm ?? 0,
    badge: badgeOf(c.listingType),
    imageSrc,
  };
}

export const recToProperty = (r: RecommendationDto): Property => base(r, r.cover?.url);
export const listToProperty = (p: PropertyListItemDto): Property =>
  base(p, (p.images.find((i) => i.isCover) ?? p.images[0])?.url);
```

Add `slug` to your `Property` type for detail page links. `"Dijual Cepat"` is
not derivable from `listingType` — drop it for now.

## 5. Recommended TanStack pattern (SSR prefetch + hydration)

The homepage is public and cacheable — fetch it server-side and hydrate so
client carousels read instantly from the pre-filled cache.

```ts
// lib/api/queries.ts
export const homepageQuery = () =>
  queryOptions({
    queryKey: ["homepage"],
    queryFn: async () => {
      const { data, error } = await api.GET("/homepage");
      if (error || !data) throw new Error("Failed to load homepage");
      return data.data; // { hero, collections, recommendations }
    },
    staleTime: 60_000,
  });

export const propertiesQuery = (filters: PropertyFilters = {}) =>
  queryOptions({
    queryKey: ["properties", filters],
    queryFn: async () => {
      const { data, error } = await api.GET("/properties", {
        params: { query: { page: 1, limit: 12, ...filters } },
      });
      if (error || !data) throw new Error("Failed to fetch properties");
      return { properties: data.data, meta: data.meta };
    },
  });
```

```tsx
// app/page.tsx (server component)
const qc = new QueryClient();
await qc.prefetchQuery(homepageQuery());

return (
  <HydrationBoundary state={dehydrate(qc)}>
    <Hero />
    <RecommendedProperties />
  </HydrationBoundary>
);
```

Hero and recommended components then call `useQuery(homepageQuery())` and read
`.hero.slides` / `.recommendations` (mapped via `recToProperty`). For the search
grid keep `usePropertySearch` but align its `PropertyFilters` to §3.

## 6. Images

Add the media host to `next.config.ts` (`images.remotePatterns`), or remote
`<Image>` will throw at runtime:

```ts
images: {
  remotePatterns: [
    { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" }, // dev (MinIO)
    // { protocol: "https", hostname: "cdn.mandana.id", pathname: "/**" },       // prod
  ],
}
```

Hero images ship both `url` and `srcset` for responsive loading. Property cover
images are a single `url` string.

## 7. Prerequisites & known gaps

- **API returns empty arrays until content is entered manually** — there is no
  seed. Insert at least one media asset, property, hero slide, and recommendation
  row directly in the DB to develop against. Handle empty/loading/error states in
  all components.
- **Admin user must be created via DB insert** — no public registration endpoint
  exists. Hash the password with bcrypt (rounds=10) and insert into the `users`
  table with `role = 'admin'`.
- **`bedrooms` search filter not yet supported** by the API — omit it from
  `PropertyFilters` until the backend adds it.
- **`gen:api` requires a running backend** — point it at
  `http://localhost:3000/docs-json` (not `/swagger.json`; NestJS uses `/docs-json`
  for the raw OpenAPI JSON).
