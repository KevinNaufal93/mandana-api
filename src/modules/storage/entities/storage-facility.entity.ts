import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

/**
 * A physical warehouse. Location fields mirror Property's denormalized
 * shape, but — unlike Property — coordinates are exact: these are
 * commercial addresses customers must be able to find, so
 * properties/location-privacy.ts fuzzing does not apply here.
 */
@Entity('storage_facilities')
export class StorageFacility extends BaseEntity {
  @Column({ length: 255 })
  name!: string;

  @Column({ unique: true, length: 255 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  area!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  province!: string | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 9, scale: 6, nullable: true })
  longitude!: number | null;

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

  // Grid-cell size (cm) for the floor-plan span math — kept per facility
  // rather than hardcoded so a facility with a different physical layout
  // later isn't a schema change.
  @Column({ name: 'layout_cell_cm', type: 'int', default: 50 })
  layoutCellCm!: number;

  // Bumped only when an admin edits unit positions (no such action exists
  // yet — positions stay null this phase, so this stays constant). The FE
  // memoizes its derived layout on this key so a status-only change never
  // triggers a re-layout of every tile.
  @Column({ name: 'layout_version', type: 'timestamp', default: () => 'now()' })
  layoutVersion!: Date;
}
