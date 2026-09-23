import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds admin-configurable heading text to `page_images`, mirroring
 * `content_blocks.title`/`subtitle`/`image_only` — only `about_hero`
 * actually needs this (see `PageImageSlotMeta.supportsHeading` in
 * `page-image-slot.enum.ts`): its web component
 * (`components/about/about-hero.tsx`) has always rendered a hardcoded
 * headline + paragraph over the photo, with no way for an admin to
 * change the words or to suppress them for a banner-style upload that
 * already has its own text baked in — the exact problem `content_blocks`
 * hero slides solved with `imageOnly`.
 *
 * Generic columns on the whole table rather than an `about_hero`-only
 * side table, same reasoning as `mobile_media_asset_id`
 * (1790000000000-AddPageImageMobileImage): `page_images` already treats
 * "which optional features a slot has" as an application-level flag
 * (`PageImageSlotMeta`), not a DB-level distinction — `slot_key` is
 * `varchar`, not an enum, specifically so a slot's capabilities don't
 * need a schema change to adjust (see that enum's own doc comment).
 *
 * `image_only` defaults to `false` and `heading`/`subtitle` default to
 * `NULL` (meaning "use the web component's own hardcoded fallback copy")
 * so every existing row keeps rendering exactly as it does today —
 * additive and backfill-free.
 */
export class AddPageImageHeadingText1790100000000 implements MigrationInterface {
  name = 'AddPageImageHeadingText1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "page_images"
        ADD COLUMN "heading" varchar(255),
        ADD COLUMN "subtitle" varchar(500),
        ADD COLUMN "image_only" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "page_images"
        DROP COLUMN "heading",
        DROP COLUMN "subtitle",
        DROP COLUMN "image_only"
    `);
  }
}
