import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renames Moving Support's "lead" surface to "booking", matching Storage
 * and Event Support's naming and status vocabulary. This is a
 * drop-and-recreate, not an ALTER-based rename, for two reasons:
 *
 * 1. The status enum's VALUES change with zero overlap
 *    (new/contacted/converted/lost -> pending/confirmed/rejected/
 *    cancelled/completed), not just the type's name. `ALTER TYPE ... RENAME
 *    VALUE` is strictly 1:1 and cannot grow 4 values into 5, and
 *    `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction
 *    TypeORM wraps each migration in — a footgun against this migration's
 *    own `DEFAULT 'pending'`.
 * 2. Renaming a table renames nothing else — every constraint and index
 *    name would still need its own rename across three different ALTER
 *    syntaxes.
 *
 * Row data is NOT preserved in either direction — per product decision,
 * every existing moving_leads row is disposable test data. `up()` drops the
 * old tables/type outright; `down()` recreates the pre-rename schema empty
 * (consolidating `1787600000000-AddMovingLeads`, `1787700000000-
 * AddMovingLeadNotes`, and `1787900000000-AddMovingLeadLegs` — those three
 * migrations are untouched and must still run correctly on a fresh
 * database, since this migration runs after them).
 *
 * New vs. the old moving_leads: `confirmed_at`/`confirmed_by_id`, giving
 * Moving parity with Storage/Event's confirm-tracking columns now that it
 * gains a real confirm/reject/cancel/complete state machine.
 */
export class RenameMovingLeadsToBookings1788200000000 implements MigrationInterface {
  name = 'RenameMovingLeadsToBookings1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Drop the old lead tables/type ────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "moving_lead_legs" DROP CONSTRAINT IF EXISTS "fk_moving_lead_legs_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_lead_legs_lead_index"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_lead_legs"`);

    await queryRunner.query(
      `ALTER TABLE "moving_lead_addons" DROP CONSTRAINT IF EXISTS "fk_moving_lead_addons_lead"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_lead_addons"`);

    await queryRunner.query(
      `ALTER TABLE "moving_lead_stops" DROP CONSTRAINT IF EXISTS "fk_moving_lead_stops_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_lead_stops_lead_index"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_lead_stops"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "moving_leads"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."moving_leads_status_enum"`,
    );

    // ── moving_bookings ───────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."moving_bookings_status_enum" AS ENUM(
          'pending', 'confirmed', 'rejected', 'cancelled', 'completed'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reference" character varying(20) NOT NULL,
        "status" "public"."moving_bookings_status_enum" NOT NULL DEFAULT 'pending',
        "truck_slug" character varying(100) NOT NULL,
        "truck_name" character varying(100) NOT NULL,
        "pickup_address" character varying(500),
        "pickup_lat" numeric(9,6) NOT NULL,
        "pickup_lng" numeric(9,6) NOT NULL,
        "distance_km" numeric(7,1) NOT NULL,
        "included_km" integer NOT NULL,
        "chargeable_km" numeric(7,1) NOT NULL,
        "round_trip" boolean NOT NULL DEFAULT false,
        "toll_route" boolean NOT NULL DEFAULT true,
        "declared_value" integer,
        "base_fare" integer NOT NULL,
        "distance_fare" integer NOT NULL,
        "travel_subtotal" integer NOT NULL,
        "toll_fare" integer NOT NULL DEFAULT 0,
        "addons_total" integer NOT NULL DEFAULT 0,
        "subtotal" integer NOT NULL,
        "total" integer NOT NULL,
        "low_estimate" integer NOT NULL,
        "high_estimate" integer NOT NULL,
        "min_fare_applied" boolean NOT NULL DEFAULT false,
        "customer_name" character varying(255),
        "phone" character varying(30),
        "email" character varying(255),
        "notes" text,
        "admin_note" text,
        "confirmed_at" TIMESTAMP,
        "confirmed_by_id" uuid,
        CONSTRAINT "PK_moving_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_moving_bookings_reference" UNIQUE ("reference")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_bookings"
        ADD CONSTRAINT "fk_moving_bookings_confirmed_by"
        FOREIGN KEY ("confirmed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL
    `);

    // ── moving_booking_stops ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_booking_stops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "booking_id" uuid NOT NULL,
        "stop_index" integer NOT NULL,
        "address" character varying(500),
        "lat" numeric(9,6) NOT NULL,
        "lng" numeric(9,6) NOT NULL,
        CONSTRAINT "PK_moving_booking_stops" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_booking_stops_booking_index"
        ON "moving_booking_stops" ("booking_id", "stop_index")
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_booking_stops"
        ADD CONSTRAINT "fk_moving_booking_stops_booking"
        FOREIGN KEY ("booking_id") REFERENCES "moving_bookings" ("id") ON DELETE CASCADE
    `);

