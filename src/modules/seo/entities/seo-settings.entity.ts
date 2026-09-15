import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MediaAsset } from '../../media/entities/media-asset.entity';

/**
 * Singleton row holding sitewide SEO/business settings — business details
 * for JSON-LD (`Organization`), social profile links (also drives the
 * public footer's icons — see the web repo's site-footer-glass.tsx), the
 * default Open Graph share image, and search-engine verification codes.
 *
 * Copied from MovingSettings' shape: `singleton` + its UNIQUE constraint +
 * a DB-level CHECK (singleton = true) make a second row physically
 * impossible — see the migration.
 */
@Entity('seo_settings')
export class SeoSettings extends BaseEntity {
  @Column({ default: true })
  singleton!: boolean;

  @Column({
    name: 'organization_name',
    length: 255,
    default: 'Mandana Property',
  })
  organizationName!: string;

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  contactPhone!: string | null;

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  contactEmail!: string | null;

  @Column({
    name: 'street_address',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  streetAddress!: string | null;

  @Column({
    name: 'address_locality',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  addressLocality!: string | null;

  @Column({
    name: 'address_region',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  addressRegion!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  /**
   * Known keys the web client reads: instagram, tiktok, facebook, youtube,
   * x, linkedin. An absent/empty-string key means "no icon" — the footer
   * never falls back to a placeholder URL (that was the original bug this
   * module exists to fix; see the SEO plan, §1 #11). Any other key is
   * stored but ignored client-side, so adding a new platform later is a
   * frontend-only change.
   */
  @Column({ name: 'social_links', type: 'jsonb', default: () => "'{}'" })
  socialLinks!: Record<string, string>;

  @Column({
    name: 'google_site_verification',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  googleSiteVerification!: string | null;

  @Column({
    name: 'bing_site_verification',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  bingSiteVerification!: string | null;

  /** Sitewide fallback share image — used by any page that doesn't set
   *  its own (per-page `PageSeo.ogMediaAsset`, or a page's own hardcoded
   *  image, e.g. a property's cover photo). */
  @ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_og_media_asset_id' })
  defaultOgMediaAsset!: MediaAsset | null;

  @Column({ name: 'default_og_media_asset_id', nullable: true, type: 'uuid' })
  defaultOgMediaAssetId!: string | null;
}
