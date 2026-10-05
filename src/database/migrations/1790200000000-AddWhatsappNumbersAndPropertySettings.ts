import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin-configurable WhatsApp numbers + KPR rate.
 *
 * 1. `whatsapp_number` (nullable varchar(32)) on the four existing settings
 *    singletons: moving_settings (Mandana Move), storage_settings (Mandana
 *    Space), event_support_settings (Mandana Living) and seo_settings
 *    (General). Until now the website read one number from its own
 *    NEXT_PUBLIC_MANDANA_WHATSAPP env var; the API stored none. All start
 *    NULL, and the website falls back to the env value when a number is
 *    empty, so this migration changes no live behaviour on its own.
 * 2. `property_settings`: a new singleton holding the KPR simulator's
 *    fixed interest rate (basis points, so 1.75% = 175 and there is no
 *    numeric-comes-back-as-a-string quirk) and tenor in years. Seeded with
 *    the values the website hardcoded (175 bps, 25 years).
 */
const WHATSAPP_TABLES = [
  'moving_settings',
  'storage_settings',
  'event_support_settings',
  'seo_settings',
];

export class AddWhatsappNumbersAndPropertySettings1790200000000 implements MigrationInterface {
  name = 'AddWhatsappNumbersAndPropertySettings1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of WHATSAPP_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "whatsapp_number" character varying(32)
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "property_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "singleton" boolean NOT NULL DEFAULT true,
        "kpr_annual_rate_bps" integer NOT NULL DEFAULT 175,
        "kpr_tenor_years" integer NOT NULL DEFAULT 25,
        CONSTRAINT "PK_property_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_property_settings_singleton" UNIQUE ("singleton"),
        CONSTRAINT "CHK_property_settings_singleton" CHECK ("singleton" = true)
      )
    `);

    await queryRunner.query(`
      INSERT INTO "property_settings" (
        "id", "singleton", "kpr_annual_rate_bps", "kpr_tenor_years",
        "createdAt", "updatedAt"
      )
      VALUES (uuid_generate_v4(), true, 175, 25, NOW(), NOW())
      ON CONFLICT ("singleton") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "property_settings"`);

    for (const table of WHATSAPP_TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}" DROP COLUMN IF EXISTS "whatsapp_number"
      `);
    }
  }
}
