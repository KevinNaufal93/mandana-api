import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart Storage insurance switches from "% of rent" to "% of the
 * customer-declared value of the goods being stored" (2026-10-06 product
 * change). See storage-pricing.ts, storage-settings.entity.ts,
 * storage-booking.entity.ts and docs/storage-integration.md.
 *
 * - `storage_settings.insurance_pct` -> `insurance_bps` (basis points, so
 *   ops can set a sub-1% rate like 0.5%), reset to `0`. The old value meant
 *   "% of rent" — applying it unchanged to a declared goods value would be
 *   a nonsensical rate, so insurance goes OFF until ops sets a new one via
 *   `PATCH /admin/storage/settings`.
 * - `storage_bookings.insurance_pct` -> `insurance_bps`, multiplied by 100
 *   so historical bookings keep the exact same percentage (20 -> 2000 bps
 *   == 20%, unchanged) — these are snapshotted historical records, not
 *   something to zero out.
 * - `storage_bookings.declared_value` (numeric, nullable) — the declared
 *   goods value. Only ever set on a cart's "primary" booking (see below).
 * - `storage_bookings.primary_booking_id` (uuid, nullable, self FK) — a
 *   multi-size cart becomes several sibling bookings (the storage API has
 *   no batch booking endpoint); the first one created is the primary and
 *   carries declaredValue/insurance, and every sibling points at it so
 *   admin/export/PDF can show they belong to the same cart.
 *
 * Every step is idempotent: the rename steps are guarded by an
 * information_schema check (so a second run, e.g. after a partial failure,
 * never renames an already-renamed column or double-multiplies the
 * historical bps values), and every ADD/CREATE uses IF NOT EXISTS.
 */
export class StorageInsuranceOnDeclaredValue1790400000000 implements MigrationInterface {
  name = 'StorageInsuranceOnDeclaredValue1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── storage_settings: insurance_pct -> insurance_bps, reset to 0 ──────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'storage_settings' AND column_name = 'insurance_pct'
        ) THEN
          ALTER TABLE "storage_settings" RENAME COLUMN "insurance_pct" TO "insurance_bps";
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_settings"
        ADD COLUMN IF NOT EXISTS "insurance_bps" integer NOT NULL DEFAULT 0
    `);
    // Unconditional reset — the old value meant "% of rent", not a
    // meaningful rate against a declared goods value.
    await queryRunner.query(
      `UPDATE "storage_settings" SET "insurance_bps" = 0`,
    );

    // ── storage_bookings: insurance_pct -> insurance_bps (x100, keep history) ──
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'storage_bookings' AND column_name = 'insurance_pct'
        ) THEN
          ALTER TABLE "storage_bookings" RENAME COLUMN "insurance_pct" TO "insurance_bps";
          UPDATE "storage_bookings" SET "insurance_bps" = "insurance_bps" * 100;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD COLUMN IF NOT EXISTS "insurance_bps" integer NOT NULL DEFAULT 0
    `);

    // ── storage_bookings: declared_value + primary_booking_id ─────────────
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD COLUMN IF NOT EXISTS "declared_value" numeric(14, 0),
        ADD COLUMN IF NOT EXISTS "primary_booking_id" uuid
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_storage_bookings_primary_booking'
        ) THEN
          ALTER TABLE "storage_bookings"
            ADD CONSTRAINT "FK_storage_bookings_primary_booking"
            FOREIGN KEY ("primary_booking_id") REFERENCES "storage_bookings"("id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_storage_bookings_primary_booking_id"
        ON "storage_bookings" ("primary_booking_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_storage_bookings_primary_booking_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        DROP CONSTRAINT IF EXISTS "FK_storage_bookings_primary_booking",
        DROP COLUMN IF EXISTS "primary_booking_id",
        DROP COLUMN IF EXISTS "declared_value"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'storage_bookings' AND column_name = 'insurance_bps'
        ) THEN
          UPDATE "storage_bookings" SET "insurance_bps" = "insurance_bps" / 100;
          ALTER TABLE "storage_bookings" RENAME COLUMN "insurance_bps" TO "insurance_pct";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'storage_settings' AND column_name = 'insurance_bps'
        ) THEN
          ALTER TABLE "storage_settings" RENAME COLUMN "insurance_bps" TO "insurance_pct";
        END IF;
      END $$;
    `);
  }
}
