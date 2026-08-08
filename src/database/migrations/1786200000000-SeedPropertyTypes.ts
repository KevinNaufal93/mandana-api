import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedPropertyTypes1786200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "property_types" ("id", "name", "slug", "createdAt", "updatedAt")
      VALUES
        (uuid_generate_v4(), 'Rumah',     'rumah',     NOW(), NOW()),
        (uuid_generate_v4(), 'Apartemen', 'apartemen', NOW(), NOW()),
        (uuid_generate_v4(), 'Townhouse', 'townhouse', NOW(), NOW()),
        (uuid_generate_v4(), 'Villa',     'villa',     NOW(), NOW()),
        (uuid_generate_v4(), 'Kavling',   'kavling',   NOW(), NOW()),
        (uuid_generate_v4(), 'Ruko',      'ruko',      NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "properties"
      SET "property_type_id" = (
        SELECT "id" FROM "property_types" WHERE "slug" = 'rumah' LIMIT 1
      )
      WHERE "property_type_id" IS NULL
        AND "status" = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "properties"
      SET "property_type_id" = NULL
      WHERE "property_type_id" IN (
        SELECT "id" FROM "property_types"
        WHERE "slug" IN ('rumah', 'apartemen', 'townhouse', 'villa', 'kavling', 'ruko')
      )
    `);

    await queryRunner.query(`
      DELETE FROM "property_types"
      WHERE "slug" IN ('rumah', 'apartemen', 'townhouse', 'villa', 'kavling', 'ruko')
    `);
  }
}
