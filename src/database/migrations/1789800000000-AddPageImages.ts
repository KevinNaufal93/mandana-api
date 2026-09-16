import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs the admin Content Media section's "Tentang Kami" tab: a
 * `page_images` table with one row per fixed image slot on the About page
 * (`about_hero`, `about_story`, `about_help_cta`), same `slot_key`
 * varchar + UNIQUE shape as `page_seo.page_key` / `legal_pages.page_key`.
 *
 * Every seeded row has `media_asset_id NULL` — the web app falls back to
 * its own hardcoded static image whenever a slot has no media asset, so
 * deploying this migration changes nothing visible on the live site until
 * an admin uploads a replacement for a slot.
 */
export class AddPageImages1789800000000 implements MigrationInterface {
  name = 'AddPageImages1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "page_images" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "slot_key" character varying(64) NOT NULL,
        "media_asset_id" uuid,
        CONSTRAINT "UQ_page_images_slot_key" UNIQUE ("slot_key"),
        CONSTRAINT "fk_page_images_media_asset"
          FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "page_images" ("slot_key")
      VALUES ('about_hero'), ('about_story'), ('about_help_cta')
      ON CONFLICT ON CONSTRAINT "UQ_page_images_slot_key" DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "page_images"`);
  }
}
