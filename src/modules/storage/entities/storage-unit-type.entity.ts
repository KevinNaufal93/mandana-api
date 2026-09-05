import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

/** A storage size class (e.g. "Small", "Medium") — direct analogue of TruckClass. */
@Entity('storage_unit_types')
export class StorageUnitType extends BaseEntity {
  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // numeric — comes back from `pg` as a string at runtime despite the
  // `number` type below (same quirk as TruckClass.volumeM3); the mapper's
  // toNumber() coerces it before it reaches the response.
  @Column({
    name: 'volume_m3',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  volumeM3!: number | null;

  @Column({ name: 'length_cm', type: 'int', nullable: true })
  lengthCm!: number | null;

  @Column({ name: 'width_cm', type: 'int', nullable: true })
  widthCm!: number | null;

  @Column({ name: 'height_cm', type: 'int', nullable: true })
  heightCm!: number | null;

  // Rupiah as integer — sidesteps the `numeric` → string leak seen on
  // Property.price (see property.mapper.ts). Rupiah has no sub-unit.
  @Column({ name: 'monthly_rate', type: 'int' })
  monthlyRate!: number;

  @Column({ name: 'min_duration_months', type: 'int', default: 1 })
  minDurationMonths!: number;

  // Rupiah, integer — independent of monthlyRate, never derived from it (a
  // short stay costs more per unit of time to service than a month
  // amortizes to). Null means this unit type is not sold weekly regardless
  // of supportsWeekly.
  @Column({ name: 'weekly_rate', type: 'int', nullable: true })
  weeklyRate!: number | null;

  @Column({ name: 'supports_weekly', default: false })
  supportsWeekly!: boolean;

  // Smallest billable weekly duration; null falls back to 1 week.
  @Column({ name: 'min_duration_weeks', type: 'int', nullable: true })
  minDurationWeeks!: number | null;

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
