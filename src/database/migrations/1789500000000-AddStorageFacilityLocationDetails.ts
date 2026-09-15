import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds four nullable columns to `storage_facilities`, backing the new
 * public location pages (see the web repo's SEO plan, §11.1):
 * `opening_hours`/`phone` (free text — the admin doesn't have these yet,
 * and they're needed for the page itself, tap-to-call, and the
 * LocalBusiness/SelfStorage structured data) and `meta_title`/
 * `meta_description` (per-facility SEO override, same convention as
 * Article and Property).
 *
 * All four start NULL — nothing changes for an existing facility until an
 * admin fills them in.
 */
export class AddStorageFacilityLocationDetails1789500000000
  implements MigrationInterface
{
  name = 'AddStorageFacilityLocationDetails1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" ADD COLUMN "opening_hours" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" ADD COLUMN "phone" character varying(32)
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" ADD COLUMN "meta_title" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" ADD COLUMN "meta_description" character varying(300)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN "meta_description"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN "meta_title"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN "phone"
    `);
    await queryRunner.query(`
      ALTER TABLE "storage_facilities" DROP COLUMN "opening_hours"
    `);
  }
}
