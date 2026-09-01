import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** Postgres error code for a unique constraint violation. */
const POSTGRES_UNIQUE_VIOLATION = '23505';
/** Postgres error code for a foreign key constraint violation — a backstop
 * for any FK relationship in the app, not just media_assets (which also
 * has its own precheck in MediaService.delete() for a friendlier message
 * before this filter is ever reached). */
const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';
/** Postgres error code for a CHECK constraint violation — a backstop for
 * e.g. chk_content_blocks_hero_requires_media (ContentBlocksService
 * already guards this with a friendlier message before either the normal
 * write path or MediaService.delete()'s own precheck would ever let a
 * request reach the DB in a state that could trip it). */
const POSTGRES_CHECK_VIOLATION = '23514';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const pgCode =
      exception instanceof QueryFailedError
        ? (exception as unknown as { code?: string }).code
        : undefined;

    const isUniqueViolation = pgCode === POSTGRES_UNIQUE_VIOLATION;
    const isForeignKeyViolation = pgCode === POSTGRES_FOREIGN_KEY_VIOLATION;
    const isCheckViolation = pgCode === POSTGRES_CHECK_VIOLATION;

    const status =
      isUniqueViolation || isForeignKeyViolation || isCheckViolation
        ? HttpStatus.CONFLICT
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

    // Never echo the raw Postgres detail — it exposes column names/values.
    const message = isUniqueViolation
      ? 'Resource already exists'
      : isForeignKeyViolation
        ? 'Resource is still referenced by other records'
        : isCheckViolation
          ? 'A data constraint was violated'
          : exception instanceof HttpException
            ? exception.getResponse()
            : 'Internal server error';

    if (status >= 500) {
      this.logger.error(exception);
    }

    // A response can already be underway (or fully sent) by the time an
    // exception reaches this filter — most commonly the client disconnected
    // (mobile network drop, CloudFront/browser abort) while a slow handler
    // was still serializing, and the underlying socket errors out mid-write.
    // Express/Node has nothing to "correct" at that point — the connection
    // is already gone from the client's perspective — so calling
    // response.status().json() here throws ERR_HTTP_HEADERS_SENT (and, in
    // some Node versions, can cascade into a second, unrelated-looking crash
    // in Node's own socket error handling). Just log and stop.
    if (response.headersSent) {
      this.logger.warn(
        `Exception occurred after headers were already sent for ${request.method} ${request.url} — response not rewritten.`,
      );
      return;
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: message,
    });
  }
}
