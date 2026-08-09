import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmenities1786400000000 implements MigrationInterface {
  name = 'AddAmenities1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amenities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "icon" character varying(64),
        "category" character varying(50),
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "UQ_amenities_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_amenities" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "property_amenities" (
        "property_id" uuid NOT NULL,
        "amenity_id" uuid NOT NULL,
        CONSTRAINT "PK_property_amenities" PRIMARY KEY ("property_id", "amenity_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_property_amenities_amenity_id"
        ON "property_amenities" ("amenity_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_property_amenities_property_id"
        ON "property_amenities" ("property_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "property_amenities"
        ADD CONSTRAINT "fk_property_amenities_property"
        FOREIGN KEY ("property_id") REFERENCES "properties" ("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "property_amenities"
        ADD CONSTRAINT "fk_property_amenities_amenity"
        FOREIGN KEY ("amenity_id") REFERENCES "amenities" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      INSERT INTO "amenities" ("id", "name", "slug", "icon", "category", "sort_order", "createdAt", "updatedAt")
      VALUES
        (uuid_generate_v4(), 'Air-conditioning',      'air-conditioning',      'ac',          'interior', 10, NOW(), NOW()),
        (uuid_generate_v4(), 'Balcony',                'balcony',               'balcony',     'interior', 20, NOW(), NOW()),
        (uuid_generate_v4(), 'Partially furnished',    'partially-furnished',   'furniture',   'interior', 30, NOW(), NOW()),
        (uuid_generate_v4(), 'Oven / microwave',       'oven-microwave',        'oven',        'interior', 40, NOW(), NOW()),
        (uuid_generate_v4(), 'Water heater',           'water-heater',          'water-heater','interior', 50, NOW(), NOW()),
        (uuid_generate_v4(), 'Gym',                    'gym',                   'gym',         'building', 60, NOW(), NOW()),
        (uuid_generate_v4(), 'Swimming pool',          'swimming-pool',         'pool',        'building', 70, NOW(), NOW()),
        (uuid_generate_v4(), 'Security 24 jam',        'security-24-jam',       'security',    'building', 80, NOW(), NOW()),
        (uuid_generate_v4(), 'CCTV',                   'cctv',                  'cctv',        'building', 90, NOW(), NOW()),
        (uuid_generate_v4(), 'Playground',             'playground',            'playground',  'building', 100, NOW(), NOW()),
        (uuid_generate_v4(), 'Carport / garage',       'carport-garage',        'carport',     'outdoor',  110, NOW(), NOW()),
        (uuid_generate_v4(), 'Park / greenery view',   'park-greenery-view',    'park',        'outdoor',  120, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_amenities" DROP CONSTRAINT IF EXISTS "fk_property_amenities_amenity"
    `);
    await queryRunner.query(`
      ALTER TABLE "property_amenities" DROP CONSTRAINT IF EXISTS "fk_property_amenities_property"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_property_amenities_property_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_property_amenities_amenity_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "property_amenities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "amenities"`);
  }
}
