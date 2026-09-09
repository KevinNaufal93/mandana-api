import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ArticleStatus } from '../enums/article-status.enum';
import { ArticleCategory } from './article-category.entity';
import { User } from '../../users/entities/user.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

@Entity('articles')
export class Article extends BaseEntity {
  @Index({ unique: true })
  @Column({ unique: true, length: 255 })
  slug!: string;

  @Column({ length: 255 })
  title!: string;

  /** Admin-authored plain text, NOT auto-truncated from the body — see
   *  ArticleCardDto.excerpt in the contract doc. Up to ~160 chars is the
   *  UI convention, not a hard DB constraint. */
  @Column({ length: 300 })
  excerpt!: string;

  /** Sanitized HTML — see @RichText({ required: true }) on the DTO field
   *  that writes this. */
  @Column({ type: 'text' })
  bodyHtml!: string;

  /** Plain-text derivative of bodyHtml, kept in sync on every write — same
   *  reasoning as Property.descriptionText: backs full-text search (if/when
   *  added) and is reading-time's actual word-count source (see
   *  reading-time.ts), not a word count over raw HTML which would
   *  over-count markup tokens. richTextToPlain() can return null; every
   *  write coalesces that to '' since this column is NOT NULL. */
  @Column({ name: 'body_text', type: 'text' })
  bodyText!: string;

  @Column({
    type: 'enum',
    enum: ArticleStatus,
    default: ArticleStatus.DRAFT,
  })
  status!: ArticleStatus;

  @Column({ name: 'reading_minutes', type: 'int', default: 1 })
  readingMinutes!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  /** Set only when a PUBLISHED article is edited afterward — see
   *  ArticlesService.update(). Backs ArticleDetailDto.updatedAt, which
   *  can't be `BaseEntity.updatedAt` (always populated, equal to
   *  createdAt on insert, and bumped by the publish write itself — no
   *  timestamp comparison could distinguish "published" from "edited
   *  after publishing"). */
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({
    name: 'meta_description',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  metaDescription!: string | null;

  @ManyToOne(() => ArticleCategory, (c) => c.articles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category!: ArticleCategory;

  @Column({ name: 'category_id' })
  categoryId!: string;

  /** Reuses the existing User entity. `name`/`title` map straight onto
   *  ArticleAuthorDto.name/role; `photoMediaAsset` onto `.avatar`. Any
   *  active user can author an article; nothing here restricts it to a
   *  particular UserRole. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author!: User | null;

  @Column({ name: 'author_id', nullable: true, type: 'uuid' })
  authorId!: string | null;

  /** Uses MediaPurpose.HERO (768/1280/1920 + AVIF) — see media.service.ts —
   *  not a dedicated ARTICLE_COVER purpose; HERO already exceeds what a
   *  full-width featured-article slot needs, with zero new backend code. */
  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cover_media_asset_id' })
  coverMediaAsset!: MediaAsset | null;

  @Column({ name: 'cover_media_asset_id', nullable: true, type: 'uuid' })
  coverMediaAssetId!: string | null;
}
