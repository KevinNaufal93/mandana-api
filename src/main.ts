import { NestFactory, Reflector } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  // The homepage payload now inlines LQIP placeholders (base64 data: URIs)
  // and will grow further with the services array — gzip gets it back down
  // to roughly a quarter of its wire size for essentially free.
  app.use(compression());
  // exposedHeaders: without this, cross-origin JS cannot read the ETag
  // header at all (GET /storage/availability, GET /homepage) — the browser
  // still uses it for its own native revalidation regardless, but a client
  // wanting to do its own conditional fetch needs the header exposed.
  app.enableCors({ exposedHeaders: ['ETag'] });

  // Global prefix + URI versioning → routes at /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Strict validation: strip unknown fields, transform to typed classes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Uniform error shape + { data } envelope
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(app.get(Reflector)),
  );

  // Swagger UI at /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mandana API')
    .setDescription('Real estate landing page + admin CMS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger docs at  http://localhost:${port}/docs`);

  app.enableShutdownHooks();
}

bootstrap();
