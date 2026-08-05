import { Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';

export type Format = 'webp' | 'avif' | 'jpeg';
export type ProcessedVariant = {
  key: string;
  buffer: Buffer;
  contentType: string;
  width: number;
  format: Format;
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

@Injectable()
export class ImageProcessorService {
  private readonly heroWidths = [768, 1280, 1920];
  private readonly coverWidths = [400, 800];
  private readonly formats: Format[] = ['webp', 'avif', 'jpeg'];

  validate(mimeType: string, sizeBytes: number): void {
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new UnsupportedMediaTypeException(
        `File type ${mimeType} is not allowed. Use JPEG, PNG, or WebP.`,
      );
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new UnsupportedMediaTypeException(`File exceeds the 20 MB limit.`);
    }
  }

  async intrinsicSize(buffer: Buffer): Promise<{ width: number; height: number }> {
    const meta = await sharp(buffer).metadata();
    return { width: meta.width ?? 0, height: meta.height ?? 0 };
  }

  async generateVariants(
    buffer: Buffer,
    baseKey: string,
    purpose: 'hero' | 'cover',
  ): Promise<ProcessedVariant[]> {
    const widths = purpose === 'hero' ? this.heroWidths : this.coverWidths;
    const variants: ProcessedVariant[] = [];

    for (const width of widths) {
      for (const format of this.formats) {
        const resized = sharp(buffer).resize({ width, withoutEnlargement: true });

        let out: Buffer;
        if (format === 'webp') out = await resized.webp({ quality: 82 }).toBuffer();
        else if (format === 'avif') out = await resized.avif({ quality: 70 }).toBuffer();
        else out = await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer();

        const ext = format === 'jpeg' ? 'jpg' : format;
        variants.push({
          key: `${baseKey}/${width}.${ext}`,
          buffer: out,
          contentType: `image/${format}`,
          width,
          format,
        });
      }
    }

    return variants;
  }
}
