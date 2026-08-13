import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageModule1786600000000 implements MigrationInterface {
  name = 'AddStorageModule1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── storage_unit_types ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_unit_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "description" text,
        "volume_m3" numeric(6,2),
        "length_cm" integer,
        "width_cm" integer,
        "height_cm" integer,
        "monthly_rate" integer NOT NULL,
        "min_duration_months" integer NOT NULL DEFAULT 1,
        "media_asset_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_storage_unit_types_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_storage_unit_types" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_unit_types_is_active"
        ON "storage_unit_types" ("is_active")
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_unit_types"
        ADD CONSTRAINT "fk_storage_unit_types_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // ── storage_facilities ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_facilities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(255) NOT NULL,
        "slug" character varying(255) NOT NULL,
        "description" text,
        "address" character varying(500),
        "area" character varying(150),
        "city" character varying(100),
        "province" character varying(100),
        "latitude" numeric(9,6),
        "longitude" numeric(9,6),
        "media_asset_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_storage_facilities_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_storage_facilities" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_facilities_is_active"
        ON "storage_facilities" ("is_active")
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities"
        ADD CONSTRAINT "fk_storage_facilities_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // ── storage_inventory ─────────────────────────────────────────────────
    // occupied_units is bounded by the CHECK below, but that's a last-resort
    // backstop — the actual overselling guard is the atomic conditional
    // UPDATE in StorageBookingsService.confirm(), not this constraint.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_inventory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "facility_id" uuid NOT NULL,
        "unit_type_id" uuid NOT NULL,
        "total_units" integer NOT NULL,
        "occupied_units" integer NOT NULL DEFAULT 0,
        "monthly_rate_override" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_storage_inventory" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_storage_inventory_facility_unit_type" UNIQUE ("facility_id", "unit_type_id"),
        CONSTRAINT "chk_storage_inventory_occupied_range"
          CHECK ("occupied_units" >= 0 AND "occupied_units" <= "total_units")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD CONSTRAINT "fk_storage_inventory_facility"
        FOREIGN KEY ("facility_id") REFERENCES "storage_facilities" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD CONSTRAINT "fk_storage_inventory_unit_type"
        FOREIGN KEY ("unit_type_id") REFERENCES "storage_unit_types" ("id") ON DELETE CASCADE
    `);

    // ── storage_bookings ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."storage_bookings_status_enum" AS ENUM(
        'pending', 'confirmed', 'rejected', 'cancelled', 'completed'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_bookings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "reference" character varying(20) NOT NULL,
        "customer_name" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "phone" character varying(30),
        "notes" text,
        "facility_id" uuid NOT NULL,
        "unit_type_id" uuid NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "start_date" date NOT NULL,
        "duration_months" integer NOT NULL,
        "end_date" date NOT NULL,
        "status" "public"."storage_bookings_status_enum" NOT NULL DEFAULT 'pending',
        "monthly_rate" integer NOT NULL,
        "subtotal" integer NOT NULL,
        "discount_amount" integer NOT NULL DEFAULT 0,
        "total" integer NOT NULL,
        "admin_note" text,
        "confirmed_at" TIMESTAMP,
        "confirmed_by_id" uuid,
        CONSTRAINT "UQ_storage_bookings_reference" UNIQUE ("reference"),
        CONSTRAINT "PK_storage_bookings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_bookings_status"
        ON "storage_bookings" ("status")
    `);
    // RESTRICT (not CASCADE, unlike storage_inventory above) — a booking is
    // a historical/financial record that must not silently vanish or get
    // orphaned if a facility or unit type is later deleted.
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD CONSTRAINT "fk_storage_bookings_facility"
        FOREIGN KEY ("facility_id") REFERENCES "storage_facilities" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD CONSTRAINT "fk_storage_bookings_unit_type"
        FOREIGN KEY ("unit_type_id") REFERENCES "storage_unit_types" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD CONSTRAINT "fk_storage_bookings_confirmed_by"
        FOREIGN KEY ("confirmed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL
    `);

    // ── Seed data ────────────────────────────────────────────────────────
    // Every rate/capacity below is a placeholder pending sign-off from ops —
    // same caveat as the Moving truck-class seed
    // (1786500000000-AddMovingTruckClasses.ts).
    await queryRunner.query(`
      INSERT INTO "storage_unit_types" (
        "id", "name", "slug", "description",
        "volume_m3", "length_cm", "width_cm", "height_cm",
        "monthly_rate", "min_duration_months", "is_active", "sort_order", "createdAt", "updatedAt"
      )
      VALUES
        (uuid_generate_v4(), 'Small', 'small',
          'Cocok untuk barang pribadi, dus, atau isi kamar kos',
          2, 150, 120, 110,
          -- TODO: placeholder rate, confirm with ops
          350000, 1, true, 10, NOW(), NOW()),
        (uuid_generate_v4(), 'Medium', 'medium',
          'Cocok untuk isi 1 kamar penuh termasuk furnitur kecil',
          5, 200, 150, 170,
          -- TODO: placeholder rate, confirm with ops
          650000, 1, true, 20, NOW(), NOW()),
        (uuid_generate_v4(), 'Large', 'large',
          'Cocok untuk isi rumah tipe 21-36',
          9, 250, 200, 180,
          -- TODO: placeholder rate, confirm with ops
          1100000, 1, true, 30, NOW(), NOW()),
        (uuid_generate_v4(), 'Extra Large', 'extra-large',
          'Cocok untuk isi rumah besar atau inventaris kantor/toko',
          16, 300, 250, 220,
          -- TODO: placeholder rate, confirm with ops
          1800000, 3, true, 40, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "storage_facilities" (
        "id", "name", "slug", "description",
        "address", "area", "city", "province", "latitude", "longitude",
        "is_active", "sort_order", "createdAt", "updatedAt"
      )
      VALUES
        (uuid_generate_v4(), 'Mandana Storage BSD City', 'bsd-city',
          'Fasilitas penyimpanan dengan CCTV 24 jam dan akses mudah dari tol BSD',
          'Jl. Letnan Sutopo No. 1, BSD City', 'BSD City', 'Tangerang Selatan', 'Banten',
          -6.301900, 106.652800,
          true, 10, NOW(), NOW()),
        (uuid_generate_v4(), 'Mandana Storage Kelapa Gading', 'kelapa-gading',
          'Fasilitas penyimpanan dekat kawasan bisnis Kelapa Gading',
          'Jl. Boulevard Raya, Kelapa Gading', 'Kelapa Gading', 'Jakarta Utara', 'DKI Jakarta',
          -6.161400, 106.905800,
          true, 20, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    // Cross-joins every seeded facility with every seeded unit type so no
    // combination is left without a pool — TODO: placeholder capacity,
    // confirm with ops before relying on it beyond development.
    await queryRunner.query(`
      INSERT INTO "storage_inventory" (
        "id", "facility_id", "unit_type_id", "total_units", "occupied_units", "is_active", "createdAt", "updatedAt"
      )
      SELECT
        uuid_generate_v4(), f.id, u.id,
        CASE u.slug WHEN 'small' THEN 20 WHEN 'medium' THEN 12 WHEN 'large' THEN 8 ELSE 4 END,
        0, true, NOW(), NOW()
      FROM "storage_facilities" f
      CROSS JOIN "storage_unit_types" u
      ON CONFLICT ("facility_id", "unit_type_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "storage_bookings" DROP CONSTRAINT IF EXISTS "fk_storage_bookings_confirmed_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storage_bookings" DROP CONSTRAINT IF EXISTS "fk_storage_bookings_unit_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storage_bookings" DROP CONSTRAINT IF EXISTS "fk_storage_bookings_facility"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_bookings_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_bookings"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."storage_bookings_status_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "storage_inventory" DROP CONSTRAINT IF EXISTS "fk_storage_inventory_unit_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storage_inventory" DROP CONSTRAINT IF EXISTS "fk_storage_inventory_facility"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_inventory"`);

    await queryRunner.query(
      `ALTER TABLE "storage_facilities" DROP CONSTRAINT IF EXISTS "fk_storage_facilities_media_asset"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_facilities_is_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_facilities"`);

    await queryRunner.query(
      `ALTER TABLE "storage_unit_types" DROP CONSTRAINT IF EXISTS "fk_storage_unit_types_media_asset"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_unit_types_is_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_unit_types"`);
  }
}
