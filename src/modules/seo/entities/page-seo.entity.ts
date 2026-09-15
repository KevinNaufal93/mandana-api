import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';
import { SeoPageKey } from '../enums/seo-page-key.enum';

/**
 * One row per fixed page in SEO_PAGES (seo-page-key.enum.ts) — the admin
 * SEO section's "SEO Halaman" tab. `pageKey` is `varchar`, not a Postgres
 * enum, for the same reason RoleModulePermission.module is: adding a page
 * later must not need an `ALTER TYPE` migration, only a new SEO_PAGES
 * entry plus a seed row.
 */
@Entity('page_seo')
@Unique('UQ_page_seo_page_key', ['pageKey'])
export class PageSeo extends BaseEntity {
  @Column({ name: 'page_key', type: 'varchar', length: 32 })
  pageKey!: SeoPageKey;

  /** null = the web app's own hardcoded default (see lib/seo.ts's
   *  buildPageMetadata() on the web side). */
  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({
    name: 'meta_description',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  metaDescription!: string | null;

  /** Only meaningful for `home` — the hidden <h1> the homepage renders
   *  behind its image-only hero (both live hero slides today have their
   *  headline baked into the artwork, so this is the only H1 Google
   *  actually sees — see the SEO plan, §1 #2). Ignored client-side for
   *  every other page. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  heading!: string | null;

  /** SeoService rejects `true` for `home` — see SEO_PAGES' `canHide`. */
  @Column({ name: 'no_index', default: false })
  noIndex!: boolean;

  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'og_media_asset_id' })
  ogMediaAsset!: MediaAsset | null;

  @Column({ name: 'og_media_asset_id', nullable: true, type: 'uuid' })
  ogMediaAssetId!: string | null;
}
