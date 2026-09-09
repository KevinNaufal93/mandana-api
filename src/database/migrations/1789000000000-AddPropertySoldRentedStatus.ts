import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `'sold'` (Terjual) and `'rented'` (Tersewa) to `PropertyStatus`
 * alongside the existing `'draft'`/`'published'`/`'archived'`. Unlike those
 * two, a sold/rented property is deliberately still publicly visible — see
 * PUBLIC_PROPERTY_STATUSES in property-status.enum.ts, which every public
 * query (list/search, detail, similar, homepage recommendations) now
 * filters against instead of `PUBLISHED` alone.
 *
 * Postgres can't remove an enum value with `ALTER TYPE ... ADD VALUE`, and
 * that statement also can't run inside the same transaction as later uses of
 * the new value in this migration — so the enum is widened by renaming the
 * old type, creating a fresh one with all five values, and recasting the
 * column, exactly like 1787000000000-AddNewPropertyListingType. The column
 * is named `status` (no snake_case rename) with default `'draft'`.
 */
export class AddPropertySoldRentedStatus1789000000000 implements MigrationInterface {
  name = 'AddPropertySoldRentedStatus1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."properties_status_enum" RENAME TO "properties_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."properties_status_enum" AS ENUM('draft', 'published', 'archived', 'sold', 'rented')
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status"
        TYPE "public"."properties_status_enum"
        USING "status"::text::"public"."properties_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'draft'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."properties_status_enum_old"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Any 'sold'/'rented' rows must be reset first or the cast below fails.
    // 'published' is the closest honest fallback — these were live public
    // listings, same as a plain published property.
    await queryRunner.query(`
      UPDATE "properties" SET "status" = 'published' WHERE "status" IN ('sold', 'rented')
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."properties_status_enum" RENAME TO "properties_status_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."properties_status_enum" AS ENUM('draft', 'published', 'archived')
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status"
        TYPE "public"."properties_status_enum"
        USING "status"::text::"public"."properties_status_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'draft'
    `);
    await queryRunner.query(`
      DROP TYPE "public"."properties_status_enum_old"
    `);
  }
}
