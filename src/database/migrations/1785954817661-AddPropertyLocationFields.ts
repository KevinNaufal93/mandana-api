import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyLocationFields1785954817661 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "area"     VARCHAR(150),
        ADD COLUMN IF NOT EXISTS "province" VARCHAR(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
        DROP COLUMN IF EXISTS "area",
        DROP COLUMN IF EXISTS "province"
    `);
  }
}
