import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Event Support hourly pricing & rental window. See
 * event-support-hourly-pricing-requirements.md and docs/event-support-integration.md.
 *
 * Behaviour-neutral: every existing EventItem gets `supports_hourly =
 * false`, so no item's price changes on deploy — ops opts items into
 * hourly pricing individually afterward. The seeded
 * `event_support_settings` row (`whole_days`, 24h threshold) reproduces the
 * pre-hourly `ceil(hours/24)` pricing exactly. Existing booking rows are
 * backfilled from their date columns so history stays queryable by window.
 */
export class AddEventSupportHourlyPricing1787200000000 implements MigrationInterface {
  name = 'AddEventSupportHourlyPricing1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── enums ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."event_billing_mode_enum" AS ENUM('hourly', 'daily');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."event_over_threshold_mode_enum" AS ENUM('whole_days', 'day_plus_hourly');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── event_items: hourly fields ──────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "event_items"
        ADD COLUMN IF NOT EXISTS "hourly_rate" integer,
        ADD COLUMN IF NOT EXISTS "supports_hourly" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "minimum_hours" integer
    `);

    // ── event_bookings: window timestamps ───────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "event_bookings"
        ADD COLUMN IF NOT EXISTS "dropoff_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "pickup_at" TIMESTAMP
    `);

    // ── event_booking_items: window + billing-mode fields ───────────────
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ADD COLUMN IF NOT EXISTS "dropoff_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "pickup_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "billing_mode" "public"."event_billing_mode_enum" NOT NULL DEFAULT 'daily',
        ADD COLUMN IF NOT EXISTS "unit_price" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "unit_label" character varying(10) NOT NULL DEFAULT 'hari',
        ADD COLUMN IF NOT EXISTS "billable_units" numeric(8,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "extra_hours" numeric(6,2),
        ADD COLUMN IF NOT EXISTS "extra_hours_total" integer
    `);

    // Backfill existing rows so history stays queryable by window —
    // dropoff/pickup derived from the date columns (midnight to the day
    // after end_date, matching the old inclusive-one-day semantics),
    // billing_mode/unit_price/unit_label/billable_units mirrored from the
    // pre-hourly daily fields.
    await queryRunner.query(`
      UPDATE "event_booking_items"
        SET "dropoff_at" = "start_date"::timestamp,
            "pickup_at" = ("end_date" + 1)::timestamp,
            "billing_mode" = 'daily',
            "unit_price" = "price_per_day",
            "unit_label" = 'hari',
            "billable_units" = "days"
        WHERE "dropoff_at" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "event_bookings"
        SET "dropoff_at" = "start_date"::timestamp,
            "pickup_at" = ("end_date" + 1)::timestamp
        WHERE "dropoff_at" IS NULL
    `);

    // ── event_support_settings (singleton) ──────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_support_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "singleton" boolean NOT NULL DEFAULT true,
        "hourly_threshold_hours" integer NOT NULL DEFAULT 24,
        "hourly_threshold_inclusive" boolean NOT NULL DEFAULT true,
        "default_minimum_hours" integer NOT NULL DEFAULT 2,
        "rounding_unit_minutes" integer NOT NULL DEFAULT 30,
        "cap_hourly_at_daily_rate" boolean NOT NULL DEFAULT true,
        "over_threshold_mode" "public"."event_over_threshold_mode_enum" NOT NULL DEFAULT 'whole_days',
        "price_includes_jabodetabek_delivery" boolean NOT NULL DEFAULT true,
        "outside_jabodetabek_note" text,
        CONSTRAINT "PK_event_support_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_support_settings_singleton" UNIQUE ("singleton"),
        CONSTRAINT "CHK_event_support_settings_singleton" CHECK ("singleton" = true)
      )
    `);

    // Seeded with today's exact behaviour — this migration changes no
    // quote output on its own (see class doc comment above).
    await queryRunner.query(`
      INSERT INTO "event_support_settings" (
        "id", "singleton", "hourly_threshold_hours", "hourly_threshold_inclusive",
        "default_minimum_hours", "rounding_unit_minutes", "cap_hourly_at_daily_rate",
        "over_threshold_mode", "price_includes_jabodetabek_delivery", "createdAt", "updatedAt"
      )
      VALUES (uuid_generate_v4(), true, 24, true, 2, 30, true, 'whole_days', true, NOW(), NOW())
      ON CONFLICT ("singleton") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "event_support_settings"`);

    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        DROP COLUMN IF EXISTS "extra_hours_total",
        DROP COLUMN IF EXISTS "extra_hours",
        DROP COLUMN IF EXISTS "billable_units",
        DROP COLUMN IF EXISTS "unit_label",
        DROP COLUMN IF EXISTS "unit_price",
        DROP COLUMN IF EXISTS "billing_mode",
        DROP COLUMN IF EXISTS "pickup_at",
        DROP COLUMN IF EXISTS "dropoff_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "event_bookings"
        DROP COLUMN IF EXISTS "pickup_at",
        DROP COLUMN IF EXISTS "dropoff_at"
    `);

    await queryRunner.query(`
      ALTER TABLE "event_items"
        DROP COLUMN IF EXISTS "minimum_hours",
        DROP COLUMN IF EXISTS "supports_hourly",
        DROP COLUMN IF EXISTS "hourly_rate"
    `);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_over_threshold_mode_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_billing_mode_enum"`,
    );
  }
}
