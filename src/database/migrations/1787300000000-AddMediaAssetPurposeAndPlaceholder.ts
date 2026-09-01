import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `purpose` (hero/cover/icon), an LQIP `placeholder` (small base64
 * WebP data URI for instant-paint blur-up), and `original_key` (the
 * as-uploaded source, so variants can be regenerated later without asking
 * the admin to re-upload) to `media_assets`.
 *
 * Behaviour-neutral for existing rows: `purpose` is backfilled from the
 * width ladder each asset was actually generated with (heroWidths peaked
 * at 1920/1280, coverWidths at 800 — see the pre-existing
 * `ImageProcessorService`), so no row's classification depends on a guess.
 * `placeholder`/`original_key` are left NULL for pre-existing rows; see
 * `MediaService.backfillPlaceholders` for the admin-triggered follow-up
 * that fills `placeholder` in from the smallest stored webp variant.
 */
export class AddMediaAssetPurposeAndPlaceholder1787300000000 implements MigrationInterface {
  name = 'AddMediaAssetPurposeAndPlaceholder1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."media_assets_purpose_enum" AS ENUM('hero', 'cover', 'icon');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
        ADD COLUMN IF NOT EXISTS "purpose" "public"."media_assets_purpose_enum",
        ADD COLUMN IF NOT EXISTS "placeholder" text,
        ADD COLUMN IF NOT EXISTS "original_key" text
    `);

    // Backfill: the 1280 clause matters because `withoutEnlargement: true`
    // means a hero uploaded from a <1920px source has no "1920" key, and
    // would be misclassified as `cover` (which tops out at 800) without it.
    // jsonb_exists() rather than the `?` operator — `?` is a bound-parameter
    // placeholder to several pg drivers/tools and is a footgun in raw SQL.
    await queryRunner.query(`
      UPDATE "media_assets" SET "purpose" = 'hero'
      WHERE "purpose" IS NULL
        AND (jsonb_exists("variants" -> 'webp', '1920')
             OR jsonb_exists("variants" -> 'webp', '1280'))
    `);
    await queryRunner.query(`
      UPDATE "media_assets" SET "purpose" = 'cover' WHERE "purpose" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "media_assets"
        ALTER COLUMN "purpose" SET NOT NULL,
        ALTER COLUMN "purpose" SET DEFAULT 'cover'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_assets_purpose_created"
        ON "media_assets" ("purpose", "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_media_assets_purpose_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "media_assets"
        DROP COLUMN IF EXISTS "original_key",
        DROP COLUMN IF EXISTS "placeholder",
        DROP COLUMN IF EXISTS "purpose"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."media_assets_purpose_enum"`,
    );
  }
}
