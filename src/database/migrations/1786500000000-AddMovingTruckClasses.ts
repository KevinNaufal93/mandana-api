import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMovingTruckClasses1786500000000 implements MigrationInterface {
  name = 'AddMovingTruckClasses1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "truck_classes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "description" text,
        "capacity_kg" integer,
        "volume_m3" numeric(6,2),
        "length_cm" integer,
        "width_cm" integer,
        "height_cm" integer,
        "helper_count" integer,
        "base_fare" integer NOT NULL,
        "per_km_fare" integer NOT NULL,
        "included_km" integer,
        "min_fare" integer,
        "media_asset_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_truck_classes_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_truck_classes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_truck_classes_is_active"
        ON "truck_classes" ("is_active")
    `);

    await queryRunner.query(`
      ALTER TABLE "truck_classes"
        ADD CONSTRAINT "fk_truck_classes_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);

    // Seed the four standard Indonesian truck classes the frontend's stub
    // already assumes, so slugs line up on swap day. Every fare below is a
    // placeholder pending sign-off from ops before the page goes live.
    await queryRunner.query(`
      INSERT INTO "truck_classes" (
        "id", "name", "slug", "description",
        "capacity_kg", "volume_m3", "length_cm", "width_cm", "height_cm", "helper_count",
        "base_fare", "per_km_fare", "included_km", "min_fare",
        "is_active", "sort_order", "createdAt", "updatedAt"
      )
      VALUES
        (uuid_generate_v4(), 'Pick Up Bak', 'pickup-bak',
          'Cocok untuk isi kamar kos atau barang ±3 m³',
          1000, 3.5, 210, 140, 120, 1,
          -- TODO: placeholder rate, confirm with ops
          250000, 4500, 5, 250000,
          true, 10, NOW(), NOW()),
        (uuid_generate_v4(), 'CDE (Colt Diesel Engkel)', 'cde',
          'Cocok untuk isi rumah tipe 21-36',
          2000, 8, 280, 170, 180, 2,
          -- TODO: placeholder rate, confirm with ops
          500000, 6000, 5, 500000,
          true, 20, NOW(), NOW()),
        (uuid_generate_v4(), 'CDD (Colt Diesel Double)', 'cdd',
          'Cocok untuk isi rumah tipe 36-70',
          4000, 16, 420, 200, 200, 2,
          -- TODO: placeholder rate, confirm with ops
          850000, 8000, 5, 850000,
          true, 30, NOW(), NOW()),
        (uuid_generate_v4(), 'Fuso', 'fuso',
          'Cocok untuk isi rumah besar atau pindahan kantor',
          7000, 28, 600, 220, 220, 3,
          -- TODO: placeholder rate, confirm with ops
          1500000, 11000, 10, 1500000,
          true, 40, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "truck_classes" DROP CONSTRAINT IF EXISTS "fk_truck_classes_media_asset"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_truck_classes_is_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "truck_classes"`);
  }
}
