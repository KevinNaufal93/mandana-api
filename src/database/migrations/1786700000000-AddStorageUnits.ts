import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStorageUnits1786700000000 implements MigrationInterface {
  name = 'AddStorageUnits1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── storage_units ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."storage_units_status_enum" AS ENUM(
        'available', 'occupied', 'maintenance'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_units" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "facility_id" uuid NOT NULL,
        "unit_type_id" uuid NOT NULL,
        "code" character varying(20) NOT NULL,
        "grid_column" integer,
        "grid_row" integer,
        "column_span" integer,
        "row_span" integer,
        "status" "public"."storage_units_status_enum" NOT NULL DEFAULT 'available',
        "booking_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_storage_units" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_storage_units_facility_code" UNIQUE ("facility_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_units_facility_type_status"
        ON "storage_units" ("facility_id", "unit_type_id", "status")
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_units"
        ADD CONSTRAINT "fk_storage_units_facility"
        FOREIGN KEY ("facility_id") REFERENCES "storage_facilities" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_units"
        ADD CONSTRAINT "fk_storage_units_unit_type"
        FOREIGN KEY ("unit_type_id") REFERENCES "storage_unit_types" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_units"
        ADD CONSTRAINT "fk_storage_units_booking"
        FOREIGN KEY ("booking_id") REFERENCES "storage_bookings" ("id") ON DELETE SET NULL
    `);

    // ── storage_facilities: floor-plan columns ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE "storage_facilities"
        ADD COLUMN IF NOT EXISTS "layout_cell_cm" integer NOT NULL DEFAULT 50
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities"
        ADD COLUMN IF NOT EXISTS "layout_version" TIMESTAMP NOT NULL DEFAULT now()
    `);

    // ── Seed storage_units from the current storage_inventory counts ──────
    // Must run before those columns are dropped below. Codes: S/M/L/XL
    // prefix (matching the existing seed's unit-type slugs) + zero-padded
    // sequence, e.g. "S-01".."S-20" — same numbering the floor-plan doc
    // itself used as an example.
    await queryRunner.query(`
      INSERT INTO "storage_units" (
        "id", "facility_id", "unit_type_id", "code", "status", "is_active", "createdAt", "updatedAt"
      )
      SELECT
        uuid_generate_v4(),
        inv.facility_id,
        inv.unit_type_id,
        (CASE ut.slug
           WHEN 'small' THEN 'S'
           WHEN 'medium' THEN 'M'
           WHEN 'large' THEN 'L'
           WHEN 'extra-large' THEN 'XL'
           ELSE upper(left(ut.slug, 2))
         END) || '-' || lpad(seq::text, 2, '0'),
        'available',
        true,
        NOW(), NOW()
      FROM "storage_inventory" inv
      JOIN "storage_unit_types" ut ON ut.id = inv.unit_type_id
      CROSS JOIN LATERAL generate_series(1, inv.total_units) AS seq
      ON CONFLICT ("facility_id", "code") DO NOTHING
    `);

    // ── storage_inventory: drop the now-derived count columns ─────────────
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        DROP CONSTRAINT IF EXISTS "chk_storage_inventory_occupied_range"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory" DROP COLUMN IF EXISTS "total_units"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory" DROP COLUMN IF EXISTS "occupied_units"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the count columns and backfill from storage_units BEFORE
    // dropping that table — the counts have to come from somewhere.
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD COLUMN IF NOT EXISTS "total_units" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD COLUMN IF NOT EXISTS "occupied_units" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "storage_inventory" inv SET
        "total_units" = (
          SELECT COUNT(*) FROM "storage_units" su
          WHERE su.facility_id = inv.facility_id AND su.unit_type_id = inv.unit_type_id
        ),
        "occupied_units" = (
          SELECT COUNT(*) FROM "storage_units" su
          WHERE su.facility_id = inv.facility_id AND su.unit_type_id = inv.unit_type_id
            AND su.status = 'occupied'
        )
    `);
    await queryRunner.query(`
      UPDATE "storage_inventory" SET "total_units" = 0 WHERE "total_units" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory" ALTER COLUMN "total_units" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_inventory"
        ADD CONSTRAINT "chk_storage_inventory_occupied_range"
        CHECK ("occupied_units" >= 0 AND "occupied_units" <= "total_units")
    `);

    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN IF EXISTS "layout_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN IF EXISTS "layout_cell_cm"
    `);

    await queryRunner.query(
      `ALTER TABLE "storage_units" DROP CONSTRAINT IF EXISTS "fk_storage_units_booking"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storage_units" DROP CONSTRAINT IF EXISTS "fk_storage_units_unit_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "storage_units" DROP CONSTRAINT IF EXISTS "fk_storage_units_facility"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_units_facility_type_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "storage_units"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."storage_units_status_enum"`,
    );
  }
}
