import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an optional second image column to `page_images`, mirroring
 * `content_blocks.mobile_media_asset_id`
 * (1789200000000-AddContentBlockMobileImage): a separately composed crop
 * for viewports below ~1024px, left unset by default so the primary image
 * keeps rendering at every width until an admin uploads one.
 *
 * No CHECK-constraint restriction to specific slots, unlike the content-
 * blocks column (which is hero-only via `chk_content_blocks_mobile_media_hero_only`):
 * `page_images.slot_key` is `varchar`, not an enum (see
 * PageImageSlot's own doc comment on why), so a SQL CHECK would need a
 * literal slot-key list duplicating `PageImageSlotMeta.supportsMobileImage`
 * in `page-image-slot.enum.ts`. That application-level flag is the single
 * source of truth instead; `PageImagesService.updateSlot()` enforces it.
 *
 * Additive and backfill-free: every existing row already satisfies
 * `mobile_media_asset_id IS NULL` trivially.
 */
export class AddPageImageMobileImage1790000000000 implements MigrationInterface {
  name = 'AddPageImageMobileImage1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "page_images" ADD COLUMN "mobile_media_asset_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "page_images"
        ADD CONSTRAINT "fk_page_images_mobile_media_asset"
        FOREIGN KEY ("mobile_media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "page_images"
        DROP CONSTRAINT "fk_page_images_mobile_media_asset"
    `);
    await queryRunner.query(`
      ALTER TABLE "page_images" DROP COLUMN "mobile_media_asset_id"
    `);
  }
}
