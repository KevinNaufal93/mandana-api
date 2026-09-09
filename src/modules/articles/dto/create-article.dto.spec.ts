import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateArticleDto } from './create-article.dto';

function build(overrides: Record<string, unknown> = {}): CreateArticleDto {
  return plainToInstance(CreateArticleDto, {
    title: 'Panduan Membeli Rumah Pertama',
    excerpt: 'Semua yang perlu Anda tahu sebelum membeli rumah pertama.',
    bodyHtml: '<p>Isi artikel.</p>',
    categoryId: '123e4567-e89b-12d3-a456-426614174000',
    ...overrides,
  });
}

describe('CreateArticleDto — bodyHtml validation', () => {
  it('accepts a well-formed body', async () => {
    const errors = await validate(build());
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(false);
  });

  it('rejects an omitted bodyHtml — unlike every other @RichText() field, this one is required', async () => {
    const dto = build();
    delete (dto as { bodyHtml?: string }).bodyHtml;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(true);
  });

  it('rejects a body that sanitizes down to nothing (a <script>-only payload)', async () => {
    const errors = await validate(
      build({ bodyHtml: '<script>alert(1)</script>' }),
    );
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(true);
  });

  it('rejects an empty-string body', async () => {
    const errors = await validate(build({ bodyHtml: '' }));
    expect(errors.some((e) => e.property === 'bodyHtml')).toBe(true);
  });
});

describe('CreateArticleDto — other required fields', () => {
  it('rejects a missing categoryId', async () => {
    const dto = build();
    delete (dto as { categoryId?: string }).categoryId;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'categoryId')).toBe(true);
  });

  it('accepts an omitted slug/status/authorId/coverMediaAssetId', async () => {
    const errors = await validate(build());
    expect(errors).toHaveLength(0);
  });
});
