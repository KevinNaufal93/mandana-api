import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Smart Storage insurance: a configurable whole-percent premium applied on
 * top of every quote/booking's rent (`total = subtotal + insuranceAmount`),
 * plus the removal of the old duration-discount tiers (`discountAmount` is
 * never written non-zero again, but the column and its historical values
 * stay). See storage-pricing.ts, storage-settings.entity.ts and
 * docs/storage-integration.md.
 *
 * Behaviour-neutral on its own: `storage_settings.insurance_pct` seeds at
 * `0`, so every quote/booking total is unchanged until ops sets a
 * percentage via `PATCH /admin/storage/settings` (web-admin → Mandana
 * Space → Pengaturan). Existing `storage_bookings` rows backfill
 * `insurance_pct`/`insurance_amount` to `0` — their `total` already
 * reflects the pre-insurance math and stays untouched.
 */
export class AddStorageInsurance1788900000000 implements MigrationInterface {
  name = 'AddStorageInsurance1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── storage_settings (singleton) ────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "storage_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "singleton" boolean NOT NULL DEFAULT true,
        "insurance_pct" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_storage_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_storage_settings_singleton" UNIQUE ("singleton"),
        CONSTRAINT "CHK_storage_settings_singleton" CHECK ("singleton" = true)
      )
    `);

    // Seeded at 0 — this migration changes no quote/booking output on its own.
    await queryRunner.query(`
      INSERT INTO "storage_settings" (
        "id", "singleton", "insurance_pct", "createdAt", "updatedAt"
      )
      VALUES (uuid_generate_v4(), true, 0, NOW(), NOW())
      ON CONFLICT ("singleton") DO NOTHING
    `);

    // ── storage_bookings: insurance snapshot columns ────────────────────
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        ADD COLUMN IF NOT EXISTS "insurance_pct" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "insurance_amount" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "storage_bookings"
        DROP COLUMN IF EXISTS "insurance_amount",
        DROP COLUMN IF EXISTS "insurance_pct"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "storage_settings"`);
  }
}
