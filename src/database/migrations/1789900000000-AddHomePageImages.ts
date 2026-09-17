import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the two homepage image slots (`home_property_valuation`,
 * `home_help_cta`) to the existing `page_images` table — insert-only, no
 * schema change, same shape as `AddPageImages1789800000000`. `slot_key` is
 * `varchar`, not a Postgres enum, precisely so this kind of addition never
 * needs an `ALTER TYPE`.
 *
 * Both seeded rows have `media_asset_id NULL` — the web app falls back to
 * its own hardcoded static image for each slot until an admin uploads a
 * replacement, so deploying this migration changes nothing visible on the
 * live site.
 */
export class AddHomePageImages1789900000000 implements MigrationInterface {
  name = 'AddHomePageImages1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "page_images" ("slot_key")
      VALUES ('home_property_valuation'), ('home_help_cta')
      ON CONFLICT ON CONSTRAINT "UQ_page_images_slot_key" DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "page_images"
      WHERE "slot_key" IN ('home_property_valuation', 'home_help_cta')
    `);
  }
}
