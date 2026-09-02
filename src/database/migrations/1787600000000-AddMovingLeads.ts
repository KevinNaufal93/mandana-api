import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moving Support lead capture: `moving_leads` (the captured order-attempt
 * record, persisted the moment a customer clicks "Pesan via WhatsApp"),
 * `moving_lead_stops` (an ordered, unlimited destination list per lead —
 * see docs/moving-integration.md for why this doesn't require any change to
 * `POST /moving/quote`'s pricing math), and `moving_lead_addons` (a
 * snapshotted line per selected add-on). No seed data — an empty
 * transactional table.
 */
export class AddMovingLeads1787600000000 implements MigrationInterface {
  name = 'AddMovingLeads1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── moving_leads ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."moving_leads_status_enum" AS ENUM(
        'new', 'contacted', 'converted', 'lost'
      )
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
        "admin_note" text,
        CONSTRAINT "PK_moving_leads" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_moving_leads_reference" UNIQUE ("reference")
      )
    `);

    // ── moving_lead_stops ───────────────────────────────────────────────
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

    // ── moving_lead_addons ──────────────────────────────────────────────
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
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
  }
}
