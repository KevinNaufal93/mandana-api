import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Event Support: rental categories (Sound System, Stage Effect, ...), their
 * packages/add-ons, and admin-recorded bookings. See
 * docs/event-support-integration.md.
 */
export class AddEventSupport1786900000000 implements MigrationInterface {
  name = 'AddEventSupport1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── event_categories ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(120) NOT NULL,
        "slug" character varying(120) NOT NULL,
        "description" text,
        "media_asset_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_event_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_categories_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "event_categories"
        ADD CONSTRAINT "fk_event_categories_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // ── event_items ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."event_items_kind_enum" AS ENUM('package', 'addon')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."event_items_status_enum" AS ENUM('draft', 'published', 'archived')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "category_id" uuid NOT NULL,
        "name" character varying(180) NOT NULL,
        "slug" character varying(180) NOT NULL,
        "kind" "public"."event_items_kind_enum" NOT NULL DEFAULT 'package',
        "description" text,
        "price_per_day" integer NOT NULL,
        "stock_quantity" integer NOT NULL DEFAULT 0,
        "status" "public"."event_items_status_enum" NOT NULL DEFAULT 'draft',
        "media_asset_id" uuid,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_event_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_items_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_items_category_status"
        ON "event_items" ("category_id", "status", "sort_order")
    `);
    await queryRunner.query(`
      ALTER TABLE "event_items"
        ADD CONSTRAINT "fk_event_items_category"
        FOREIGN KEY ("category_id") REFERENCES "event_categories" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "event_items"
        ADD CONSTRAINT "fk_event_items_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // ── event_bookings ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."event_bookings_status_enum" AS ENUM(
        'pending', 'confirmed', 'cancelled', 'completed'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reference" character varying(20) NOT NULL,
        "customer_name" character varying(255) NOT NULL,
        "phone" character varying(30),
        "email" character varying(255),
        "event_location" character varying(500),
        "notes" text,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" "public"."event_bookings_status_enum" NOT NULL DEFAULT 'pending',
        "subtotal" integer NOT NULL,
        "discount_amount" integer NOT NULL DEFAULT 0,
        "total" integer NOT NULL,
        "admin_note" text,
        "created_by_id" uuid,
        "confirmed_at" TIMESTAMP,
        "confirmed_by_id" uuid,
        CONSTRAINT "PK_event_bookings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_event_bookings_reference" UNIQUE ("reference")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "event_bookings"
        ADD CONSTRAINT "fk_event_bookings_created_by"
        FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "event_bookings"
        ADD CONSTRAINT "fk_event_bookings_confirmed_by"
        FOREIGN KEY ("confirmed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL
    `);

    // ── event_booking_items ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "event_booking_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "booking_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "item_name" character varying(180) NOT NULL,
        "quantity" integer NOT NULL,
        "start_date" date NOT NULL,
        "days" integer NOT NULL,
        "end_date" date NOT NULL,
        "price_per_day" integer NOT NULL,
        "line_total" integer NOT NULL,
        CONSTRAINT "PK_event_booking_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_booking_items_item_dates"
        ON "event_booking_items" ("item_id", "start_date", "end_date")
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ADD CONSTRAINT "fk_event_booking_items_booking"
        FOREIGN KEY ("booking_id") REFERENCES "event_bookings" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "event_booking_items"
        ADD CONSTRAINT "fk_event_booking_items_item"
        FOREIGN KEY ("item_id") REFERENCES "event_items" ("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_booking_items" DROP CONSTRAINT IF EXISTS "fk_event_booking_items_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_booking_items" DROP CONSTRAINT IF EXISTS "fk_event_booking_items_booking"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_event_booking_items_item_dates"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_booking_items"`);

    await queryRunner.query(
      `ALTER TABLE "event_bookings" DROP CONSTRAINT IF EXISTS "fk_event_bookings_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_bookings" DROP CONSTRAINT IF EXISTS "fk_event_bookings_created_by"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_bookings"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_bookings_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "event_items" DROP CONSTRAINT IF EXISTS "fk_event_items_media_asset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_items" DROP CONSTRAINT IF EXISTS "fk_event_items_category"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_event_items_category_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_items"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_items_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_items_kind_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "event_categories" DROP CONSTRAINT IF EXISTS "fk_event_categories_media_asset"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "event_categories"`);
  }
}
