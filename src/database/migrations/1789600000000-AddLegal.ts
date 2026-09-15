import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs the admin SEO section's third tab (see the web repo's SEO plan,
 * §11.5): a `legal_pages` table with one row per LegalPageKey (privacy,
 * terms), editable through the same rich-text editor articles and
 * facility descriptions already use.
 *
 * Seeds both rows with a SECTION SKELETON, not real legal text — real
 * headings with bracketed "fill this in" placeholders under each. This
 * migration deliberately invents no legal commitments; the placeholder
 * copy exists so the pages aren't blank on first deploy, and so an admin
 * editing them sees a structure to follow rather than an empty box. The
 * wording an admin replaces it with should still be checked by someone
 * qualified before going live — see the SEO plan, §11.5.
 */
export class AddLegal1789600000000 implements MigrationInterface {
  name = 'AddLegal1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "legal_pages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "page_key" character varying(32) NOT NULL,
        "title" character varying(255) NOT NULL,
        "body_html" text NOT NULL,
        "body_text" text NOT NULL,
        CONSTRAINT "UQ_legal_pages_page_key" UNIQUE ("page_key")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "legal_pages" ("page_key", "title", "body_html", "body_text")
      VALUES
        (
          'privacy',
          'Kebijakan Privasi',
          $privacy$<p>Kebijakan Privasi ini menjelaskan bagaimana Mandana Property mengumpulkan, menggunakan, dan melindungi informasi Anda. <em>[Draf awal — lengkapi dan tinjau sebelum dipublikasikan.]</em></p><h2>Informasi yang Kami Kumpulkan</h2><p>[Isi bagian ini — contoh: nama, nomor telepon, email, alamat properti yang diminati.]</p><h2>Bagaimana Kami Menggunakan Informasi Anda</h2><p>[Isi bagian ini.]</p><h2>Berbagi Informasi</h2><p>[Isi bagian ini — apakah data dibagikan ke pihak ketiga, dan dalam kondisi apa.]</p><h2>Keamanan Data</h2><p>[Isi bagian ini.]</p><h2>Hak Anda</h2><p>[Isi bagian ini — hak akses, koreksi, dan penghapusan data sesuai UU PDP.]</p><h2>Cookie</h2><p>[Isi bagian ini, jika situs menggunakan cookie atau alat analitik.]</p><h2>Perubahan Kebijakan</h2><p>[Isi bagian ini.]</p><h2>Kontak</h2><p>[Isi bagian ini — cara menghubungi Mandana Property terkait privasi data.]</p>$privacy$,
          $privacy_text$Kebijakan Privasi ini menjelaskan bagaimana Mandana Property mengumpulkan, menggunakan, dan melindungi informasi Anda. [Draf awal — lengkapi dan tinjau sebelum dipublikasikan.]

Informasi yang Kami Kumpulkan
[Isi bagian ini — contoh: nama, nomor telepon, email, alamat properti yang diminati.]

Bagaimana Kami Menggunakan Informasi Anda
[Isi bagian ini.]

Berbagi Informasi
[Isi bagian ini — apakah data dibagikan ke pihak ketiga, dan dalam kondisi apa.]

Keamanan Data
[Isi bagian ini.]

Hak Anda
[Isi bagian ini — hak akses, koreksi, dan penghapusan data sesuai UU PDP.]

Cookie
[Isi bagian ini, jika situs menggunakan cookie atau alat analitik.]

Perubahan Kebijakan
[Isi bagian ini.]

Kontak
[Isi bagian ini — cara menghubungi Mandana Property terkait privasi data.]$privacy_text$
        ),
        (
          'terms',
          'Syarat & Ketentuan',
          $terms$<p>Syarat &amp; Ketentuan ini mengatur penggunaan layanan Mandana Property. <em>[Draf awal — lengkapi dan tinjau sebelum dipublikasikan.]</em></p><h2>Penerimaan Syarat</h2><p>[Isi bagian ini.]</p><h2>Layanan yang Disediakan</h2><p>[Isi bagian ini — properti, pindahan, storage, dan event.]</p><h2>Kewajiban Pengguna</h2><p>[Isi bagian ini.]</p><h2>Pembayaran &amp; Pembatalan</h2><p>[Isi bagian ini.]</p><h2>Batasan Tanggung Jawab</h2><p>[Isi bagian ini.]</p><h2>Perubahan Ketentuan</h2><p>[Isi bagian ini.]</p><h2>Hukum yang Berlaku</h2><p>[Isi bagian ini.]</p><h2>Kontak</h2><p>[Isi bagian ini.]</p>$terms$,
          $terms_text$Syarat & Ketentuan ini mengatur penggunaan layanan Mandana Property. [Draf awal — lengkapi dan tinjau sebelum dipublikasikan.]

Penerimaan Syarat
[Isi bagian ini.]

Layanan yang Disediakan
[Isi bagian ini — properti, pindahan, storage, dan event.]

Kewajiban Pengguna
[Isi bagian ini.]

Pembayaran & Pembatalan
[Isi bagian ini.]

Batasan Tanggung Jawab
[Isi bagian ini.]

Perubahan Ketentuan
[Isi bagian ini.]

Hukum yang Berlaku
[Isi bagian ini.]

Kontak
[Isi bagian ini.]$terms_text$
        )
      ON CONFLICT ON CONSTRAINT "UQ_legal_pages_page_key" DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "legal_pages"`);
  }
}
