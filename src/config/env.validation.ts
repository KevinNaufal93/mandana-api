import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  DATABASE_HOST: Joi.string().required(),
  DATABASE_PORT: Joi.number().default(5432),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
  DATABASE_NAME: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  S3_ENDPOINT: Joi.string().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  // Public base URL for media — dev: http://localhost:9000/<bucket>, prod: CDN base
  MEDIA_PUBLIC_URL: Joi.string().required(),

  // On-demand ISR revalidation webhook to mandana-web (ArticleRevalidationService)
  // — optional, unlike everything else in this file: unset in dev/test/CI just
  // disables it (no-op + a one-time warning log), since mandana-web's own 300s
  // time-based ISR still works without this. REVALIDATE_SECRET must exactly
  // match mandana-web's own REVALIDATE_SECRET (see that repo's .env.example) —
  // it's a shared secret value, not a technically-linked variable name.
  MANDANA_WEB_BASE_URL: Joi.string().uri().optional(),
  REVALIDATE_SECRET: Joi.string().min(16).optional(),
});
