import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs the admin SEO section (see the web repo's SEO plan, §4): a
 * `seo_settings` singleton (business details for JSON-LD, social links,
 * default share image, search-engine verification codes — same
 * `singleton` + UNIQUE + CHECK shape as `moving_settings`) and one
 * `page_seo` row per fixed page (title/description/share-image/noindex
 * override for the pages the admin can edit).
 *
 * `page_seo` is seeded with TODAY'S EXACT hardcoded title/description
 * from the web repo's page files, so deploying this migration changes
 * nothing visible — the web app's buildPageMetadata() (added alongside
 * this, on the web side) only overrides its own hardcoded default when a
 * row's field is non-null, and every seeded value here is byte-identical
 * to that hardcoded default. `home`'s `heading` is seeded the same way,
 * matching hero.tsx's FALLBACK_HOMEPAGE_H1 constant — the hidden <h1> the
 * homepage renders behind its image-only hero.
 *
 * Also adds `meta_title`/`meta_description` (nullable, same sizes as
 * `articles`' matching columns) to `properties` — the per-property SEO
 * override the property forms will offer, same convention Article already
 * has.
 */
export class AddSeo1789400000000 implements MigrationInterface {
  name = 'AddSeo1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "seo_settings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "singleton" boolean NOT NULL DEFAULT true,
        "organization_name" character varying(255) NOT NULL DEFAULT 'Mandana Property',
        "contact_phone" character varying(32),
        "contact_email" character varying(255),
        "street_address" character varying(255),
        "address_locality" character varying(100),
        "address_region" character varying(100),
        "postal_code" character varying(20),
        "social_links" jsonb NOT NULL DEFAULT '{}',
        "google_site_verification" character varying(255),
        "bing_site_verification" character varying(255),
        "default_og_media_asset_id" uuid,
        CONSTRAINT "UQ_seo_settings_singleton" UNIQUE ("singleton"),
        CONSTRAINT "chk_seo_settings_singleton_true" CHECK ("singleton" = true),
        CONSTRAINT "fk_seo_settings_default_og_media_asset"
          FOREIGN KEY ("default_og_media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "page_seo" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "page_key" character varying(32) NOT NULL,
        "meta_title" character varying(255),
        "meta_description" character varying(300),
        "heading" character varying(255),
        "no_index" boolean NOT NULL DEFAULT false,
        "og_media_asset_id" uuid,
        CONSTRAINT "UQ_page_seo_page_key" UNIQUE ("page_key"),
        CONSTRAINT "fk_page_seo_og_media_asset"
          FOREIGN KEY ("og_media_asset_id") REFERENCES "media_assets" ("id") ON DELETE SET NULL
      )
    `);

    // One settings row — SeoService.getSettings() would auto-seed this
    // anyway on first read, but seeding it here means GET /admin/seo/settings
    // never needs that lazy-create round trip on this deploy's first request.
    await queryRunner.query(`
      INSERT INTO "seo_settings" ("singleton") VALUES (true)
    `);

    // Seeded with today's exact copy — see this file's own doc comment.
    await queryRunner.query(`
      INSERT INTO "page_seo" ("page_key", "meta_title", "meta_description", "heading")
      VALUES
        (
          'home',
          'Mandana Property — Temukan Rumah Impianmu',
          'Beli, sewa, atau temukan properti terbaik yang sesuai dengan gaya hidupmu bersama Mandana Property.',
          'Mandana Property — Cari, Sewa, Pindah, dan Kelola Propertimu dengan Mudah'
        ),
        (
          'properties',
          'Semua Property',
          'Jelajahi pilihan properti untuk dibeli atau disewa yang sesuai dengan kebutuhanmu di Mandana Property.',
          NULL
        ),
        (
          'about',
          'Tentang Kami',
          'Mandana Property menghubungkan pencarian hunian dengan layanan pindahan, penyimpanan, dan acara — semuanya dalam satu platform.',
          NULL
        ),
        (
          'moving',
          'Mandana Move',
          'Pindahan aman, cepat, dan terpercaya. Pilih truk sesuai kebutuhanmu, tentukan lokasi jemput dan tujuan, lalu dapatkan estimasi biaya langsung dari Mandana.',
          NULL
        ),
        (
          'storage',
          'Smart Storage',
          'Simpan barang yang berarti tanpa memenuhi ruang di rumah. Temukan lokasi, buat appointment, dan pindah masuk unit Mandana Smart Storage dengan mudah dan aman.',
          NULL
        ),
        (
          'storage_booking',
          'Booking Smart Storage',
          'Pilih lokasi dan ukuran unit Smart Storage, lihat ketersediaan secara langsung, dan kirim permintaan booking dalam hitungan menit.',
          NULL
        ),
        (
          'event',
          'Event Support',
          'Mulai dari perayaan kecil hingga acara berskala besar, Mandana siap membantu mengelola berbagai kebutuhan event Anda dengan solusi yang praktis dan profesional.',
          NULL
        ),
        (
          'articles',
          'Artikel',
          'Tips, panduan, dan berita seputar properti, KPR, dan investasi rumah — ditulis oleh tim Mandana Property.',
          NULL
        )
      ON CONFLICT ON CONSTRAINT "UQ_page_seo_page_key" DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "properties" ADD COLUMN "meta_title" character varying(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" ADD COLUMN "meta_description" character varying(300)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN "meta_description"
    `);
    await queryRunner.query(`
      ALTER TABLE "properties" DROP COLUMN "meta_title"
    `);
    await queryRunner.query(`DROP TABLE "page_seo"`);
    await queryRunner.query(`DROP TABLE "seo_settings"`);
  }
}
