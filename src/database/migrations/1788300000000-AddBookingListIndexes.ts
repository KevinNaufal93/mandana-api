import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every admin "pemesanan" list (Storage, Moving, Event Support) now sorts
 * and filters on `createdAt` and `status` by default, and none of the three
 * tables indexed `createdAt` before this. Ships two index shapes per table,
 * since they serve different queries:
 *
 * - Plain `("createdAt" DESC, "id" DESC)` — the default unfiltered
 *   `ORDER BY createdAt DESC, id DESC LIMIT n`, as a no-sort top-N. A
 *   composite alone can't serve this (its leading column is unconstrained,
 *   so Postgres falls back to a full scan + sort).
 * - Composite `("status", "createdAt" DESC, "id" DESC)` — `WHERE status = ?
 *   ORDER BY createdAt DESC`, how every admin table opens ("show me
 *   pending"). Supersedes storage_bookings' existing single-column
 *   `idx_storage_bookings_status` (its leading column).
 *
 * `"createdAt"` is the quoted camelCase column BaseEntity gives every
 * table — unquoted it will not resolve.
 *
 * Also adds a plain `(start_date, end_date)` index on storage_bookings and
 * event_bookings for the new startFrom/startTo window-overlap filter.
 *
 * Deliberately NOT indexed: `total` (sorting a few thousand rows costs
 * microseconds) and `reference` (its UNIQUE constraint is already a btree
 * that serves `ORDER BY reference` directly). Free-text `search` stays
 * un-indexed too — `pg_trgm` isn't enabled anywhere in this database, and a
 * leading-wildcard `ILIKE '%x%'` can't use a plain btree at all; that's the
 * scaling escape hatch for later, not this migration's job.
 */
export class AddBookingListIndexes1788300000000 implements MigrationInterface {
  name = 'AddBookingListIndexes1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── storage_bookings ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_bookings_created_at"
        ON "storage_bookings" ("createdAt" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_bookings_status_created_at"
        ON "storage_bookings" ("status", "createdAt" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_storage_bookings_status"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_bookings_dates"
        ON "storage_bookings" ("start_date", "end_date")
    `);

    // ── moving_bookings ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_bookings_created_at"
        ON "moving_bookings" ("createdAt" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_bookings_status_created_at"
        ON "moving_bookings" ("status", "createdAt" DESC, "id" DESC)
    `);

    // ── event_bookings ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_bookings_created_at"
        ON "event_bookings" ("createdAt" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_bookings_status_created_at"
        ON "event_bookings" ("status", "createdAt" DESC, "id" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_event_bookings_dates"
        ON "event_bookings" ("start_date", "end_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_event_bookings_dates"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_event_bookings_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_event_bookings_created_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_bookings_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_bookings_created_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_bookings_dates"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_storage_bookings_status"
        ON "storage_bookings" ("status")
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_bookings_status_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_storage_bookings_created_at"`,
    );
  }
}
