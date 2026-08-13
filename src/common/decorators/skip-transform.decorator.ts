import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * Opts a route out of the global `TransformInterceptor`. Required for `@Sse()`
 * routes: the interceptor runs per-emission and would rewrite each
 * `{ type, data }` SSE message into `{ data: { type, data } }`, destroying
 * the event `type` the client relies on to tell events apart.
 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
