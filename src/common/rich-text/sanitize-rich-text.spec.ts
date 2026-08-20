import { richTextToPlain, sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  it('strips <script> tags entirely', () => {
    expect(sanitizeRichText('<p>hi</p><script>alert(1)</script>')).toBe(
      '<p>hi</p>',
    );
  });

  it('strips dangerous attributes like onerror', () => {
    expect(
      sanitizeRichText('<img src="https://x.test/a.png" onerror="alert(1)">'),
    ).toBe('<img src="https://x.test/a.png" />');
  });

  it('neutralizes javascript: links', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('rejects data: URIs on images', () => {
    const out = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA" alt="x">',
    );
    expect(out).not.toContain('data:');
  });

  it('preserves allowed tags and styles', () => {
    const out = sanitizeRichText(
      '<p style="text-align: center;">Rumah <strong>modern</strong></p>',
    );
    expect(out).toContain('<strong>modern</strong>');
    expect(out).toContain('text-align:center');
  });

  it('collapses an empty paragraph to an empty string', () => {
    expect(sanitizeRichText('<p><br></p>')).toBe('');
  });

  it('forces safe rel/target on links', () => {
    const out = sanitizeRichText('<a href="https://example.com">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('richTextToPlain', () => {
  it('returns null for empty input', () => {
    expect(richTextToPlain(null)).toBeNull();
    expect(richTextToPlain('')).toBeNull();
  });

  it('inserts a space at block boundaries instead of welding words', () => {
    expect(richTextToPlain('<p>a</p><p>b</p>')).toBe('a b');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(richTextToPlain('<p>Tom &amp;   Jerry</p>')).toBe('Tom & Jerry');
  });

  it('strips all markup', () => {
    expect(richTextToPlain('<ul><li>3 kamar tidur</li></ul>')).toBe(
      '3 kamar tidur',
    );
  });
});
