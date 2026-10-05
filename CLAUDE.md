# Mandana API: project context

NestJS + TypeORM + Postgres + Redis. It is one of three repos: `mandana-web` (public site) and `mandana-web-admin` (staff panel) both talk only to this API. Each has its own `CLAUDE.md`; the cross-repo overview and the recipe for an admin-editable value are in `mandana-web/CLAUDE.md`.

## Conventions

- Global prefix is `/api/v1`. Handlers return plain values and the global `TransformInterceptor` wraps them as `{ data }`. Swagger is at `/docs`, and the OpenAPI JSON at `/docs-json` (the frontends generate types from it).
- The global `ValidationPipe` uses `whitelist`, `forbidNonWhitelisted` and `transform`. An unknown field is a 400.
- **Auth:** every route is protected by default. `@Public()` opts out. Admin controllers use `@RequireModule(AccessModule.X)`. The enum is in `src/common/enums/access-module.enum.ts`. Admin role always passes; others go through `RbacService`. RBAC grants store the module as `varchar`, so a new enum value needs no `ALTER TYPE`, but giving editors the new module needs a migration `INSERT`.
- **Module names vs product names:** `event-support` is Mandana Living, `storage` is Mandana Space, `moving` is Mandana Move. Property is `properties`.
- **Phone validation:** there was none before WhatsApp numbers. `src/common/validation/whatsapp-number.ts` is the shared pattern, and `trimWhatsappNumber` runs before validation. The admin form mirrors the regex.
- A booking response carries a ready-made `whatsappMessage` (text only). The API stores a business WhatsApp number only in the settings singletons below; the website combines the two.

## Singleton settings and public config

`moving_settings`, `storage_settings`, `event_support_settings`, `seo_settings` and `property_settings` are one-row tables:

- Entity has `singleton` plus a UNIQUE constraint and a `CHECK (singleton = true)` in the migration.
- `service.get()` auto-seeds if the row is missing, so nothing downstream can 500 for missing config.
- `update()` uses `Object.assign` with `dto.x !== undefined &&` guards, and maps `""` to `null` for optional text.
- Admin routes are `GET`/`PATCH /admin/<area>/settings` (Property is `/admin/property-settings`).

`GET /site-config` (`src/modules/site-config/`) is the public read for the WhatsApp numbers and the KPR rate and tenor. `GET /seo` is the public read for SEO. **Every service that writes one of these must bust the matching cache** (`SiteConfigCacheService`, `SeoCacheService`).

## Redis caching rules

- **Cache the mapped payload, never the entity.** A cache hit comes back through JSON, which turns a `Date` into a string. A cached entity crashed `.toISOString()` on the second read of a legal page, and no unit test noticed.
- When several unrelated modules bust the same key, put the cache service in its own tiny module (`HomepageCacheModule`, `SiteConfigCacheModule`) to avoid circular imports.
- Bump the key version (`site-config:v1`, `homepage:v3`) whenever the payload shape changes.
- Public controllers that serve a cached payload (`/seo`, `/site-config`, `/homepage`) write the response themselves with an ETag/304. Do not `return` it through the interceptor.

## Migrations

- `src/database/migrations/<timestamp>-<Name>.ts`, loaded by glob, so there is no registry to edit. Timestamps step by `100000000`; the latest is `1790200000000-AddWhatsappNumbersAndPropertySettings`.
- Be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) and write a working `down()`.
- **Production migrations are run by hand,** never on boot: `docker compose -f docker-compose.prod.yml exec api npm run migration:run:prod`. Say so when handing a change over.
- Money columns are `numeric`, which `pg` returns as strings. Map them through `toNumber()` in the mapper. Percentages that need decimals are stored as basis points (an integer) and divided in the mapper (KPR rate: 175 means 1.75%).

## Tests, lint, build

- `npx jest` (all suites), `npx tsc --noEmit -p tsconfig.json`, `npx nest build`.
- **Any spec that imports `MediaService`** (directly or through a mapper such as `SeoMapper`) needs `jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));` at the top, because `uuid`'s ESM build has no transform.
- `npm run lint` runs `eslint --fix` over the whole tree and will rewrite unrelated files. Use `npx eslint <paths>` and `npx prettier --write <paths>` on only the files you touched. `seo.service.spec.ts` has a few existing `require-await` errors; do not add more (use `() => Promise.resolve(x)`).
- When a settings entity gains a required field, spec fixtures that build that entity literally must be updated too (`moving.service.spec.ts` builds a `MovingSettings`).

## Running it locally

- `docker compose up -d postgres redis` (Postgres on `localhost:5433`, Redis on `6380`, matching `.env`). Docker Desktop has to be running. Then `npm run migration:run` and `npm run start` (port 3000).
- **The local database already holds some users and properties.** Only delete rows you created. Remove your test rows by key (slug or email), reset any setting you changed, run `redis-cli FLUSHALL` and `docker compose down` when you finish.
- **There is no admin seed,** despite `SEED_ADMIN_*` in `.env`. To log in, insert a throwaway admin:
  ```
  HASH=$(node -e "console.log(require('bcrypt').hashSync('<password>',10))")
  docker compose exec -T postgres psql -U mandana -d mandana_db -c "INSERT INTO users (id,email,name,password_hash,role,is_active,\"createdAt\",\"updatedAt\") VALUES (uuid_generate_v4(),'throwaway@test.local','Throwaway','$HASH','admin',true,now(),now());"
  ```
  Then `POST /api/v1/auth/login` with `{ email, password }` and use `data.accessToken` as a Bearer token. Delete the user afterwards.
- Stop the server by port, not with `pkill` (see `mandana-web/CLAUDE.md`).
- **Test the real endpoints, not only the mocks.** A live PATCH and GET loop found two bugs that unit tests did not: validation ran before trimming (a pasted trailing space was a 400), and `@IsEmail` rejected the `""` the admin form sends to clear a field. Call a cached endpoint two or three times in a row so the cache-hit path runs too.

## Docs

`docs/` has one integration contract per area (moving, storage, event support, homepage, articles, RBAC, page images, content blocks) plus `deployment.md` and `web-admin-integration-guide.md`. Read the one for the area you are changing before exploring the code.
