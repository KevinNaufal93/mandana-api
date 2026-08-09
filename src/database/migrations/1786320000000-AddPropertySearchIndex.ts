import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertySearchIndex1786320000000 implements MigrationInterface {
  name = 'AddPropertySearchIndex1786320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_properties_fts" ON "properties"
      USING GIN (
        to_tsvector(
          'simple',
          COALESCE(title, '') || ' ' ||
          COALESCE(city, '') || ' ' ||
          COALESCE(province, '') || ' ' ||
          COALESCE(area, '') || ' ' ||
          COALESCE(address, '') || ' ' ||
          COALESCE(description, '')
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_properties_fts"`);
  }
}
