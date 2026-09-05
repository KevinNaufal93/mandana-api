import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart Storage weekly pricing, alongside the existing monthly-only rate.
 * See docs/storage-integration.md and docs/storage-admin-integration.md.
 *
 * Behaviour-neutral: every existing StorageUnitType gets `supports_weekly =
 * false`, so no unit type's price changes on deploy — ops opts unit types
 * into weekly pricing individually afterward, same rollout shape as
 * 1787200000000-AddEventSupportHourlyPricing. Existing booking rows are
 * backfilled from their month columns (`duration_units = duration_months`,
 * `unit_rate = monthly_rate`) so history stays queryable by the new generic
 * columns without rewriting the legacy ones.
 */
export class AddStorageWeeklyPricing1788100000000 implements MigrationInterface {
  name = 'AddStorageWeeklyPricing1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── enum ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."storage_duration_unit_enum" AS ENUM('week', 'month');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── storage_unit_types: weekly rate + opt-in + minimum ──────────────
    await queryRunner.query(`
      ALTER TABLE "storage_unit_types"
        ADD COLUMN IF NOT EXISTS "weekly_rate" integer,
        ADD COLUMN IF NOT EXISTS "supports_weekly" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "min_duration_weeks" integer
    `);

    // ── storage_inventory: weekly rate override, sibling of the existing
    //    monthly_rate_override ───────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD COLUMN IF NOT EXISTS "weekly_rate_override" integer
    `);

    // ── storage_bookings: generic duration/rate columns ─────────────────
    // Added NOT NULL with a placeholder default so the ALTER itself never
    // fails on existing rows; the UPDATE below immediately overwrites that
    // placeholder with each row's real historical value.
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD COLUMN IF NOT EXISTS "duration_unit" "public"."storage_duration_unit_enum" NOT NULL DEFAULT 'month',
        ADD COLUMN IF NOT EXISTS "duration_units" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "unit_rate" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "storage_bookings"
        SET "duration_units" = "duration_months",
            "unit_rate" = "monthly_rate"
        WHERE "duration_unit" = 'month'
    `);

    // duration_months becomes null-able — a weekly booking has no honest
    // month count to put there. monthly_rate stays NOT NULL: it keeps
    // meaning "the reference monthly rate at booking time" even on a
    // weekly booking, distinct from unit_rate ("what was actually billed").
    await queryRunner.query(`
      ALTER TABLE "storage_bookings" ALTER COLUMN "duration_months" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only safe if no weekly booking has been created since up() ran — a
    // weekly booking has duration_months = NULL by design, which this
    // constraint then rejects on exactly that row. Reverting after weekly
    // bookings exist requires deciding what to backfill them to first;
    // that decision is out of scope for an automatic down().
    await queryRunner.query(`
      ALTER TABLE "storage_bookings" ALTER COLUMN "duration_months" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        DROP COLUMN IF EXISTS "unit_rate",
        DROP COLUMN IF EXISTS "duration_units",
        DROP COLUMN IF EXISTS "duration_unit"
    `);

    await queryRunner.query(`
      ALTER TABLE "storage_inventory" DROP COLUMN IF EXISTS "weekly_rate_override"
    `);

    await queryRunner.query(`
      ALTER TABLE "storage_unit_types"
        DROP COLUMN IF EXISTS "min_duration_weeks",
        DROP COLUMN IF EXISTS "supports_weekly",
        DROP COLUMN IF EXISTS "weekly_rate"
    `);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."storage_duration_unit_enum"`,
    );
  }
}
