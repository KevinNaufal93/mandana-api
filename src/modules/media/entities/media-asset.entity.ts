import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type VariantMap = {
  [format: string]: { [width: number]: string };
};

@Entity('media_assets')
export class MediaAsset extends BaseEntity {
  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'jsonb', default: {} })
  variants!: VariantMap;

  @Column({ name: 'mime_type', length: 100 })
  mimeType!: string;

  @Column({ type: 'int' })
  width!: number;

  @Column({ type: 'int' })
  height!: number;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  alt!: string | null;
}
