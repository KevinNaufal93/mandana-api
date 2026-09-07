import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moving Support bills distance in whole 500 m steps, rounded up, instead of
 * linearly per kilometre beyond each leg's included allowance. See
 * moving-pricing.ts. Three changes:
 *
 * 1. `truck_classes.per_km_fare` -> `per_500m_fare`, with every existing rate
 *    converted `ROUND(per_km_fare / 2.0)` so live prices land within a step
 *    of where they are today — this is a mechanical conversion, NOT a
 *    repricing. Ops adjusts the real numbers afterwards through
 *    `PATCH /admin/moving/truck-classes/:id`. The four seeded placeholders
 *    become: pickup-bak 2250, cde 3000, cdd 4000, fuso 5500.
 * 2. A nullable `chargeable_steps` on `moving_bookings` and
 *    `moving_booking_legs`. The booking snapshot stores no rate (only
 *    truckSlug/truckName/baseFare/distanceFare) and `chargeable_km` is
 *    rounded to 0.1 km, so without this column the step count behind a past
 *    `distance_fare` is unrecoverable. NULL on pre-existing rows is
 *    deliberate: those bookings were priced per km, so a step count does not
 *    apply to them and back-filling one would fabricate history.
 * 3. The 500 m step size itself is NOT a column — it is a constant in
 *    moving-pricing.ts (MOVING_DISTANCE_STEP_METERS), not admin-tunable.
 *
 * `down()` is exact for the schema but LOSSY for odd rates: it multiplies by
 * 2, which cannot recover the Rupiah lost to ROUND() (a pre-`up()` rate of
 * 4,501 comes back as 4,502). All four seeded rates are even, so seed data
 * round-trips exactly; only an ops-entered odd rate drifts by 1 Rupiah.
 */
export class MovingDistanceStepPricing1788700000000
  implements MigrationInterface
{
  name = 'MovingDistanceStepPricing1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres has no IF EXISTS on RENAME COLUMN, so this guards on the old
    // column (same pattern as 1788600000000). The rename and the conversion
    // share ONE guard on purpose: splitting them into two independently
    // guarded statements would let a partial re-run halve an already-halved
    // rate.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'truck_classes'
            AND column_name = 'per_km_fare'
        ) THEN
          ALTER TABLE "truck_classes"
            RENAME COLUMN "per_km_fare" TO "per_500m_fare";
          UPDATE "truck_classes"
            SET "per_500m_fare" = (ROUND("per_500m_fare" / 2.0))::int;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "moving_bookings"
        ADD COLUMN IF NOT EXISTS "chargeable_steps" integer
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_booking_legs"
        ADD COLUMN IF NOT EXISTS "chargeable_steps" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "moving_booking_legs"
        DROP COLUMN IF EXISTS "chargeable_steps"
    `);
    await queryRunner.query(`
      ALTER TABLE "moving_bookings"
        DROP COLUMN IF EXISTS "chargeable_steps"
    `);

    // Same single-guard reasoning as up(), mirrored: un-convert then rename,
    // both or neither.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'truck_classes'
            AND column_name = 'per_500m_fare'
        ) THEN
          UPDATE "truck_classes" SET "per_500m_fare" = "per_500m_fare" * 2;
          ALTER TABLE "truck_classes"
            RENAME COLUMN "per_500m_fare" TO "per_km_fare";
        END IF;
      END $$
    `);
  }
}
