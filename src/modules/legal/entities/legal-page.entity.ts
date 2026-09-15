import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { LegalPageKey } from '../enums/legal-page-key.enum';

/**
 * One row per fixed key in LEGAL_PAGES. `bodyText` is the plain-text
 * derivative of `bodyHtml` (tags stripped), kept in sync on every write —
 * same convention as Article.bodyText/Property.descriptionText — used for
 * this page's auto-generated meta description on the web side.
 */
@Entity('legal_pages')
@Unique('UQ_legal_pages_page_key', ['pageKey'])
export class LegalPage extends BaseEntity {
  @Column({ name: 'page_key', type: 'varchar', length: 32 })
  pageKey!: LegalPageKey;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'body_html', type: 'text' })
  bodyHtml!: string;

  @Column({ name: 'body_text', type: 'text' })
  bodyText!: string;
}
