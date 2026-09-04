import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `property_promo` as a third `content_blocks` type (the promo card
 * rendered in the property detail sidebar, directly below the agent card),
 * plus a nullable `listing_type_scope` column so a card can optionally
 * target Dijual / Disewa / Properti Baru individually.
 *
 * ## Widening `content_block_type_enum`
 *
 * Postgres allows `ALTER TYPE ... ADD VALUE` inside a transaction (which
 * migrations always run in), but the newly added value can't be *used* —
 * e.g. in a CHECK constraint's expression — within that same transaction.
 * This migration needs to reference `'property_promo'` in
 * `chk_content_blocks_scope_promo_only` below, so `ADD VALUE` isn't an
 * option here. Instead this follows the same rename/recreate/recast/drop
 * dance `AddNewPropertyListingType1787000000000` already established for
 * exactly this reason: rename the old type out of the way, create a fresh
 * type with all three values (freely usable immediately, since it's new
 * within this transaction), recast the column onto it, drop the old type.
 *
 * Unlike that precedent, `content_blocks."type"` has no column DEFAULT, so
 * this needs none of the `DROP DEFAULT`/`SET DEFAULT` steps that migration
 * required.
 *
 * `chk_content_blocks_hero_requires_media` embeds `'hero'` as an enum
 * literal typed against the *old* enum OID. It is dropped before the
 * recast and re-added after, rather than relying on Postgres to silently
 * re-resolve it against the new type — this migration doesn't assume
 * that behavior without it having been exercised in this repo before.
 *
 * ## `listing_type_scope`
 *
 * Reuses `properties_listing_type_enum` (owned by `properties.listing_type`,
 * widened to `sale|rent|new` in `AddNewPropertyListingType1787000000000`)
 * rather than inventing a parallel enum — one definition of "sale/rent/new"
 * for the whole schema. `chk_content_blocks_scope_promo_only` keeps the
 * column meaningless for `hero`/`service_card`, the same pattern
 * `chk_content_blocks_hero_requires_media` already uses to encode a
 * per-type rule at the DB level.
 *
 * Additive and backfill-free: every existing row has `type <> 'property_promo'`
 * and `listing_type_scope IS NULL`, so the new CHECK is satisfied trivially.
 *
 * `down()` is destructive by necessity: unlike `'new'` (which could fall
 * back to `'sale'`), a `property_promo` row has no honest fallback type —
 * remapping it to `service_card` would resurrect it on the homepage
 * services strip. Rolling back this migration deletes any `property_promo`
 * rows.
 */
export class AddPropertyPromoContentBlocks1788000000000 implements MigrationInterface {
  name = 'AddPropertyPromoContentBlocks1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        DROP CONSTRAINT "chk_content_blocks_hero_requires_media"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."content_block_type_enum" RENAME TO "content_block_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."content_block_type_enum"
        AS ENUM('hero', 'service_card', 'property_promo')
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ALTER COLUMN "type" TYPE "public"."content_block_type_enum"
        USING "type"::text::"public"."content_block_type_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."content_block_type_enum_old"
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "chk_content_blocks_hero_requires_media"
        CHECK ("type" <> 'hero' OR "media_asset_id" IS NOT NULL)
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD COLUMN "listing_type_scope" "public"."properties_listing_type_enum"[]
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "chk_content_blocks_scope_promo_only"
        CHECK ("listing_type_scope" IS NULL OR "type" = 'property_promo')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        DROP CONSTRAINT "chk_content_blocks_scope_promo_only"
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks" DROP COLUMN "listing_type_scope"
    `);

    // No honest fallback type for a property_promo row — see docblock.
    await queryRunner.query(`
      DELETE FROM "content_blocks" WHERE "type" = 'property_promo'
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        DROP CONSTRAINT "chk_content_blocks_hero_requires_media"
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."content_block_type_enum" RENAME TO "content_block_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."content_block_type_enum" AS ENUM('hero', 'service_card')
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ALTER COLUMN "type" TYPE "public"."content_block_type_enum"
        USING "type"::text::"public"."content_block_type_enum"
    `);
    await queryRunner.query(`
      DROP TYPE "public"."content_block_type_enum_old"
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "chk_content_blocks_hero_requires_media"
        CHECK ("type" <> 'hero' OR "media_asset_id" IS NOT NULL)
    `);
  }
}
