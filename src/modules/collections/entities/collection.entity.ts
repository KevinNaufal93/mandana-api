import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { CollectionProperty } from './collection-property.entity';

@Entity('collections')
export class Collection extends BaseEntity {
  @Column({ unique: true, length: 255 })
  slug!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_asset_id' })
  coverMediaAsset!: MediaAsset | null;

  @Column({ name: 'cover_media_asset_id', nullable: true })
  coverMediaAssetId!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'show_on_homepage', default: false })
  showOnHomepage!: boolean;

  @OneToMany(() => CollectionProperty, (cp) => cp.collection, { cascade: true })
  collectionProperties!: CollectionProperty[];
}
