import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPropertyImageMediaAsset1786089600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_images"
        ADD COLUMN IF NOT EXISTS "media_asset_id" uuid,
        ALTER COLUMN "url" DROP NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_property_images_media_asset_id"
        ON "property_images" ("media_asset_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "property_images"
        ADD CONSTRAINT "fk_property_images_media_asset"
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets" ("id")
        ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "property_images"
        DROP CONSTRAINT IF EXISTS "fk_property_images_media_asset"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_property_images_media_asset_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "property_images"
        DROP COLUMN IF EXISTS "media_asset_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "property_images"
        ALTER COLUMN "url" SET NOT NULL
    `);
  }
}
