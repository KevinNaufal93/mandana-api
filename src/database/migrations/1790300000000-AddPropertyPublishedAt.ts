import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `published_at` to `properties` — the first time a listing went
 * public, stable across an unpublish/republish cycle. Mirrors
 * `Article.publishedAt` (see `1789100000000-AddArticles`'s entity), which
 * exists for the same reason: `updatedAt` alone can't tell "went live" apart
 * from "edited after going live", and `createdAt` can predate publication by
 * however long the listing sat as a draft.
 *
 * Backfill: properties already public (published/sold/rented) get their
 * `createdAt` as a best-effort `published_at` — the real publish moment
 * isn't recorded anywhere for rows created before this migration.
 */
export class AddPropertyPublishedAt1790300000000 implements MigrationInterface {
  name = 'AddPropertyPublishedAt1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "properties"
      SET "published_at" = "createdAt"
      WHERE "published_at" IS NULL
        AND "status" IN ('published', 'sold', 'rented')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN IF EXISTS "published_at"
    `);
  }
}
