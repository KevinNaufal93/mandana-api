import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

@Entity('hero_slides')
export class HeroSlide extends BaseEntity {
  @ManyToOne(() => MediaAsset, { nullable: false, eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'media_asset_id' })
  mediaAsset!: MediaAsset;

  @Column({ name: 'media_asset_id' })
  mediaAssetId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subtitle!: string | null;

  @Column({ name: 'cta_text', type: 'varchar', length: 100, nullable: true })
  ctaText!: string | null;

  @Column({ name: 'cta_link', type: 'varchar', length: 500, nullable: true })
  ctaLink!: string | null;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
