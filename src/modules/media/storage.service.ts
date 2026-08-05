import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

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
      forcePathStyle: configService.get<boolean>('storage.forcePathStyle', true),
    });
    this.bucket = configService.getOrThrow<string>('storage.bucket');
    this.publicUrl = configService.getOrThrow<string>('media.publicUrl');
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  buildUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
