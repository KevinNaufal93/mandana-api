import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `notes` to `moving_leads` — customer-provided free text ("Additional
 * notes" on the web form, e.g. "barang mudah pecah"), distinct from the
 * existing staff-internal `admin_note` column. Additive follow-up to
 * `1787600000000-AddMovingLeads`, modeled directly on
 * `1787500100000-AddContentBlockImageOnly`'s single-column-add pattern.
 */
export class AddMovingLeadNotes1787700000000 implements MigrationInterface {
  name = 'AddMovingLeadNotes1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moving_leads" ADD COLUMN "notes" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moving_leads" DROP COLUMN "notes"
    `);
  }
}
