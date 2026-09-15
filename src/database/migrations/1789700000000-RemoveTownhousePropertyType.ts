import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTownhousePropertyType1789700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "properties"
      SET "property_type_id" = (
        SELECT "id" FROM "property_types" WHERE "slug" = 'rumah' LIMIT 1
      )
      WHERE "property_type_id" = (
        SELECT "id" FROM "property_types" WHERE "slug" = 'townhouse' LIMIT 1
      )
    `);

    await queryRunner.query(`
      DELETE FROM "property_types" WHERE "slug" = 'townhouse'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "property_types" ("id", "name", "slug", "createdAt", "updatedAt")
      VALUES (uuid_generate_v4(), 'Townhouse', 'townhouse', NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);
  }
}
