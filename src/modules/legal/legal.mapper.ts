import { Injectable } from '@nestjs/common';
import { LegalPage } from './entities/legal-page.entity';

export type LegalPagePayload = {
  pageKey: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  updatedAt: string;
};

@Injectable()
export class LegalMapper {
  toPayload(page: LegalPage): LegalPagePayload {
    return {
      pageKey: page.pageKey,
      title: page.title,
      bodyHtml: page.bodyHtml,
      bodyText: page.bodyText,
      updatedAt: page.updatedAt.toISOString(),
    };
  }
}
