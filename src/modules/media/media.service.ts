import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MediaAsset, VariantMap } from './entities/media-asset.entity';
import { MediaPurpose } from './enums/media-purpose.enum';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image-processor.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';

export type MediaImageDto = {
  url: string;
  srcset: string;
  /** '' when the asset has no AVIF variants (cover/icon — see
   * ImageProcessorService's PURPOSE_SPECS, which only encodes AVIF for
   * hero). FE should render a <picture> avif <source> only when non-empty. */
  srcsetAvif: string;
  /** ~20px WebP data: URI for an instant blurred paint, or null for an
   * asset uploaded before this existed and not yet backfilled — see
   * MediaService.backfillPlaceholders(). */
  placeholder: string | null;
  alt: string | null;
  width: number;
  height: number;
};

export type MediaAssetListItem = {
  id: string;
  purpose: MediaPurpose;
  alt: string | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: Date;
  image: MediaImageDto;
  /** Only present when the request asked for ?withUsage=true. */
  referenceCount?: number;
};

interface FkReference {
  table: string;
  column: string;
}

/** `catch (err)` types `err` as `unknown` — this narrows it to a loggable
 * string without the `@typescript-eslint/restrict-template-expressions`
 * violation a bare `${err}` in a template literal would trigger. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  /** Tables that FK to media_assets, discovered from the DB catalog at
   * boot (see onModuleInit) rather than hardcoded — a hand-maintained list
   * rots the moment a new module adds a mediaAssetId column and nobody
   * remembers to update this file. Used by delete()'s reference precheck
   * and findAllAdmin()'s ?unused filter. If discovery fails for any reason
   * this stays empty and both degrade gracefully: delete() falls through
   * to Postgres's own FK enforcement (still safe, just a 409 instead of a
   * friendlier message — see AllExceptionsFilter's 23503 mapping), and
   * ?unused simply returns everything. */
  private fkReferences: FkReference[] = [];

  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaRepo: Repository<MediaAsset>,
    private readonly storage: StorageService,
    private readonly processor: ImageProcessorService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows: { table_name: string; column_name: string }[] = await this
        .mediaRepo.manager.query(`
          SELECT con.conrelid::regclass::text AS table_name,
                 att.attname                  AS column_name
          FROM pg_constraint con
          JOIN pg_class ref ON ref.oid = con.confrelid
          JOIN pg_attribute att
            ON att.attrelid = con.conrelid
           AND att.attnum = ANY(con.conkey)
          WHERE con.contype = 'f' AND ref.relname = 'media_assets'
        `);
      this.fkReferences = rows.map((r) => ({
        table: r.table_name,
        column: r.column_name,
      }));
      this.logger.log(
        `Discovered ${this.fkReferences.length} FK reference(s) into media_assets: ` +
          this.fkReferences.map((r) => `${r.table}.${r.column}`).join(', '),
      );
    } catch (err) {
      this.logger.warn(
        `Could not discover media_assets FK references — delete() and the ` +
          `?unused filter will fall back to permissive behaviour: ${errorMessage(err)}`,
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadMediaDto,
  ): Promise<MediaAsset> {
    if (!file) throw new BadRequestException('file is required');
    this.processor.validate(file.mimetype, file.size);

    const isSvg = this.processor.isSvg(file.mimetype);
    if (isSvg && dto.purpose !== MediaPurpose.ICON) {
      throw new BadRequestException(
        'SVG uploads are only accepted for purpose=icon (they are rasterized into the icon ladder, not served as-is).',
      );
    }

    const { width, height } = isSvg
      ? await this.processor.svgIntrinsicSize(file.buffer)
      : await this.processor.intrinsicSize(file.buffer);

    const id = uuidv4();
    const baseKey = `media/${id}`;

    const processedVariants = isSvg
      ? await this.processor.rasterizeSvg(file.buffer, baseKey)
      : await this.processor.generateVariants(
          file.buffer,
          baseKey,
          dto.purpose,
        );

    const placeholder = await this.processor.generatePlaceholder(
      file.buffer,
      isSvg,
    );

    // The as-uploaded source, stored alongside its variants so they can be
    // regenerated later (new widths, a quality retune) without asking the
    // admin to re-upload. Never linked from any API response — see
    // buildImageDto(), which only ever reads from `variants`.
    const originalExt = isSvg ? 'svg' : this.extensionForMime(file.mimetype);
    const originalKey = `${baseKey}/original.${originalExt}`;

    await Promise.all([
      ...processedVariants.map((v) =>
        this.storage.put(v.key, v.buffer, v.contentType),
      ),
      this.storage.put(originalKey, file.buffer, file.mimetype, {
        contentDisposition: isSvg ? 'attachment' : undefined,
      }),
    ]);

    const variants: VariantMap = {};
    for (const v of processedVariants) {
      if (!variants[v.format]) variants[v.format] = {};
      variants[v.format][v.width] = v.key;
    }

    const asset = this.mediaRepo.create({
      storageKey: baseKey,
      originalKey,
      variants,
      mimeType: file.mimetype,
      purpose: dto.purpose,
      width,
      height,
      sizeBytes: file.size,
      alt: dto.alt ?? null,
      placeholder,
    });

    return this.mediaRepo.save(asset);
  }

  private extensionForMime(mimeType: string): string {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/jpeg':
      default:
        return 'jpg';
    }
  }

  /** Batch existence lookup, e.g. for validating a set of mediaAssetIds referenced by another entity's batch write. */
  findManyByIds(ids: string[]): Promise<MediaAsset[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.mediaRepo.findBy({ id: In(ids) });
  }

  async findOneOrFail(id: string): Promise<MediaAsset> {
    const asset = await this.mediaRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Media asset ${id} not found`);
    return asset;
  }

  async findAllAdmin(
    query: QueryMediaDto,
  ): Promise<PaginatedResult<MediaAssetListItem>> {
    const { page, limit, purpose, unused, withUsage } = query;

    const qb = this.mediaRepo.createQueryBuilder('m');
    if (purpose) qb.andWhere('m.purpose = :purpose', { purpose });

    if (unused && this.fkReferences.length > 0) {
      const clauses = this.fkReferences
        .map(
          (r) =>
            `NOT EXISTS (SELECT 1 FROM "${r.table}" WHERE "${r.column}" = m.id)`,
        )
        .join(' AND ');
      qb.andWhere(clauses);
    }

    qb.orderBy('m."createdAt"', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [assets, total] = await qb.getManyAndCount();

    const referenceCounts = withUsage
      ? await this.batchReferenceCounts(assets.map((a) => a.id))
      : null;

    const data: MediaAssetListItem[] = assets.map((asset) => ({
      id: asset.id,
      purpose: asset.purpose,
      alt: asset.alt,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      sizeBytes: asset.sizeBytes,
      createdAt: asset.createdAt,
      image: this.buildImageDto(asset),
      ...(referenceCounts
        ? { referenceCount: referenceCounts.get(asset.id) ?? 0 }
        : {}),
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** How many rows across every table that FKs to media_assets reference
   * this id — surfaced to the admin so "delete" isn't a guess, and used by
   * delete()'s precheck. Table/column names are interpolated from
   * `fkReferences`, which comes only from pg_constraint (see
   * onModuleInit), never from request input. */
  async findReferences(
    id: string,
  ): Promise<{ table: string; count: number }[]> {
    if (this.fkReferences.length === 0) return [];

    const unionSql = this.fkReferences
      .map(
        (r) =>
          `SELECT '${r.table}' AS table_name, COUNT(*)::int AS count FROM "${r.table}" WHERE "${r.column}" = $1`,
      )
      .join(' UNION ALL ');

    const rows: { table_name: string; count: number }[] =
      await this.mediaRepo.manager.query(unionSql, [id]);
    return rows
      .filter((r) => r.count > 0)
      .map((r) => ({ table: r.table_name, count: r.count }));
  }

  /** Batches usage counts for a page of ids into one query per referencing
   * table instead of N+1 — used by findAllAdmin's ?withUsage flag. */
  private async batchReferenceCounts(
    ids: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ids.length === 0 || this.fkReferences.length === 0) return counts;

    const unionSql = this.fkReferences
      .map(
        (r) =>
          `SELECT "${r.column}" AS media_asset_id, COUNT(*)::int AS count FROM "${r.table}" WHERE "${r.column}" = ANY($1) GROUP BY "${r.column}"`,
      )
      .join(' UNION ALL ');

    const rows: { media_asset_id: string; count: number }[] =
      await this.mediaRepo.manager.query(unionSql, [ids]);

    for (const row of rows) {
      counts.set(
        row.media_asset_id,
        (counts.get(row.media_asset_id) ?? 0) + row.count,
      );
    }
    return counts;
  }

  async delete(id: string): Promise<void> {
    const asset = await this.mediaRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException(`Media asset ${id} not found`);

    const refs = await this.findReferences(id);
    if (refs.length > 0) {
      throw new ConflictException(
        `Media asset ${id} is still used by: ${refs
          .map((r) => `${r.count}× ${r.table}`)
          .join(', ')}. Detach it from those records first.`,
      );
    }

    const keys = [
      ...Object.values(asset.variants).flatMap((fmtMap) =>
        Object.values(fmtMap),
      ),
      ...(asset.originalKey ? [asset.originalKey] : []),
    ];

    // DB row first: if a RESTRICT FK still holds (a race with the precheck
    // above, or fkReferences came back empty because discovery failed),
    // Postgres refuses here — mapped to 409 by AllExceptionsFilter — and
    // no storage object has been touched. The previous "delete files, then
    // the row" order meant that failure destroyed live images while
    // leaving the referencing row (e.g. a hero slide) pointing at nothing.
    await this.mediaRepo.remove(asset);

    // Storage second, best-effort. A leaked S3 object is recoverable waste
    // (surfaced via GET /admin/media?unused=true); destroying a still-
    // referenced image is not, which is why the order above matters more
    // than this being transactional.
    const results = await Promise.allSettled(
      keys.map((k) => this.storage.delete(k)),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(
          `Failed to delete orphaned object ${keys[i]}: ${r.reason}`,
        );
      }
    });
  }

  /** Admin-triggered, idempotent backfill for assets uploaded before the
   * `placeholder` column existed. The original was never stored for those
   * rows either, so this downsamples the smallest available webp variant
   * instead — slightly softer than a placeholder generated from the true
   * source, which is an acceptable trade for a one-time backfill. */
  async backfillPlaceholders(): Promise<{ processed: number; failed: number }> {
    // IsNull(), not `{ placeholder: undefined }` — TypeORM silently drops a
    // literal `undefined` value from a where clause (the same behaviour
    // this file's own conditional-spread PATCH handlers rely on elsewhere),
    // which would fetch every asset instead of just the pending ones.
    const pending = await this.mediaRepo.find({
      where: { placeholder: IsNull() },
    });

    let processed = 0;
    let failed = 0;

    for (const asset of pending) {
      try {
        const webpVariants = asset.variants['webp'] ?? {};
        const widths = Object.keys(webpVariants)
          .map(Number)
          .sort((a, b) => a - b);
        const smallestKey =
          widths.length > 0 ? webpVariants[widths[0]] : undefined;
        if (!smallestKey) {
          failed++;
          continue;
        }
        const buffer = await this.storage.get(smallestKey);
        asset.placeholder = await this.processor.generatePlaceholder(
          buffer,
          false,
        );
        await this.mediaRepo.save(asset);
        processed++;
      } catch (err) {
        this.logger.warn(
          `Placeholder backfill failed for ${asset.id}: ${errorMessage(err)}`,
        );
        failed++;
      }
    }

    return { processed, failed };
  }

  buildImageDto(asset: MediaAsset): MediaImageDto {
    const webpVariants = asset.variants['webp'] ?? {};
    const avifVariants = asset.variants['avif'] ?? {};

    const sortedWidths = Object.keys(webpVariants)
      .map(Number)
      .sort((a, b) => a - b);
    const srcset = sortedWidths
      .map((w) => `${this.storage.buildUrl(webpVariants[w])} ${w}w`)
      .join(', ');

    const avifWidths = Object.keys(avifVariants)
      .map(Number)
      .sort((a, b) => a - b);
    const srcsetAvif = avifWidths
      .map((w) => `${this.storage.buildUrl(avifVariants[w])} ${w}w`)
      .join(', ');

    const largestWidth = sortedWidths[sortedWidths.length - 1];
    // png (transparent sources) or jpeg (opaque) — see
    // ImageProcessorService.generateVariants's alpha-aware fallback.
    // Falls back further to webp itself so a webp-only asset (e.g. an
    // SVG-rasterized icon before its png fallback exists) still resolves.
    const fallbackMap =
      asset.variants['png'] ??
      asset.variants['jpeg'] ??
      asset.variants['webp'] ??
      {};
    const fallbackKey =
      fallbackMap[largestWidth] ?? Object.values(fallbackMap)[0];

    if (!fallbackKey) {
      // Zero usable variants means the upload half-failed and this row
      // should never have been readable — surface that loudly instead of
      // handing every caller (including properties.service.ts, which
      // persists this into a column) a silently broken image URL.
      this.logger.error(`Media asset ${asset.id} has no usable image variant`);
      throw new InternalServerErrorException(
        `Media asset ${asset.id} has no usable image variant`,
      );
    }

    return {
      url: this.storage.buildUrl(fallbackKey),
      srcset,
      srcsetAvif,
      placeholder: asset.placeholder,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
    };
  }
}
