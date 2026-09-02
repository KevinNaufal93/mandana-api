import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moving Support per-leg pricing: `moving_lead_legs`, a priced breakdown
 * snapshot (one row per leg of the trip: pickup→stop1, stop1→stop2, ...),
 * alongside the existing `moving_lead_stops` (route/location record) and
 * `moving_lead_addons` (priced add-on lines). Additive follow-up to
 * `1787600000000-AddMovingLeads` — no columns removed or altered on any
 * existing table. No seed data.
 */
export class AddMovingLeadLegs1787900000000 implements MigrationInterface {
  name = 'AddMovingLeadLegs1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moving_lead_legs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lead_id" uuid NOT NULL,
        "leg_index" integer NOT NULL,
        "distance_km" numeric(7,1) NOT NULL,
        "included_km" integer NOT NULL,
        "chargeable_km" numeric(7,1) NOT NULL,
        "base_fare" integer NOT NULL,
        "distance_fare" integer NOT NULL,
        "subtotal" integer NOT NULL,
        CONSTRAINT "PK_moving_lead_legs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_moving_lead_legs_lead_index"
        ON "moving_lead_legs" ("lead_id", "leg_index")
    `);

    await queryRunner.query(`
      ALTER TABLE "moving_lead_legs"
        ADD CONSTRAINT "fk_moving_lead_legs_lead"
        FOREIGN KEY ("lead_id") REFERENCES "moving_leads" ("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moving_lead_legs" DROP CONSTRAINT IF EXISTS "fk_moving_lead_legs_lead"
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_moving_lead_legs_lead_index"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "moving_lead_legs"`);
  }
}
