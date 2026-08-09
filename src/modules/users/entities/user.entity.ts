import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserRole } from '../enums/user-role.enum';
import { MediaAsset } from '../../media/entities/media-asset.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 255 })
  name!: string;

  @Exclude()
  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.EDITOR })
  role!: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Exclude()
  @Column({ name: 'hashed_refresh_token', nullable: true, type: 'text' })
  hashedRefreshToken!: string | null;

  // ─── Public agent-profile fields (shown on property detail pages) ─────────

  @Column({ type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  whatsapp!: string | null;

  @ManyToOne(() => MediaAsset, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'photo_media_asset_id' })
  photoMediaAsset!: MediaAsset | null;

  @Column({ name: 'photo_media_asset_id', nullable: true, type: 'uuid' })
  photoMediaAssetId!: string | null;
}
