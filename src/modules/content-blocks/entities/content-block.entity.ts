import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { ContentBlockType } from '../enums/content-block-type.enum';
import { ListingType } from '../../properties/enums/listing-type.enum';

/**
 * Unified table for hero slides, service-strip cards, and property detail
 * promo cards (and any future "simple ordered, admin-editable,
 * optionally-imaged" section). See ContentBlockType for the "why one
 * table" rationale.
 *
 * Field naming favors the shared ROLE over any one type's original name:
 * `subtitle` covers a hero slide's secondary line, a service card's
 * description, and a promo card's body copy; `link` covers a hero's CTA
 * target, a card's href, and a promo card's CTA target. Only `ctaText`
 * (the hero CTA button's label, also used by promo cards) has no
 * equivalent for `service_card` — everything else is genuinely shared.
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

  /** Hero's secondary line under the title, a service card's description,
   * or a promo card's body copy — same visual role in all three. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle!: string | null;

  /** Hero or promo-card CTA button label. Unused (and ignored by the FE)
   * for `service_card`. */
  @Column({ name: 'cta_text', type: 'varchar', length: 100, nullable: true })
  ctaText!: string | null;

  /** Hero's CTA target, a service card's href, or a promo card's CTA
   * target — same role. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  link!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** Hero, service card, or promo card: when true, the public site renders
   *  just the image — no title/subtitle text overlay — because the artwork
   *  already has that copy baked in. Enforced (alongside `mediaAssetId`) by
   *  the DB CHECK constraint `chk_content_blocks_image_only_requires_media`
   *  in the owning migration: an image-only block with no image would
   *  render as nothing at all. For a hero row this is redundant with
   *  `chk_content_blocks_hero_requires_media` (a hero always has
   *  `mediaAssetId` set), but keeping the check type-agnostic avoids two
   *  near-identical constraints. */
  @Column({ name: 'image_only', default: false })
  imageOnly!: boolean;

  /**
   * `property_promo` only: which listing types this card should appear on.
   * `NULL` (or, once `ContentBlocksService` normalizes it, an empty array)
   * means "every listing type" — the common case (a generic Mandana ad)
   * needs no admin interaction with this field at all. Enforced against
   * every other type by the DB CHECK `chk_content_blocks_scope_promo_only`
   * in the owning migration; `ContentBlocksService.create()`/`update()`
   * enforce the same rule with a friendlier message first.
   *
   * `enumName` is NOT optional here — TypeORM's default naming strategy
   * would otherwise derive a new, non-existent
   * `content_blocks_listing_type_scope_enum` from table+column. Naming
   * the existing `properties_listing_type_enum` explicitly reuses the
   * one definition of "sale/rent/new" schema-wide, so widening
   * `ListingType` (as `AddNewPropertyListingType` already did once) stays
   * a single migration that both tables pick up.
   */
  @Column({
    name: 'listing_type_scope',
    type: 'enum',
    enum: ListingType,
    enumName: 'properties_listing_type_enum',
    array: true,
    nullable: true,
  })
  listingTypeScope!: ListingType[] | null;
}
