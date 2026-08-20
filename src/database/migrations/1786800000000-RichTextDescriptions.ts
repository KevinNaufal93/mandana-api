import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Switches admin-authored `description` columns from plain text to
 * sanitized rich-text HTML (see `src/common/rich-text`).
 *
 * `properties` gets a companion `description_text` column: the FTS index
 * built by `AddPropertySearchIndex1786320000000` reads `description`
 * directly, and indexing raw HTML would surface markup tokens ("strong",
 * "li") as searchable words instead of the text they wrap. Every other
 * table with a `description` column has no such index, so a derived column
 * isn't needed there — plain text is produced on read instead.
 */
export class RichTextDescriptions1786800000000 implements MigrationInterface {
  name = 'RichTextDescriptions1786800000000';

  private readonly plainTextTables = [
    'collections',
    'truck_classes',
    'storage_facilities',
    'storage_unit_types',
  ];

  /**
   * Wraps existing plain-text `description` values as HTML in place:
   * escapes `&`, `<`, `>`, splits on blank lines into `<p>` blocks, and
   * turns single newlines into `<br>`. Guarded so it only touches rows that
   * don't already look like HTML (defensive — nothing should, pre-migration).
   */
  private wrapPlainTextAsHtml(table: string): string {
    return `
      UPDATE "${table}"
      SET "description" =
        '<p>' || replace(
          regexp_replace(
            replace(replace(replace(trim("description"),
              '&', '&amp;'),
              '<', '&lt;'),
              '>', '&gt;'),
            E'\\n{2,}', E'</p><p>', 'g'
          ),
          E'\\n', '<br>'
        ) || '</p>'
      WHERE "description" IS NOT NULL
        AND trim("description") <> ''
        AND "description" NOT LIKE '<%'
    `;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. properties.description_text — backfill from the current plain-text
    //    description before it gets rewritten to HTML below.
    await queryRunner.query(
      `ALTER TABLE "properties" ADD COLUMN "description_text" text`,
    );
    await queryRunner.query(
      `UPDATE "properties" SET "description_text" = "description"`,
    );

    // 2. Convert existing plain-text descriptions to HTML across every
    //    admin-authored description column.
    await queryRunner.query(this.wrapPlainTextAsHtml('properties'));
    for (const table of this.plainTextTables) {
      await queryRunner.query(this.wrapPlainTextAsHtml(table));
    }

    // 3. Repoint the FTS index at description_text instead of description.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_properties_fts"`);
    await queryRunner.query(`
      CREATE INDEX "idx_properties_fts" ON "properties"
      USING GIN (
        to_tsvector(
          'simple',
          COALESCE(title, '') || ' ' ||
          COALESCE(city, '') || ' ' ||
          COALESCE(province, '') || ' ' ||
          COALESCE(area, '') || ' ' ||
          COALESCE(address, '') || ' ' ||
          COALESCE(description_text, '')
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the original index definition first (over `description`)...
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_properties_fts"`);
    await queryRunner.query(`
      CREATE INDEX "idx_properties_fts" ON "properties"
      USING GIN (
        to_tsvector(
          'simple',
          COALESCE(title, '') || ' ' ||
          COALESCE(city, '') || ' ' ||
          COALESCE(province, '') || ' ' ||
          COALESCE(area, '') || ' ' ||
          COALESCE(address, '') || ' ' ||
          COALESCE(description, '')
        )
      )
    `);

    // ...then restore properties.description from the untouched plain-text
    // column, and drop it. Other tables' HTML-wrapped descriptions are left
    // as-is: unwrapping `<p>`/`<br>` back to bare newlines isn't a clean
    // inverse (ambiguous around nested/adjacent tags), and those tables have
    // no derived column to fall back on.
    await queryRunner.query(
      `UPDATE "properties" SET "description" = "description_text"`,
    );
    await queryRunner.query(
      `ALTER TABLE "properties" DROP COLUMN "description_text"`,
    );
  }
}
