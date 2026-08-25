import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `'new'` (properti baru — brand-new units sold directly by a
 * developer) as a third `ListingType` value alongside `'sale'`/`'rent'`, plus
 * two nullable columns (`handover_date`, `construction_status`) that are only
 * meaningful on `new` listings.
 *
 * Postgres can't remove an enum value with `ALTER TYPE ... ADD VALUE`, and
 * that statement also can't run inside the same transaction as later uses of
 * the new value in this migration — so the enum is widened by renaming the
 * old type, creating a fresh one with all three values, and recasting the
 * column, which keeps this migration reversible.
 */
export class AddNewPropertyListingType1787000000000 implements MigrationInterface {
  name = 'AddNewPropertyListingType1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── widen properties_listing_type_enum: 'sale' | 'rent' -> + 'new' ──────
    await queryRunner.query(`
      ALTER TYPE "public"."properties_listing_type_enum" RENAME TO "properties_listing_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."properties_listing_type_enum" AS ENUM('sale', 'rent', 'new')
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type"
        TYPE "public"."properties_listing_type_enum"
        USING "listing_type"::text::"public"."properties_listing_type_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type" SET DEFAULT 'sale'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."properties_listing_type_enum_old"
    `);

    // ── developer-build fields, only meaningful when listing_type = 'new' ──
    await queryRunner.query(`
      CREATE TYPE "public"."properties_construction_status_enum" AS ENUM('ready', 'under_construction')
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "handover_date" date
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "construction_status" "public"."properties_construction_status_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN IF EXISTS "construction_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN IF EXISTS "handover_date"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."properties_construction_status_enum"
    `);

    // ── narrow properties_listing_type_enum back to 'sale' | 'rent' ─────────
    // Any 'new' rows must be reset first or the cast below fails.
    await queryRunner.query(`
      UPDATE "properties" SET "listing_type" = 'sale' WHERE "listing_type" = 'new'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."properties_listing_type_enum" RENAME TO "properties_listing_type_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."properties_listing_type_enum" AS ENUM('sale', 'rent')
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type"
        TYPE "public"."properties_listing_type_enum"
        USING "listing_type"::text::"public"."properties_listing_type_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "listing_type" SET DEFAULT 'sale'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."properties_listing_type_enum_old"
    `);
  }
}
