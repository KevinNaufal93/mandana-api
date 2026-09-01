import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `image_only` to `content_blocks`: a service card whose artwork
 * already has its headline/copy baked in can be flagged so the public site
 * skips rendering the title/subtitle text overlay and shows only the
 * image. See ContentBlock.imageOnly's doc comment.
 *
 * Modeled directly on `chk_content_blocks_hero_requires_media` from
 * AddContentBlocks1787500000000: an image-only block with no
 * `media_asset_id` would render as nothing, so the same CHECK-constraint
 * belt-and-suspenders applies here, alongside the DTO's `@ValidateIf` and
 * the service-layer check in ContentBlocksService.create()/update().
 */
export class AddContentBlockImageOnly1787500100000
  implements MigrationInterface
{
  name = 'AddContentBlockImageOnly1787500100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks" ADD COLUMN "image_only" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "content_blocks"
        ADD CONSTRAINT "chk_content_blocks_image_only_requires_media"
        CHECK (NOT "image_only" OR "media_asset_id" IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "content_blocks" DROP CONSTRAINT "chk_content_blocks_image_only_requires_media"
    `);
    await queryRunner.query(`
      ALTER TABLE "content_blocks" DROP COLUMN "image_only"
    `);
  }
}
