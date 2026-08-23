import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

/** A rental category tab (Sound System, Stage Effect, AC & Cooling Fan,
 * Party Equipment, ...). Direct analogue of StorageUnitType/TruckClass —
 * `isActive` + `sortOrder` gate visibility and ordering; items carry the
 * draft/published/archived lifecycle, not categories. */
@Entity('event_categories')
export class EventCategory extends BaseEntity {
  @Column({ length: 120 })
  name!: string;

  @Column({ unique: true, length: 120 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => MediaAsset, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true })
  mediaAssetId!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;
}
