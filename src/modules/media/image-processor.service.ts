import {
  Injectable,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { MediaPurpose } from './enums/media-purpose.enum';

export type Format = 'webp' | 'avif' | 'jpeg' | 'png';
export type ProcessedVariant = {
  key: string;
  buffer: Buffer;
  contentType: string;
  width: number;
  format: Format;
};

const ALLOWED_RASTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_SVG_MIME = new Set(['image/svg+xml']);
const MAX_RASTER_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
// A legitimate icon SVG is a few KB; anything near this cap is either a
// disguised raster or an attack payload — see rasterizeSvg() for why SVGs
// are rasterized rather than served, which is what makes this size cap
// the only real defense this format needs.
const MAX_SVG_SIZE_BYTES = 512 * 1024; // 512 KB

// librsvg (bundled with sharp's libvips) rasterizes at 72dpi by default —
// far too coarse for a 24x24 viewBox scaled up to a 256px icon, producing
// a blurry result no matter what `resize` is asked for afterwards. This
// forces a higher-resolution render so no upscaling is needed downstream.
const SVG_RENDER_DENSITY = 384;
// Guards against an SVG "decompression bomb" (a huge viewBox behind a
// tiny visible area) pushing sharp to allocate gigabytes. This is sharp's
// own documented default ceiling, made explicit rather than relied upon.
const SVG_MAX_INPUT_PIXELS = 268402689;

interface PurposeSpec {
  /** Width ladder in ascending order. Filtered against the real source
   * width at generation time (see resolveWidths) so a srcset never
   * advertises a size the file doesn't actually have. */
  widths: number[];
  /** Widths (from `widths`) that additionally get an AVIF encode — by far
   * the slowest encoder, so reserved for where it's actually served
   * end-to-end (the hero, via MediaService.buildImageDto's srcsetAvif). */
  avifWidths: number[];
}

const PURPOSE_SPECS: Record<MediaPurpose, PurposeSpec> = {
  [MediaPurpose.HERO]: { widths: [768, 1280, 1920], avifWidths: [1280, 1920] },
  [MediaPurpose.COVER]: { widths: [400, 800], avifWidths: [] },
  [MediaPurpose.ICON]: { widths: [64, 128, 256], avifWidths: [] },
};

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  validate(mimeType: string, sizeBytes: number): void {
    if (ALLOWED_SVG_MIME.has(mimeType)) {
      if (sizeBytes > MAX_SVG_SIZE_BYTES) {
        throw new UnsupportedMediaTypeException(
          `SVG files must be under ${MAX_SVG_SIZE_BYTES / 1024} KB.`,
        );
      }
      return;
    }
    if (!ALLOWED_RASTER_MIME.has(mimeType)) {
      throw new UnsupportedMediaTypeException(
        `File type ${mimeType} is not allowed. Use JPEG, PNG, WebP, or SVG (icons only).`,
      );
    }
    if (sizeBytes > MAX_RASTER_SIZE_BYTES) {
      throw new UnsupportedMediaTypeException(
        `File exceeds the ${MAX_RASTER_SIZE_BYTES / (1024 * 1024)} MB limit.`,
      );
    }
  }

  isSvg(mimeType: string): boolean {
    return ALLOWED_SVG_MIME.has(mimeType);
  }

  /**
   * Orientation-aware: sharp's `metadata()` reports pre-rotation (raw)
   * pixel dimensions even though `.rotate()` (used throughout this
   * service) auto-applies the EXIF orientation to the actual output
   * pixels. Orientations 5-8 involve a 90°/270° turn, so the reported
   * width/height must be swapped to match what's actually rendered —
   * otherwise a portrait phone photo reports landscape dimensions, and
   * every consumer (aspect-ratio boxes, `<img width height>`) gets a
   * sideways box and a layout shift once the real image paints.
   */
  async intrinsicSize(
    buffer: Buffer,
  ): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    const orientation = meta.orientation ?? 1;
    const isSideways = orientation >= 5 && orientation <= 8;
    return isSideways
      ? { width: rawHeight, height: rawWidth }
      : { width: rawWidth, height: rawHeight };
  }

  async svgIntrinsicSize(
    buffer: Buffer,
  ): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer, {
      density: SVG_RENDER_DENSITY,
      limitInputPixels: SVG_MAX_INPUT_PIXELS,
    }).metadata();
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  }

  /**
   * Filters a purpose's width ladder down to widths the source can
   * actually fill, and caps the top of the ladder at the true source
   * width. Without this, `resize({ withoutEnlargement: true })` silently
   * collapses any width above the source's own size down to the source
   * size — but the *key* still says e.g. "1920.webp", so the srcset kept
   * advertising `1920w` for a file that's actually 900px wide, and a
   * browser picking for a large viewport would choose that file and
   * render it blurry instead of picking a smaller, equally-sized-but-
   * honestly-labelled one.
   */
  private resolveWidths(ladder: number[], srcWidth: number): number[] {
    const usable = ladder.filter((w) => w < srcWidth);
    // Only cap with the true source width when some literal ladder rung
    // got filtered out above for being >= the source — i.e. the ladder
    // overshot the source and needs a substitute top rung. When nothing
    // was filtered (the normal case: the source is larger than the whole
    // ladder, as any real photo is against the 64/128/256 icon ladder),
    // `usable` already equals the full ladder and must be returned as-is —
    // appending srcWidth here was a real bug: every hero/cover/icon upload
    // got a spurious extra rung at the *raw* source width (e.g. a 4000px
    // photo produced 768/1280/1920/4000 instead of the intended
    // 768/1280/1920), one extra full-resolution encode paid for nothing.
    if (usable.length < ladder.length) {
      if (usable.length === 0 || usable[usable.length - 1] < srcWidth) {
        usable.push(srcWidth);
      }
    }
    return usable;
  }

  async generateVariants(
    buffer: Buffer,
    baseKey: string,
    purpose: MediaPurpose,
  ): Promise<ProcessedVariant[]> {
    const spec = PURPOSE_SPECS[purpose];
    const { width: srcWidth } = await this.intrinsicSize(buffer);
    const widths = this.resolveWidths(spec.widths, srcWidth);
    const largestWidth = widths[widths.length - 1];
    const avifThreshold =
      spec.avifWidths.length > 0 ? Math.min(...spec.avifWidths) : Infinity;

    const rasterMeta = await sharp(buffer).metadata();
    const hasAlpha = rasterMeta.hasAlpha ?? false;
    // Transparent sources (every icon, many covers) get a PNG fallback;
    // opaque ones get JPEG. The old unconditional JPEG fallback silently
    // flattened every transparent PNG onto a black background — and
    // buildImageDto() *prefers* the fallback for the plain `url` field,
    // so this was the actual pixels most non-srcset consumers saw.
    const fallbackFormat: Format = hasAlpha ? 'png' : 'jpeg';

    // Decoded and EXIF-rotated once; every width/format branch below
    // clones from here rather than re-decoding the source buffer, which
    // the original implementation did on every one of up to 9 iterations.
    const base = sharp(buffer).rotate();

    const variants: ProcessedVariant[] = [];

    for (const width of widths) {
      const resized = base.clone().resize({ width, withoutEnlargement: true });

      const webp = await resized.clone().webp({ quality: 82 }).toBuffer();
      variants.push({
        key: `${baseKey}/${width}.webp`,
        buffer: webp,
        contentType: 'image/webp',
        width,
        format: 'webp',
      });

      // Literal ladder match, or the largest available width when the
      // source is smaller than every literal AVIF target — a "hero"
      // upload of an 1000px source still gets one AVIF variant instead of
      // silently getting none.
      const wantsAvif =
        spec.avifWidths.length > 0 &&
        (spec.avifWidths.includes(width) ||
          (width === largestWidth && width < avifThreshold));
      if (wantsAvif) {
        const avif = await resized.clone().avif({ quality: 70 }).toBuffer();
        variants.push({
          key: `${baseKey}/${width}.avif`,
          buffer: avif,
          contentType: 'image/avif',
          width,
          format: 'avif',
        });
      }

      // The raster fallback exists only for browsers with neither webp
      // nor avif support, and only the plain <img src> ever reads it —
      // never the srcset. Encoding it at every rung wasted a third of
      // upload CPU and stored bytes for a format nothing consumed at
      // those sizes; one copy at the largest width is enough.
      if (width === largestWidth) {
        const fallback =
          fallbackFormat === 'png'
            ? await resized
                .clone()
                .png({ compressionLevel: 9, palette: true })
                .toBuffer()
            : await resized
                .clone()
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer();
        variants.push({
          key: `${baseKey}/${width}.${fallbackFormat}`,
          buffer: fallback,
          contentType: `image/${fallbackFormat}`,
          width,
          format: fallbackFormat,
        });
      }
    }

    return variants;
  }

  /**
   * Rasterizes an SVG into the normal icon ladder (webp + a png fallback)
   * instead of storing and serving raw markup.
   *
   * This is deliberately not "store + sanitize": `sanitize-html` lowercases
   * attribute names, which corrupts `viewBox` under SVG's case-sensitive
   * XML parsing, and it has no notion of SVG-only attack vectors
   * (`<use href="data:...">`, `<foreignObject>`, `<animate
   * attributeName="href">`, `@import` inside `<style>`). A CSP response
   * header could contain those, but S3's `PutObjectCommand` cannot set
   * one — only CacheControl/ContentDisposition/ContentType/etc. Rasterizing
   * sidesteps the whole problem: the browser only ever receives raster
   * pixels, so there is nothing left to sanitize or to defend with a CSP.
   */
  async rasterizeSvg(
    buffer: Buffer,
    baseKey: string,
  ): Promise<ProcessedVariant[]> {
    const spec = PURPOSE_SPECS[MediaPurpose.ICON];
    const largestWidth = spec.widths[spec.widths.length - 1];
    const variants: ProcessedVariant[] = [];

    for (const width of spec.widths) {
      const resized = sharp(buffer, {
        density: SVG_RENDER_DENSITY,
        limitInputPixels: SVG_MAX_INPUT_PIXELS,
      }).resize({
        width,
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });

      const webp = await resized.clone().webp({ quality: 90 }).toBuffer();
      variants.push({
        key: `${baseKey}/${width}.webp`,
        buffer: webp,
        contentType: 'image/webp',
        width,
        format: 'webp',
      });

      if (width === largestWidth) {
        const png = await resized
          .clone()
          .png({ compressionLevel: 9, palette: true })
          .toBuffer();
        variants.push({
          key: `${baseKey}/${width}.png`,
          buffer: png,
          contentType: 'image/png',
          width,
          format: 'png',
        });
      }
    }

    return variants;
  }

  /** ~20px-wide WebP as a base64 data: URI — see MediaAsset.placeholder. */
  async generatePlaceholder(buffer: Buffer, isSvg: boolean): Promise<string> {
    const input = isSvg
      ? sharp(buffer, {
          density: SVG_RENDER_DENSITY,
          limitInputPixels: SVG_MAX_INPUT_PIXELS,
        })
      : sharp(buffer).rotate();
    const out = await input
      .resize({ width: 20, fit: 'inside' })
      .webp({ quality: 20, effort: 0 })
      .toBuffer();
    return `data:image/webp;base64,${out.toString('base64')}`;
  }
}
