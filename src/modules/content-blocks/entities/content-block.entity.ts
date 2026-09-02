import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { ContentBlockType } from '../enums/content-block-type.enum';

/**
 * Unified table for hero slides and service-strip cards (and any future
 * "simple ordered, admin-editable, optionally-imaged" homepage section).
 * See ContentBlockType for the "why one table" rationale.
 *
 * Field naming favors the shared ROLE over either type's original name:
 * `subtitle` covers both a hero slide's secondary line and a service
 * card's description; `link` covers both a hero's CTA target and a
 * card's href. Only `ctaText` (the hero CTA button's label) has no
 * equivalent in the other type — everything else is genuinely shared.
 *
 * `mediaAssetId` is nullable at the column level (a service card is valid
 * with no icon yet — see the seeded rows) but required for `type: hero`
 * via the DB CHECK constraint `chk_content_blocks_hero_requires_media` in
 * the owning migration. No trigger is needed to also cover
 * `media_assets`' `ON DELETE SET NULL`: Postgres re-validates a table's
 * CHECK constraints on every UPDATE, and a referential action is
 * implemented internally as an ordinary UPDATE, so the CHECK alone blocks
 * both a direct `UPDATE ... SET media_asset_id = NULL` on a hero row *and*
 * deleting a media asset a hero block still references — reproducing, and
 * for the direct-UPDATE path improving on, the guarantee
 * `hero_slides.media_asset_id` used to get from being NOT NULL +
 * `ON DELETE RESTRICT` on its own dedicated column. Verified live against
 * both paths — see the migration's docblock.
 */
@Entity('content_blocks')
@Index('idx_content_blocks_type_active_sort', ['type', 'isActive', 'sortOrder'])
export class ContentBlock extends BaseEntity {
  @Column({ type: 'enum', enum: ContentBlockType })
  type!: ContentBlockType;

  @ManyToOne(() => MediaAsset, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true })
  mediaAssetId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  /** Hero's secondary line under the title, or a service card's
   * description — same visual role in both. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle!: string | null;

  /** Hero-only: the CTA button's label. Unused (and ignored by the FE)
   * for any other type — the one field that didn't unify. */
  @Column({ name: 'cta_text', type: 'varchar', length: 100, nullable: true })
  ctaText!: string | null;

  /** Hero's CTA target, or a service card's href — same role. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  link!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** Hero or service card: when true, the public site renders just the
   *  image — no title/subtitle text overlay — because the artwork already
   *  has that copy baked in. Enforced (alongside `mediaAssetId`) by the DB
   *  CHECK constraint `chk_content_blocks_image_only_requires_media` in the
   *  owning migration: an image-only block with no image would render as
   *  nothing at all. For a hero row this is redundant with
   *  `chk_content_blocks_hero_requires_media` (a hero always has
   *  `mediaAssetId` set), but keeping the check type-agnostic avoids two
   *  near-identical constraints. */
  @Column({ name: 'image_only', default: false })
  imageOnly!: boolean;
}
