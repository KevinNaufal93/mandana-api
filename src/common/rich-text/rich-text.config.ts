import type { IOptions } from 'sanitize-html';

/** Hard caps enforced by `@RichText()` — keeps abusive payloads out of the DB. */
export const MAX_RICH_TEXT_HTML = 100_000;
export const MAX_RICH_TEXT_PLAIN = 20_000;

const HEX_OR_RGB_COLOR = [
  /^#[0-9a-f]{3,6}$/i,
  /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i,
];

/**
 * Allow-list tuned to what the admin's Quill toolbar emits. Anything not
 * listed here is stripped on write — see `sanitizeRichText`.
 *
 * Images: the editor's image button must upload through the existing
 * `POST /api/v1/admin/media` and insert the returned HTTPS URL. `data:` URIs
 * are deliberately not allowed — a base64 image would blow past
 * `MAX_RICH_TEXT_HTML` and defeats the point of storing images as media
 * assets in the first place.
 */
export const RICH_TEXT_SANITIZE_OPTIONS: IOptions = {
  allowedTags: [
    'p',
    'br',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'blockquote',
    'ol',
    'ul',
    'li',
    'a',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'img',
    'pre',
    'code',
    'hr',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    span: ['class', 'style'],
    p: ['class', 'style'],
    li: ['class', 'style'],
    blockquote: ['class', 'style'],
    h1: ['class', 'style'],
    h2: ['class', 'style'],
    h3: ['class', 'style'],
    h4: ['class', 'style'],
    h5: ['class', 'style'],
    h6: ['class', 'style'],
  },
  allowedClasses: {
    '*': [/^ql-/],
  },
  allowedStyles: {
    '*': {
      color: HEX_OR_RGB_COLOR,
      'background-color': HEX_OR_RGB_COLOR,
      'text-align': [/^left$/, /^center$/, /^right$/, /^justify$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    img: ['https'],
  },
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      },
    }),
  },
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};
