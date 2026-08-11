import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1785429145684 implements MigrationInterface {
  name = 'InitialSchema1785429145684';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "property_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(100) NOT NULL, "slug" character varying(100) NOT NULL, CONSTRAINT "UQ_e1d826d0f51f07313f77e3e294a" UNIQUE ("slug"), CONSTRAINT "PK_129390b286b9c776438dfa475a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."properties_listing_type_enum" AS ENUM('sale', 'rent')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."properties_status_enum" AS ENUM('draft', 'published', 'archived')`,
    );
    await queryRunner.query(
      `CREATE TABLE "properties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "slug" character varying(255) NOT NULL, "title" character varying(255) NOT NULL, "description" text, "listing_type" "public"."properties_listing_type_enum" NOT NULL DEFAULT 'sale', "status" "public"."properties_status_enum" NOT NULL DEFAULT 'draft', "price" numeric(15,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'IDR', "bedrooms" integer, "bathrooms" integer, "area_sqm" numeric(10,2), "address" character varying(500), "city" character varying(100), "latitude" numeric(9,6), "longitude" numeric(9,6), "is_featured" boolean NOT NULL DEFAULT false, "property_type_id" uuid, CONSTRAINT "UQ_089e10e6f1282e7b4bd0c58263e" UNIQUE ("slug"), CONSTRAINT "PK_2d83bfa0b9fcd45dee1785af44d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_089e10e6f1282e7b4bd0c58263" ON "properties"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "property_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "url" text NOT NULL, "alt" character varying(255), "sort_order" integer NOT NULL DEFAULT '0', "is_cover" boolean NOT NULL DEFAULT false, "property_id" uuid NOT NULL, CONSTRAINT "PK_317c3774ee70c26d70c4f80e200" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "inquiries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "name" character varying(255) NOT NULL, "email" character varying(255) NOT NULL, "phone" character varying(30), "message" text NOT NULL, "property_id" uuid, CONSTRAINT "PK_ceacaa439988b25eb9459e694d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'editor')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "name" character varying(255) NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'editor', "is_active" boolean NOT NULL DEFAULT true, "hashed_refresh_token" text, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "properties" ADD CONSTRAINT "FK_21050016bee57be0b28e2c7ad97" FOREIGN KEY ("property_type_id") REFERENCES "property_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_images" ADD CONSTRAINT "FK_162a7701665354b4751ffb835e4" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inquiries" ADD CONSTRAINT "FK_fb8f767d33104c829ea4eabeca6" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inquiries" DROP CONSTRAINT "FK_fb8f767d33104c829ea4eabeca6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "property_images" DROP CONSTRAINT "FK_162a7701665354b4751ffb835e4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "properties" DROP CONSTRAINT "FK_21050016bee57be0b28e2c7ad97"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "inquiries"`);
    await queryRunner.query(`DROP TABLE "property_images"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_089e10e6f1282e7b4bd0c58263"`,
    );
    await queryRunner.query(`DROP TABLE "properties"`);
    await queryRunner.query(`DROP TYPE "public"."properties_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."properties_listing_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "property_types"`);
  }
}
