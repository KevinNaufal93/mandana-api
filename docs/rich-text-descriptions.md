# Rich Text Descriptions

`description` on properties, collections, moving truck classes, and storage
facilities/unit types is admin-authored **sanitized HTML**, not plain text — the admin
CMS should use a WYSIWYG editor (e.g. [Quill](https://quilljs.com/)) and post whatever
HTML it produces. The API sanitizes on write; nothing else needs to sanitize on read.

Implementation lives in [`src/common/rich-text`](../src/common/rich-text/):

- `RICH_TEXT_SANITIZE_OPTIONS` ([rich-text.config.ts](../src/common/rich-text/rich-text.config.ts)) — the allow-list
- `sanitizeRichText()` / `richTextToPlain()` ([sanitize-rich-text.ts](../src/common/rich-text/sanitize-rich-text.ts)) — sanitize on write, derive plain text on read
- `@RichText()` ([rich-text.decorator.ts](../src/common/rich-text/rich-text.decorator.ts)) — the DTO decorator that wires both into the validation pipeline

## Allow-list

| Tags | `p br span strong b em i u s strike blockquote ol ul li a h1–h6 img pre code hr` |
| --- | --- |
| Attributes | `a`: `href title target rel`; `img`: `src alt width height`; block/inline tags: `class` (only `ql-*`), `style` |
| Styles | `color`, `background-color` (hex or `rgb()` only), `text-align` (`left\|center\|right\|justify`) |
| Link schemes | `http https mailto tel` |
| Image schemes | `https` only — **no `data:` URIs** |

`<script>`, `<style>`, `<textarea>`, `<option>`, `<noscript>` are dropped along with
their content — not just unwrapped. Every `<a>` gets `target="_blank"` and
`rel="noopener noreferrer nofollow"` forced onto it regardless of what was submitted.

**Images must go through the media pipeline.** The editor's image button should upload
via `POST /admin/media` and insert the returned HTTPS URL — never a base64 `data:` URI.
Two reasons: `data:` URIs are stripped by the sanitizer (so a pasted one silently
vanishes), and a multi-hundred-KB inline image would blow past the size limit below on
its own.

## Limits

- Raw HTML: 100,000 characters (`MAX_RICH_TEXT_HTML`)
- Visible text (tags stripped): 20,000 characters (`MAX_RICH_TEXT_PLAIN`) — enforced
  separately so markup overhead can't be used to smuggle an arbitrarily long description
  past the HTML limit

Both are enforced by `@RichText()` after sanitization, so they bound the *sanitized*
content, not whatever the client originally sent.

## Adding `@RichText()` to a new field

```ts
import { RichText } from '../../../common/rich-text';

export class CreateFooDto {
  @RichText()
  description?: string;
}
```

That's it — no `@ApiPropertyOptional`, `@IsString`, or `@MaxLength` needed alongside it,
`@RichText()` already includes them. It relies on the global
`ValidationPipe({ transform: true })` (see [`main.ts`](../src/main.ts)) running
class-transformer before class-validator, so by the time length checks run, the value
has already been sanitized.

If the entity needs a full-text-search index over the field (properties is the only one
today — see `idx_properties_fts`), add a derived plain-text column and keep it in sync in
the service's `create`/`update`, the way `properties.description_text` is; see
[`properties.service.ts`](../src/modules/properties/properties.service.ts). Everywhere
else, derive plain text at read time with `richTextToPlain()` in the mapper instead —
no extra column needed.

## Response shape

Every mapper that returns `description` also returns a `descriptionText` sibling — the
same content with markup stripped, for SEO meta tags, share previews, and search
snippets. Both can be `null`. See
[`docs/web-property-detail-contract.md`](./web-property-detail-contract.md) for the
property detail/list shape.
