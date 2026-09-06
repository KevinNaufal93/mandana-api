import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Web-admin notification bell: one `admin_notifications` row per booking
 * created in Moving/Storage/Event Support (customer-submitted or, for Event
 * Support's WhatsApp path, admin-recorded). Deliberately NOT FK'd to any of
 * the three booking tables -- `source_id` points at whichever one
 * `source_module` names, and application code (NotificationsService) is what
 * enforces that pairing.
 *
 * No backfill: this migration creates an empty table. Every booking already
 * `pending` at deploy time stays invisible to the bell -- product decision,
 * not an oversight (see docs/notifications-integration.md).
 *
 * `read_at` and `resolved_at` are separate, independent columns on purpose --
 * that separation is the entire feature. Opening the bell only ever sets
 * `read_at` (global/shared, one column, not per-admin); only a booking
 * actually leaving `pending` sets `resolved_at`. Nothing that touches one
 * column is allowed to touch the other -- see NotificationsService.
 */
export class AddAdminNotifications1788500000000 implements MigrationInterface {
  name = 'AddAdminNotifications1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."admin_notifications_source_module_enum" AS ENUM(
        'moving', 'storage', 'event_support'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."admin_notifications_origin_enum" AS ENUM(
        'customer', 'admin'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "source_module" "public"."admin_notifications_source_module_enum" NOT NULL,
        "source_id" uuid NOT NULL,
        "reference" character varying(20) NOT NULL,
        "customer_name" character varying(255),
        "total" integer NOT NULL,
        "origin" "public"."admin_notifications_origin_enum" NOT NULL DEFAULT 'customer',
        "read_at" TIMESTAMP WITH TIME ZONE,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "resolved_status" character varying(20),
        CONSTRAINT "PK_admin_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_notifications_source" UNIQUE ("source_module", "source_id")
      )
    `);

    // Feed order, stable tiebreaker -- same shape as every booking list's
    // own createdAt index (see 1788300000000-AddBookingListIndexes).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notifications_created_at"
        ON "admin_notifications" ("createdAt" DESC, "id" DESC)
    `);
    // Partial index backing the badge count: `WHERE resolved_at IS NULL` is
    // exactly NotificationsService.getSummary()'s unresolvedCount query, and
    // stays small forever since resolved rows drop out of it entirely.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_admin_notifications_unresolved"
        ON "admin_notifications" ("resolved_at")
        WHERE "resolved_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_notifications_unresolved"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_admin_notifications_created_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_notifications"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."admin_notifications_origin_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."admin_notifications_source_module_enum"`,
    );
  }
}
