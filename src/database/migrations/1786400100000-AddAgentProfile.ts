import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentProfile1786400100000 implements MigrationInterface {
  name = 'AddAgentProfile1786400100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── users: public agent-profile fields ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "title" character varying(100),
        ADD COLUMN IF NOT EXISTS "phone" character varying(30),
        ADD COLUMN IF NOT EXISTS "whatsapp" character varying(30),
        ADD COLUMN IF NOT EXISTS "photo_media_asset_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "fk_users_photo_media_asset"
        FOREIGN KEY ("photo_media_asset_id") REFERENCES "media_assets" ("id")
        ON DELETE SET NULL
    `);

    // ─── properties: agent (User) FK ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "agent_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_properties_agent_id" ON "properties" ("agent_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD CONSTRAINT "fk_properties_agent"
        FOREIGN KEY ("agent_id") REFERENCES "users" ("id")
        ON DELETE SET NULL
    `);

    // Backfill existing listings to the oldest admin so no live listing
    // renders an empty agent card.
    await queryRunner.query(`
      UPDATE "properties"
      SET "agent_id" = (
        SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "createdAt" ASC LIMIT 1
      )
      WHERE "agent_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "fk_properties_agent"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_properties_agent_id"`);
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN IF EXISTS "agent_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "fk_users_photo_media_asset"
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "photo_media_asset_id",
        DROP COLUMN IF EXISTS "whatsapp",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "title"
    `);
  }
}
