import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

export interface PutOptions {
  /** Overrides the default immutable cache policy — used for the stored
   * original, which is never linked from a response and doesn't need
   * long-lived browser caching. */
  cacheControl?: string;
  contentDisposition?: string;
}

// Object keys are content-addressed: `media/<uuid>/<width>.<ext>`, and a
// re-upload always mints a new uuid — nothing at an existing key ever
// changes, so it's safe (and, per the plan, the single highest-value fix
// here) to tell every downstream cache to hold it forever.
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new S3Client({
      endpoint: configService.getOrThrow<string>('storage.endpoint'),
      region: configService.getOrThrow<string>('storage.region'),
      credentials: {
        accessKeyId: configService.getOrThrow<string>('storage.accessKey'),
        secretAccessKey: configService.getOrThrow<string>('storage.secretKey'),
      },
      forcePathStyle: configService.get<boolean>(
        'storage.forcePathStyle',
        true,
      ),
    });
    this.bucket = configService.getOrThrow<string>('storage.bucket');
    this.publicUrl = configService.getOrThrow<string>('media.publicUrl');
  }

  async put(
    key: string,
    body: Buffer,
    contentType: string,
    opts?: PutOptions,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: opts?.cacheControl ?? DEFAULT_CACHE_CONTROL,
        ContentDisposition: opts?.contentDisposition,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Reads an object back — used only to regenerate an LQIP placeholder
   * for assets uploaded before that column existed (their original was
   * never stored, so the backfill downsamples the smallest webp variant
   * instead). Not on the request-serving path: images are always fetched
   * by the browser directly from `buildUrl()`, never proxied through Nest. */
  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  buildUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
