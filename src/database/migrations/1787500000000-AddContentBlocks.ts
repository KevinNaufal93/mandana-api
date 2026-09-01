import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces `hero_slides` and the (locally-only, never-shared)
 * `service_cards` table with one unified `content_blocks` table —
 * see ContentBlockType/ContentBlock for the full rationale. Both were
 * "simple ordered, admin-editable, optionally-imaged" homepage lists
 * differing mainly in field *names* (hero's `subtitle`/`ctaLink` are the
 * same role as a service card's `description`/`href`) and in one rule:
 * a hero slide requires an image, other block types don't.
 *
 * That rule survives the merge as a single CHECK constraint,
 * `chk_content_blocks_hero_requires_media`. No trigger is needed for
 * this: Postgres re-validates a table's CHECK constraints on every
 * UPDATE, and a referential action (this table's `media_asset_id` FK is
 * `ON DELETE SET NULL`) is implemented internally as an ordinary UPDATE —
 * so deleting a media asset still referenced by a hero block fails the
 * CHECK exactly as it would have failed `hero_slides`' old
 * `ON DELETE RESTRICT`, and a direct `UPDATE ... SET media_asset_id =
 * NULL` on a hero row is *also* rejected, which plain `ON DELETE
 * RESTRICT` never protected against in the first place.
 *
 * Existing `hero_slides` rows are migrated in with their original ids.
 * `service_cards` never shipped anywhere (added and reverted within the
 * same branch), so its four rows are re-seeded directly here instead of
 * being copied from a table nobody else's database ever had.
 */
export class AddContentBlocks1787500000000 implements MigrationInterface {
  name = 'AddContentBlocks1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."content_block_type_enum" AS ENUM('hero', 'service_card');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE "content_blocks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "type" "public"."content_block_type_enum" NOT NULL,
        "media_asset_id" uuid,
        "title" character varying(255),
        "subtitle" character varying(500),
        "cta_text" character varying(100),
        "link" character varying(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_content_blocks" PRIMARY KEY ("id"),
        CONSTRAINT "chk_content_blocks_hero_requires_media"
          CHECK ("type" <> 'hero' OR "media_asset_id" IS NOT NULL)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "fk_content_blocks_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_content_blocks_type_active_sort"
        ON "content_blocks" ("type", "is_active", "sort_order")
    `);

    // Migrate existing hero_slides rows in with their original ids —
    // cta_link -> link is the only rename; every other column keeps its
    // name and meaning.
    await queryRunner.query(`
      INSERT INTO "content_blocks"
        ("id", "createdAt", "updatedAt", "type", "media_asset_id",
         "title", "subtitle", "cta_text", "link", "sort_order", "is_active")
      SELECT
        "id", "createdAt", "updatedAt", 'hero', "media_asset_id",
        "title", "subtitle", "cta_text", "cta_link", "sort_order", "is_active"
      FROM "hero_slides"
    `);

    await queryRunner.query(`DROP TABLE "hero_slides"`);

    // service_cards was only ever created by a migration on this same
    // branch that was reverted before merging — there is no data to
    // migrate from it anywhere. Re-seed its four rows directly.
    await queryRunner.query(`
      INSERT INTO "content_blocks"
        ("type", "title", "subtitle", "link", "sort_order", "is_active")
      VALUES
        ('service_card', 'Moving Support', 'Layanan pindahan aman cepat dan terpecaya.', '/moving', 0, true),
        ('service_card', 'Smart Storage', 'Gudang fleksibel untuk barangmu, kapan dan di mana kamu butuh.', '/storage', 1, true),
        ('service_card', 'Event Support', 'Dukungan acara rumah baru yang berkesan dan bebas repot.', '/event-support', 2, true),
        ('service_card', 'Kebutuhan Lainnya', 'Dukungan pengembangan tanah dan rumah anda di mandana.id', NULL, 3, true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "hero_slides" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "media_asset_id" uuid NOT NULL,
        "title" character varying(255),
        "subtitle" character varying(500),
        "cta_text" character varying(100),
        "cta_link" character varying(500),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_hero_slides" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "hero_slides"
        ADD CONSTRAINT "fk_hero_slides_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      INSERT INTO "hero_slides"
        ("id", "createdAt", "updatedAt", "media_asset_id",
         "title", "subtitle", "cta_text", "cta_link", "sort_order", "is_active")
      SELECT
        "id", "createdAt", "updatedAt", "media_asset_id",
        "title", "subtitle", "cta_text", "link", "sort_order", "is_active"
      FROM "content_blocks"
      WHERE "type" = 'hero'
    `);

    await queryRunner.query(`DROP TABLE "content_blocks"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."content_block_type_enum"`,
    );
  }
}
