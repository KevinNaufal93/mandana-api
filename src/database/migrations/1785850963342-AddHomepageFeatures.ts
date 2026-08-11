import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHomepageFeatures1785850963342 implements MigrationInterface {
  name = 'AddHomepageFeatures1785850963342';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "media_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "storage_key" text NOT NULL, "variants" jsonb NOT NULL DEFAULT '{}', "mime_type" character varying(100) NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "size_bytes" integer NOT NULL, "alt" character varying(500), CONSTRAINT "PK_ca47e9f67a5e5d8af1e75d66ee6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "collections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "slug" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "description" text, "cover_media_asset_id" uuid, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "show_on_homepage" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_99d0d14f9f23b45d2c6648c4b57" UNIQUE ("slug"), CONSTRAINT "PK_21c00b1ebbd41ba1354242c5c4e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "collection_properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "collection_id" uuid NOT NULL, "property_id" uuid NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_69053983a3e57af4f16ac90fd6a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "hero_slides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "media_asset_id" uuid NOT NULL, "title" character varying(255), "subtitle" character varying(500), "cta_text" character varying(100), "cta_link" character varying(500), "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_a66cc04fc23dc34ba5627fbbef4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "homepage_recommendations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "property_id" uuid NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_fffb3bf34c9448a461e1602dd07" UNIQUE ("property_id"), CONSTRAINT "PK_b16e55dfde6249e45331d59abb1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "collections" ADD CONSTRAINT "FK_f803ef0802cddb56e13fc1b9100" FOREIGN KEY ("cover_media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_properties" ADD CONSTRAINT "FK_10670fbbd7f617aab66b2fbb0ec" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_properties" ADD CONSTRAINT "FK_9d66bac1c7c6a4f0c46510c289d" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "hero_slides" ADD CONSTRAINT "FK_fb67376bedb1efff5f9853ff8f3" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "homepage_recommendations" ADD CONSTRAINT "FK_fffb3bf34c9448a461e1602dd07" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "homepage_recommendations" DROP CONSTRAINT "FK_fffb3bf34c9448a461e1602dd07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "hero_slides" DROP CONSTRAINT "FK_fb67376bedb1efff5f9853ff8f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_properties" DROP CONSTRAINT "FK_9d66bac1c7c6a4f0c46510c289d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection_properties" DROP CONSTRAINT "FK_10670fbbd7f617aab66b2fbb0ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collections" DROP CONSTRAINT "FK_f803ef0802cddb56e13fc1b9100"`,
    );
    await queryRunner.query(`DROP TABLE "homepage_recommendations"`);
    await queryRunner.query(`DROP TABLE "hero_slides"`);
    await queryRunner.query(`DROP TABLE "collection_properties"`);
    await queryRunner.query(`DROP TABLE "collections"`);
    await queryRunner.query(`DROP TABLE "media_assets"`);
  }
}
