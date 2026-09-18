import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ArticleRevalidationInput {
  slug: string;
  categorySlug: string;
  /** Only set when the slug changed on this save — lets mandana-web also bust
   *  the stale page at the old URL. In practice this is dead code today:
   *  ArticlesService.update() already forbids changing the slug of a
   *  currently-published article (see its ConflictException), so by the time
   *  a slug can legally change the old one was never live/cached anyway.
   *  Plumbed through anyway — free, harmless, and future-proofs this call if
   *  that guard is ever loosened. */
  previousSlug?: string;
}

const REVALIDATE_PATH = '/api/revalidate';
const REQUEST_TIMEOUT_MS = 8_000;

/**
 * Tells the deployed mandana-web site to bust its ISR cache for an article
 * within seconds of an admin save, instead of waiting up to 300s for
 * app/artikel/[slug]/page.tsx's time-based `revalidate`. Purely a latency
 * optimization on top of that fallback, not a replacement for it — a failure
 * here only means an edit is slow to appear again, never permanently stale.
 *
 * Same "must never fail or block the caller" contract as
 * NotificationsService (see its own doc comment): every branch is
 * try/catch'd and only logs, never throws — and callers must call this
 * WITHOUT awaiting (`void this.articleRevalidation.notifyArticleChanged(...)`)
 * so a slow or unreachable mandana-web deployment can never delay the admin's
 * save response. Safe to do given mandana-api runs as a conventional
 * always-on container (see Dockerfile/docker-compose.prod.yml), not a
 * serverless runtime that could freeze the process before an un-awaited
 * fetch completes.
 *
 * No-ops (after a one-time warning) when MANDANA_WEB_BASE_URL/
 * REVALIDATE_SECRET aren't configured — dev/test/CI simply don't have this
 * wired up, and that's fine; mandana-web's 300s fallback still applies.
 */
@Injectable()
export class ArticleRevalidationService {
  private readonly logger = new Logger(ArticleRevalidationService.name);
  private readonly webhookUrl: string | null;
  private readonly secret: string | null;

  constructor(config: ConfigService) {
    const baseUrl = config.get<string>('revalidation.webBaseUrl') ?? null;
    this.secret = config.get<string>('revalidation.secret') ?? null;
    this.webhookUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}${REVALIDATE_PATH}`
      : null;

    if (!this.webhookUrl || !this.secret) {
      this.logger.warn(
        'MANDANA_WEB_BASE_URL / REVALIDATE_SECRET not configured — on-demand ' +
          "article revalidation is disabled; mandana-web's 300s ISR fallback " +
          'still applies.',
      );
    }
  }

  async notifyArticleChanged(input: ArticleRevalidationInput): Promise<void> {
    if (!this.webhookUrl || !this.secret) return;

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.error(
          `Article revalidation webhook responded ${res.status} for slug "${input.slug}"`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to call article revalidation webhook for slug "${input.slug}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