    // ── moving_booking_addons ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_booking_addons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "booking_id" uuid NOT NULL,
        "addon_slug" character varying(150) NOT NULL,
        "addon_name" character varying(150) NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" integer NOT NULL,
        "amount" integer NOT NULL,
        CONSTRAINT "PK_moving_booking_addons" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_booking_addons"
        ADD CONSTRAINT "fk_moving_booking_addons_booking"
        FOREIGN KEY ("booking_id") REFERENCES "moving_bookings" ("id") ON DELETE CASCADE
    `);

    // ── moving_booking_legs ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_booking_legs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "booking_id" uuid NOT NULL,
        "leg_index" integer NOT NULL,
        "distance_km" numeric(7,1) NOT NULL,
        "included_km" integer NOT NULL,
        "chargeable_km" numeric(7,1) NOT NULL,
        "base_fare" integer NOT NULL,
        "distance_fare" integer NOT NULL,
        "subtotal" integer NOT NULL,
        CONSTRAINT "PK_moving_booking_legs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_booking_legs_booking_index"
        ON "moving_booking_legs" ("booking_id", "leg_index")
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_booking_legs"
        ADD CONSTRAINT "fk_moving_booking_legs_booking"
        FOREIGN KEY ("booking_id") REFERENCES "moving_bookings" ("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Drop the booking tables/type ─────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "moving_booking_legs" DROP CONSTRAINT IF EXISTS "fk_moving_booking_legs_booking"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_booking_legs_booking_index"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_booking_legs"`);

    await queryRunner.query(
      `ALTER TABLE "moving_booking_addons" DROP CONSTRAINT IF EXISTS "fk_moving_booking_addons_booking"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_booking_addons"`);

    await queryRunner.query(
      `ALTER TABLE "moving_booking_stops" DROP CONSTRAINT IF EXISTS "fk_moving_booking_stops_booking"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_booking_stops_booking_index"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_booking_stops"`);

    await queryRunner.query(
      `ALTER TABLE "moving_bookings" DROP CONSTRAINT IF EXISTS "fk_moving_bookings_confirmed_by"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_bookings"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."moving_bookings_status_enum"`,
    );

    // ── Recreate the pre-rename moving_leads schema, empty ───────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."moving_leads_status_enum" AS ENUM(
          'new', 'contacted', 'converted', 'lost'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_leads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reference" character varying(20) NOT NULL,
        "status" "public"."moving_leads_status_enum" NOT NULL DEFAULT 'new',
        "truck_slug" character varying(100) NOT NULL,
        "truck_name" character varying(100) NOT NULL,
        "pickup_address" character varying(500),
        "pickup_lat" numeric(9,6) NOT NULL,
        "pickup_lng" numeric(9,6) NOT NULL,
        "distance_km" numeric(7,1) NOT NULL,
        "included_km" integer NOT NULL,
        "chargeable_km" numeric(7,1) NOT NULL,
        "round_trip" boolean NOT NULL DEFAULT false,
        "toll_route" boolean NOT NULL DEFAULT true,
        "declared_value" integer,
        "base_fare" integer NOT NULL,
        "distance_fare" integer NOT NULL,
        "travel_subtotal" integer NOT NULL,
        "toll_fare" integer NOT NULL DEFAULT 0,
        "addons_total" integer NOT NULL DEFAULT 0,
        "subtotal" integer NOT NULL,
        "total" integer NOT NULL,
        "low_estimate" integer NOT NULL,
        "high_estimate" integer NOT NULL,
        "min_fare_applied" boolean NOT NULL DEFAULT false,
        "customer_name" character varying(255),
        "phone" character varying(30),
        "email" character varying(255),
        "notes" text,
        "admin_note" text,
        CONSTRAINT "PK_moving_leads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_moving_leads_reference" UNIQUE ("reference")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_lead_stops" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lead_id" uuid NOT NULL,
        "stop_index" integer NOT NULL,
        "address" character varying(500),
        "lat" numeric(9,6) NOT NULL,
        "lng" numeric(9,6) NOT NULL,
        CONSTRAINT "PK_moving_lead_stops" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_lead_stops_lead_index"
        ON "moving_lead_stops" ("lead_id", "stop_index")
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_lead_stops"
        ADD CONSTRAINT "fk_moving_lead_stops_lead"
        FOREIGN KEY ("lead_id") REFERENCES "moving_leads" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_lead_addons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lead_id" uuid NOT NULL,
        "addon_slug" character varying(150) NOT NULL,
        "addon_name" character varying(150) NOT NULL,
        "quantity" integer NOT NULL,
        "unit_price" integer NOT NULL,
        "amount" integer NOT NULL,
        CONSTRAINT "PK_moving_lead_addons" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_lead_addons"
        ADD CONSTRAINT "fk_moving_lead_addons_lead"
        FOREIGN KEY ("lead_id") REFERENCES "moving_leads" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_lead_legs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lead_id" uuid NOT NULL,
        "leg_index" integer NOT NULL,
        "distance_km" numeric(7,1) NOT NULL,
        "included_km" integer NOT NULL,
        "chargeable_km" numeric(7,1) NOT NULL,
        "base_fare" integer NOT NULL,
        "distance_fare" integer NOT NULL,
        "subtotal" integer NOT NULL,
        CONSTRAINT "PK_moving_lead_legs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_lead_legs_lead_index"
        ON "moving_lead_legs" ("lead_id", "leg_index")
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_lead_legs"
        ADD CONSTRAINT "fk_moving_lead_legs_lead"
        FOREIGN KEY ("lead_id") REFERENCES "moving_leads" ("id") ON DELETE CASCADE
    `);
  }
}
