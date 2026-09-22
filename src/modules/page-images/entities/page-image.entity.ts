import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { PageImageSlot } from '../enums/page-image-slot.enum';

/**
 * One row per fixed slot in PAGE_IMAGE_SLOTS (page-image-slot.enum.ts) —
 * the admin Content Media section's "Tentang Kami" tab. `slotKey` is
 * varchar, not a Postgres enum — see that enum's own doc comment for why.
 *
 * `mediaAssetId` starts NULL for every seeded row — the public site falls
 * back to its own hardcoded static image whenever this is null, so
 * deploying the seeding migration changes nothing visible until an admin
 * uploads a replacement.
 */
@Entity('page_images')
@Unique('UQ_page_images_slot_key', ['slotKey'])
export class PageImage extends BaseEntity {
  @Column({ name: 'slot_key', type: 'varchar', length: 64 })
  slotKey!: PageImageSlot;

  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true, type: 'uuid' })
  mediaAssetId!: string | null;

  /** A separately composed crop for viewports below ~1024px — only
   *  meaningful when this slot's `PageImageSlotMeta.supportsMobileImage`
   *  is true (`page-image-slot.enum.ts`); `PageImagesService.updateSlot()`
   *  rejects setting it on any other slot. Left unset, the primary image
   *  above renders at every width, exactly as before this column existed.
   *  Mirrors `ContentBlock.mobileMediaAsset`. */
  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'mobile_media_asset_id' })
  mobileMediaAsset!: MediaAsset | null;

  @Column({ name: 'mobile_media_asset_id', nullable: true, type: 'uuid' })
  mobileMediaAssetId!: string | null;
}
