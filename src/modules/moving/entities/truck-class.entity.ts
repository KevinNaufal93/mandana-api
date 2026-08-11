import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

@Entity('truck_classes')
export class TruckClass extends BaseEntity {
  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 100 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'capacity_kg', type: 'int', nullable: true })
  capacityKg!: number | null;

  // numeric — comes back from `pg` as a string at runtime despite the `number`
  // type below (same quirk as Property.price/areaSqm); the mapper's
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

  @Column({ name: 'helper_count', type: 'int', nullable: true })
  helperCount!: number | null;

  // Rupiah as integer — sidesteps the `numeric` → string leak seen on
  // `Property.price` (see property.mapper.ts). Rupiah has no sub-unit.
  @Column({ name: 'base_fare', type: 'int' })
  baseFare!: number;

  @Column({ name: 'per_km_fare', type: 'int' })
  perKmFare!: number;

  @Column({ name: 'included_km', type: 'int', nullable: true })
  includedKm!: number | null;

  @Column({ name: 'min_fare', type: 'int', nullable: true })
  minFare!: number | null;

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
