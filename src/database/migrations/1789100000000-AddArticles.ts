import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Articles ("Artikel") module: admin-authored SEO content (buying guides,
 * KPR/mortgage explainers, market news) surfaced at `mandana-web`'s
 * `/artikel` route. See docs/articles-admin-integration.md.
 *
 * Shape mirrors `properties`/`property_types` — a lookup category table
 * plus a draft/published/archived-status content table with a slug,
 * sanitized-HTML body (see src/common/rich-text), a plain-text mirror for
 * reading-time/future search, an author FK reusing the existing `users`
 * table (no new author table needed), and a cover media FK reusing
 * `media_assets`.
 *
 * `published_at` is stamped by ArticlesService.update() on the first
 * DRAFT/ARCHIVED -> PUBLISHED transition only, so it stays stable across an
 * unpublish/republish cycle — this is what the public list order and any
 * future sitemap/JSON-LD `datePublished` reads, and must not be
 * `createdAt`.
 *
 * `edited_at` is separate from `updatedAt` (always populated by
 * @UpdateDateColumn, equal to createdAt on insert) — it's set only when a
 * PUBLISHED article is edited afterward, which is what the public
 * `updatedAt: string | null` contract field actually means.
 *
 * No FTS index: nothing in the current contract requires article-body
 * search (public GET /articles only filters by category) — body_text is
 * stored for reading-time computation and future search, same reasoning as
 * AddPropertySearchIndex's precedent, add one later the same way if needed.
 *
 * Also seeds a starter set of categories (ON CONFLICT DO NOTHING) so the
 * admin's article create form has something to select on day one, and
 * grants the new 'articles' RBAC module to the 'editor' role by default —
 * matching AddRoleModulePermissions' precedent for every other grantable
 * module. Note RbacService caches grants in Redis for 300s
 * (rbac:modules:${role}), so an editor may need up to 5 minutes (or an app
 * restart) to see this after the migration runs.
 */
export class AddArticles1789100000000 implements MigrationInterface {
  name = 'AddArticles1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "article_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        CONSTRAINT "PK_article_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_categories_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."articles_status_enum" AS ENUM('draft', 'published', 'archived')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "articles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "slug" character varying(255) NOT NULL,
        "title" character varying(255) NOT NULL,
        "excerpt" character varying(300) NOT NULL,
        "bodyHtml" text NOT NULL,
        "body_text" text NOT NULL,
        "status" "public"."articles_status_enum" NOT NULL DEFAULT 'draft',
        "reading_minutes" integer NOT NULL DEFAULT 1,
        "published_at" TIMESTAMP WITH TIME ZONE,
        "edited_at" TIMESTAMP WITH TIME ZONE,
        "meta_title" character varying(255),
        "meta_description" character varying(300),
        "category_id" uuid NOT NULL,
        "author_id" uuid,
        "cover_media_asset_id" uuid,
        CONSTRAINT "PK_articles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_articles_slug" UNIQUE ("slug"),
        CONSTRAINT "FK_articles_category" FOREIGN KEY ("category_id")
          REFERENCES "article_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_articles_author" FOREIGN KEY ("author_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_articles_cover_media" FOREIGN KEY ("cover_media_asset_id")
          REFERENCES "media_assets"("id") ON DELETE SET NULL
      )
    `);

    // Public list/detail query shape: WHERE status = 'published' ORDER BY
    // published_at DESC — partial index keeps it small and matches exactly.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_articles_published_at"
        ON "articles" ("published_at" DESC)
        WHERE "status" = 'published'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_articles_category"
        ON "articles" ("category_id")
    `);

    await queryRunner.query(`
      INSERT INTO "article_categories" ("id", "name", "slug", "createdAt", "updatedAt")
      VALUES
        (uuid_generate_v4(), 'Panduan Beli',  'panduan-beli',  NOW(), NOW()),
        (uuid_generate_v4(), 'KPR',           'kpr',           NOW(), NOW()),
        (uuid_generate_v4(), 'Berita Pasar',  'berita-pasar',  NOW(), NOW()),
        (uuid_generate_v4(), 'Tips Investasi','tips-investasi',NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_module_permissions" ("role", "module")
      VALUES ('editor', 'articles')
      ON CONFLICT ON CONSTRAINT "UQ_role_module_permissions_role_module" DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role_module_permissions" WHERE "role" = 'editor' AND "module" = 'articles'
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_articles_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_articles_published_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "articles"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."articles_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "article_categories"`);
  }
}
