import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `media_assets_purpose_enum` with `'hero_mobile'` — the DB-side
 * half of `MediaPurpose.HERO_MOBILE` (see media-purpose.enum.ts). TypeORM
 * derives the Postgres enum from the TS enum at entity-load time but never
 * migrates it; adding the TS member alone (as `1789200000000` did in the
 * same rollout) left uploads with `purpose: 'hero_mobile'` failing with a
 * bare `invalid input value for enum media_assets_purpose_enum` 500 — this
 * migration was missing from that rollout and is added now to fix it.
 *
 * Same rename/recreate/recast dance `1787000000000-AddNewPropertyListingType`
 * used for `properties_listing_type_enum`: `ALTER TYPE ... ADD VALUE` can't
 * run inside the same transaction as a later cast/use of the new value, and
 * Postgres has no `DROP VALUE`, so this is what keeps `down()` reversible.
 * `purpose` carries a `DEFAULT 'cover'` that must be dropped before the
 * column can be recast and re-set after, same as that migration's column.
 */
export class AddMediaAssetHeroMobilePurpose1789300000000 implements MigrationInterface {
  name = 'AddMediaAssetHeroMobilePurpose1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."media_assets_purpose_enum" RENAME TO "media_assets_purpose_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."media_assets_purpose_enum" AS ENUM('hero', 'cover', 'icon', 'hero_mobile')
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose"
        TYPE "public"."media_assets_purpose_enum"
        USING "purpose"::text::"public"."media_assets_purpose_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose" SET DEFAULT 'cover'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."media_assets_purpose_enum_old"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No honest fallback purpose for an existing hero_mobile asset, but
    // unlike AddPropertyPromoContentBlocks's down() (which deletes rows,
    // because a property_promo content_block has nothing else to become),
    // deleting a media asset here would orphan any content_blocks row
    // still pointing at it via mobile_media_asset_id. Reassigning to
    // 'hero' is the closer-fitting fallback of the two purposes that
    // remain (same width-ladder family, just a shorter ladder) and leaves
    // every FK intact.
    await queryRunner.query(`
      UPDATE "media_assets" SET "purpose" = 'hero' WHERE "purpose" = 'hero_mobile'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."media_assets_purpose_enum" RENAME TO "media_assets_purpose_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."media_assets_purpose_enum" AS ENUM('hero', 'cover', 'icon')
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose"
        TYPE "public"."media_assets_purpose_enum"
        USING "purpose"::text::"public"."media_assets_purpose_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "media_assets" ALTER COLUMN "purpose" SET DEFAULT 'cover'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."media_assets_purpose_enum_old"
    `);
  }
}
