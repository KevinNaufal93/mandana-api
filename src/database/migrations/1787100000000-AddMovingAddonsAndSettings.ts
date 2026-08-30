import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moving Support: configurable add-on fees (helper, packaging, waiting,
 * insurance, toll estimate) and the pricing-policy singleton (rounding
 * step, ± estimate band, fallback included-km) that used to be hardcoded
 * as MOVING_DEFAULTS. See moving-pricing.ts and docs/moving-integration.md.
 */
export class AddMovingAddonsAndSettings1787100000000 implements MigrationInterface {
  name = 'AddMovingAddonsAndSettings1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── moving_addons ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."moving_addons_kind_enum" AS ENUM(
        'helper', 'packaging', 'waiting', 'insurance', 'toll', 'other'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."moving_addons_pricing_model_enum" AS ENUM(
        'flat', 'per_unit', 'percent'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_addons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(150) NOT NULL,
        "slug" character varying(150) NOT NULL,
        "description" text,
        "kind" "public"."moving_addons_kind_enum" NOT NULL,
        "pricing_model" "public"."moving_addons_pricing_model_enum" NOT NULL,
        "unit_price" integer NOT NULL DEFAULT 0,
        "percent_bps" integer,
        "min_charge" integer,
        "max_charge" integer,
        "unit_label" character varying(30),
        "min_qty" integer NOT NULL DEFAULT 1,
        "max_qty" integer NOT NULL DEFAULT 10,
        "doubles_on_round_trip" boolean NOT NULL DEFAULT false,
        "media_asset_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_moving_addons_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_moving_addons" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_addons_is_active_sort"
        ON "moving_addons" ("is_active", "sort_order")
    `);

    await queryRunner.query(`
      ALTER TABLE "moving_addons"
        ADD CONSTRAINT "fk_moving_addons_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // Seed the five customer-facing fees plus a toll-estimate row. Every
    // rate below is a placeholder pending sign-off from ops before the page
    // goes live — the toll row seeds INACTIVE until ops confirms the
    // per-km figure against real receipts (see docs/moving-integration.md).
    await queryRunner.query(`
      INSERT INTO "moving_addons" (
        "id", "name", "slug", "description",
        "kind", "pricing_model", "unit_price", "percent_bps",
        "min_charge", "max_charge", "unit_label", "min_qty", "max_qty",
        "doubles_on_round_trip", "is_active", "sort_order", "createdAt", "updatedAt"
      )
      VALUES
        (uuid_generate_v4(), 'Helper', 'helper',
          'Tenaga bantu angkat-angkut tambahan',
          'helper', 'per_unit',
          -- TODO: placeholder rate, confirm with ops
          150000, NULL,
          NULL, NULL, 'orang', 1, 6,
          false, true, 10, NOW(), NOW()),
        (uuid_generate_v4(), 'Packaging Basic', 'packaging-basic',
          'Bubble wrap dan kardus untuk barang standar',
          'packaging', 'flat',
          -- TODO: placeholder rate, confirm with ops
          250000, NULL,
          NULL, NULL, NULL, 1, 1,
          false, true, 20, NOW(), NOW()),
        (uuid_generate_v4(), 'Packaging Full', 'packaging-full',
          'Pengemasan penuh untuk barang pecah belah/elektronik',
          'packaging', 'flat',
          -- TODO: placeholder rate, confirm with ops
          750000, NULL,
          NULL, NULL, NULL, 1, 1,
          false, true, 30, NOW(), NOW()),
        (uuid_generate_v4(), 'Waktu Tunggu Tambahan', 'waiting-time',
          'Biaya tambahan per jam di luar estimasi waktu bongkar muat',
          'waiting', 'per_unit',
          -- TODO: placeholder rate, confirm with ops
          100000, NULL,
          NULL, NULL, 'jam', 1, 12,
          false, true, 40, NOW(), NOW()),
        (uuid_generate_v4(), 'Asuransi Barang', 'insurance',
          'Premi asuransi barang selama pengiriman, berdasarkan nilai barang yang dideklarasikan',
          'insurance', 'percent',
          -- TODO: placeholder rate, confirm with ops
          0, 20,
          50000, NULL, NULL, 1, 1,
          false, true, 50, NOW(), NOW()),
        (uuid_generate_v4(), 'Estimasi Tol', 'toll-estimate',
          'Estimasi biaya tol berdasarkan jarak rute, dikonfirmasi dari struk aktual',
          'toll', 'per_unit',
          -- TODO: placeholder rate, confirm with ops — seeded INACTIVE
          1300, NULL,
          0, NULL, 'km', 1, 1,
          true, false, 60, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    // ── moving_settings (singleton) ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "singleton" boolean NOT NULL DEFAULT true,
        "round_to_idr" integer NOT NULL DEFAULT 10000,
        "band_pct" integer NOT NULL DEFAULT 10,
        "default_included_km" integer NOT NULL DEFAULT 5,
        CONSTRAINT "PK_moving_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_moving_settings_singleton" UNIQUE ("singleton"),
        CONSTRAINT "CHK_moving_settings_singleton" CHECK ("singleton" = true)
      )
    `);

    // Seeded with today's exact MOVING_DEFAULTS — this migration changes
    // no quote output on its own.
    await queryRunner.query(`
      INSERT INTO "moving_settings" (
        "id", "singleton", "round_to_idr", "band_pct", "default_included_km", "createdAt", "updatedAt"
      )
      VALUES (uuid_generate_v4(), true, 10000, 10, 5, NOW(), NOW())
      ON CONFLICT ("singleton") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_settings"`);

    await queryRunner.query(
      `ALTER TABLE "moving_addons" DROP CONSTRAINT IF EXISTS "fk_moving_addons_media_asset"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_addons_is_active_sort"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_addons"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."moving_addons_pricing_model_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."moving_addons_kind_enum"`,
    );
  }
}
