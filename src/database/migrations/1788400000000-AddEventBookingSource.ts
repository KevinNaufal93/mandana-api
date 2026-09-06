import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `source` to `event_bookings`, distinguishing a booking a customer
 * submitted directly (POST /event-support/bookings, added alongside this
 * migration) from one an admin recorded after a WhatsApp conversation.
 * Needed because `created_by_id` alone is ambiguous: it is NULL for both a
 * public submission and an admin booking whose creating user account was
 * later deleted (the FK is ON DELETE SET NULL). Every existing row is
 * admin-recorded, so `DEFAULT 'admin'` backfills correctly with no data
 * migration needed.
 */
export class AddEventBookingSource1788400000000 implements MigrationInterface {
  name = 'AddEventBookingSource1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."event_bookings_source_enum" AS ENUM('public', 'admin');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "event_bookings"
        ADD COLUMN IF NOT EXISTS "source" "public"."event_bookings_source_enum"
        NOT NULL DEFAULT 'admin'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "event_bookings" DROP COLUMN IF EXISTS "source"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."event_bookings_source_enum"`,
    );
  }
}
