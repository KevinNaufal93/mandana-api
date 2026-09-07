import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces Event Support's flexible hourly pricing (threshold, rounding
 * step, minimum hours, a day_plus_hourly remainder mode — all admin-tunable
 * via event_support_settings) with a single fixed 8-hour rental block. See
 * event-pricing.ts and docs/event-support-integration.md. The product
 * decision: there is no hourly product, only "daily, or per eight hours."
 *
 * Safe to run against real data: no `event_items` row has ever had
 * `supports_hourly = true` and no `event_booking_items` row has ever
 * billed `billing_mode = 'hourly'` (the feature shipped in
 * 1787200000000-AddEventSupportHourlyPricing but nothing opted in before
 * this migration landed), so every data-touching statement below is a
 * no-op in practice — this is really a schema/vocabulary change, not a
 * repricing. `down()` restores the schema and its original seeded
 * defaults, but cannot recover a `minimum_hours` value (every row was
 * already NULL) or repopulate `extra_hours`/`extra_hours_total` from a
 * collapsed `billable_units`.
 */
export class ReplaceEventHourlyWithEightHourPricing1788600000000 implements MigrationInterface {
  name = 'ReplaceEventHourlyWithEightHourPricing1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── event_items: rename hourly_rate/supports_hourly to their 8-hour-
    //    block equivalents, drop minimum_hours outright — there is no
    //    minimum below "one block" left to configure. Postgres has no
    //    IF EXISTS on RENAME COLUMN, so guard each rename so a re-run is
    //    a no-op. ─────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'event_items'
            AND column_name = 'hourly_rate'
        ) THEN
          ALTER TABLE "event_items" RENAME COLUMN "hourly_rate" TO "eight_hour_rate";
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'event_items'
            AND column_name = 'supports_hourly'
        ) THEN
          ALTER TABLE "event_items" RENAME COLUMN "supports_hourly" TO "supports_eight_hour";
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "event_items" DROP COLUMN IF EXISTS "minimum_hours"
    `);

    // ── event_billing_mode_enum: 'hourly' -> 'eight_hour'. ALTER TYPE ...
    //    ADD VALUE isn't used in this repo (see 1787000000000-
    //    AddNewPropertyListingType's class doc) — rename/recreate/recast
    //    instead. No row is actually 'hourly' today, so the USING clause's
    //    mapping is a no-op in practice. ──────────────────────────────────
    await queryRunner.query(`
      ALTER TYPE "public"."event_billing_mode_enum" RENAME TO "event_billing_mode_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."event_billing_mode_enum" AS ENUM('eight_hour', 'daily')
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode"
        TYPE "public"."event_billing_mode_enum"
        USING (
          CASE WHEN "billing_mode"::text = 'hourly' THEN 'eight_hour' ELSE 'daily' END
        )::text::"public"."event_billing_mode_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode" SET DEFAULT 'daily'
    `);
    await queryRunner.query(`DROP TYPE "public"."event_billing_mode_enum_old"`);

    // ── event_booking_items: unit_label vocabulary, billable_units narrows
    //    to a plain integer (always 1 block or N whole days now), and the
    //    day_plus_hourly remainder columns go away ───────────────────────
    await queryRunner.query(`
      UPDATE "event_booking_items" SET "unit_label" = '8 jam' WHERE "unit_label" = 'jam'
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ALTER COLUMN "billable_units" TYPE integer USING ROUND("billable_units")::integer
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        DROP COLUMN IF EXISTS "extra_hours",
        DROP COLUMN IF EXISTS "extra_hours_total"
    `);

    // ── event_support_settings: the whole hourly-pricing policy goes away —
    //    nothing left to configure once "8 hours" is a constant ───────────
    await queryRunner.query(`
      ALTER TABLE "event_support_settings"
        DROP COLUMN IF EXISTS "hourly_threshold_hours",
        DROP COLUMN IF EXISTS "hourly_threshold_inclusive",
        DROP COLUMN IF EXISTS "default_minimum_hours",
        DROP COLUMN IF EXISTS "rounding_unit_minutes",
        DROP COLUMN IF EXISTS "cap_hourly_at_daily_rate",
        DROP COLUMN IF EXISTS "over_threshold_mode"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_over_threshold_mode_enum"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── event_support_settings: restore the hourly-pricing policy columns,
    //    reseeded to their original defaults ───────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."event_over_threshold_mode_enum" AS ENUM('whole_days', 'day_plus_hourly');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "event_support_settings"
        ADD COLUMN IF NOT EXISTS "hourly_threshold_hours" integer NOT NULL DEFAULT 24,
        ADD COLUMN IF NOT EXISTS "hourly_threshold_inclusive" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "default_minimum_hours" integer NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS "rounding_unit_minutes" integer NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS "cap_hourly_at_daily_rate" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "over_threshold_mode" "public"."event_over_threshold_mode_enum" NOT NULL DEFAULT 'whole_days'
    `);

    // ── event_booking_items: restore extra_hours/extra_hours_total (empty
    //    — these can't be reconstructed from the collapsed billable_units)
    //    and widen billable_units back to numeric ───────────────────────
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ADD COLUMN IF NOT EXISTS "extra_hours" numeric(6,2),
        ADD COLUMN IF NOT EXISTS "extra_hours_total" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ALTER COLUMN "billable_units" TYPE numeric(8,2) USING "billable_units"::numeric(8,2)
    `);
    await queryRunner.query(`
      UPDATE "event_booking_items" SET "unit_label" = 'jam' WHERE "unit_label" = '8 jam'
    `);

    // ── event_billing_mode_enum: narrow 'eight_hour' back to 'hourly' ────
    await queryRunner.query(`
      ALTER TYPE "public"."event_billing_mode_enum" RENAME TO "event_billing_mode_enum_old"
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."event_billing_mode_enum" AS ENUM('hourly', 'daily')
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode"
        TYPE "public"."event_billing_mode_enum"
        USING (
          CASE WHEN "billing_mode"::text = 'eight_hour' THEN 'hourly' ELSE 'daily' END
        )::text::"public"."event_billing_mode_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items" ALTER COLUMN "billing_mode" SET DEFAULT 'daily'
    `);
    await queryRunner.query(`DROP TYPE "public"."event_billing_mode_enum_old"`);

    // ── event_items: restore minimum_hours (empty — every row was NULL
    //    before up() ran, see class doc) and rename back ─────────────────
    await queryRunner.query(`
      ALTER TABLE "event_items" ADD COLUMN IF NOT EXISTS "minimum_hours" integer
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'event_items'
            AND column_name = 'eight_hour_rate'
        ) THEN
          ALTER TABLE "event_items" RENAME COLUMN "eight_hour_rate" TO "hourly_rate";
        END IF;
      END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'event_items'
            AND column_name = 'supports_eight_hour'
        ) THEN
          ALTER TABLE "event_items" RENAME COLUMN "supports_eight_hour" TO "supports_hourly";
        END IF;
      END $$
    `);
  }
}
