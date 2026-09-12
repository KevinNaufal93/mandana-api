import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional, hero-only second image column to `content_blocks`:
 * `mobile_media_asset_id`, mirroring the existing `media_asset_id` FK
 * (nullable, `ON DELETE SET NULL`). `chk_content_blocks_mobile_media_hero_only`
 * restricts it to `type = 'hero'`, the same "type-agnostic column,
 * type-specific CHECK" shape `chk_content_blocks_scope_promo_only` already
 * established for `listing_type_scope`.
 *
 * Unlike `1788000000000-AddPropertyPromoContentBlocks`'s rename/recreate/
 * recast dance, no enum widening is needed here — no new `ContentBlockType`
 * value is introduced, so the CHECK's `'hero'` literal is already valid
 * against the current `content_block_type_enum` with no
 * transaction-visibility problem.
 *
 * Additive and backfill-free: every existing row already satisfies the new
 * CHECK trivially (`mobile_media_asset_id IS NULL`).
 */
export class AddContentBlockMobileImage1789200000000 implements MigrationInterface {
  name = 'AddContentBlockMobileImage1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks" ADD COLUMN "mobile_media_asset_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "fk_content_blocks_mobile_media_asset"
        FOREIGN KEY ("mobile_media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // Scoped to hero for now, the only type that has this problem today.
    // If service_card ever needs the same treatment, this constraint is
    // the one line that changes.
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "chk_content_blocks_mobile_media_hero_only"
        CHECK ("mobile_media_asset_id" IS NULL OR "type" = 'hero')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        DROP CONSTRAINT "chk_content_blocks_mobile_media_hero_only"
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        DROP CONSTRAINT "fk_content_blocks_mobile_media_asset"
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks" DROP COLUMN "mobile_media_asset_id"
    `);
  }
}
