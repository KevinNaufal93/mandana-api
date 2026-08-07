import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Property } from './property.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

@Entity('property_images')
export class PropertyImage extends BaseEntity {
  @Column({ type: 'text', nullable: true })
  url!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  alt!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_cover', default: false })
  isCover!: boolean;

  @ManyToOne(() => Property, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property!: Property;

  @Column({ name: 'property_id' })
  propertyId!: string;

  @ManyToOne(() => MediaAsset, { nullable: true, eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset | null;

  @Column({ name: 'media_asset_id', nullable: true, type: 'uuid' })
  mediaAssetId!: string | null;
}
