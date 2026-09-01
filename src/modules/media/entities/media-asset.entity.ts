import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaPurpose } from '../enums/media-purpose.enum';

export type VariantMap = {
  [format: string]: { [width: number]: string };
};

@Entity('media_assets')
@Index('idx_media_assets_purpose_created', ['purpose', 'createdAt'])
export class MediaAsset extends BaseEntity {
  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  /** As-uploaded source object (`media/<id>/original.<ext>`), never linked
   * from any API response — see MediaService.upload(). Kept so variants
   * can be regenerated later without a re-upload. Null for rows created
   * before this column existed. */
  @Column({ name: 'original_key', type: 'text', nullable: true })
  originalKey!: string | null;

  @Column({ type: 'jsonb', default: {} })
  variants!: VariantMap;

  @Column({ name: 'mime_type', length: 100 })
  mimeType!: string;

  @Column({ type: 'enum', enum: MediaPurpose, default: MediaPurpose.COVER })
  purpose!: MediaPurpose;

  @Column({ type: 'int' })
  width!: number;

  @Column({ type: 'int' })
  height!: number;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  alt!: string | null;

  /** ~20px-wide WebP as a `data:` URI (~300-600 bytes), inlined into
   * MediaImageDto so the FE can paint a blurred placeholder instantly
   * from JSON it already has, before the real image downloads. Null for
   * rows uploaded before this existed — see
   * MediaService.backfillPlaceholders(). */
  @Column({ type: 'text', nullable: true })
  placeholder!: string | null;
}
