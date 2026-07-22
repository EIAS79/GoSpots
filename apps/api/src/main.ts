import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { resolveCorsPolicy } from './common/cors-origins';
import {
  isLegacyUploadsStaticEnabled,
  legacyUploadsStaticBootWarning,
} from './common/legacy-uploads.util';
import { assertCriticalSecretsAtBoot } from './common/production-secrets.util';
import { initSentryFromEnv } from './sentry';

// Optional Sentry — no-op without SENTRY_DSN; fail-open on init errors.
initSentryFromEnv();

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  const bootLogger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    // Quiet route-mapping spam in local dev; keep errors/warnings.
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn'],
  });
  const config = app.get(ConfigService);

  assertCriticalSecretsAtBoot(
    { get: (key) => config.get<string>(key) },
    {
      isProd,
      warn: (message) => bootLogger.warn(message),
    },
  );

  const expressInstance = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
  };
  expressInstance.set('trust proxy', 1);
  /**
   * Helmet security headers (API JSON + cookie auth).
   *
   * - CSP off: this service serves JSON/API + optional legacy `/uploads` media,
   *   not HTML app shells. A strict CSP is low-value here and risks breaking
   *   Swagger (`/docs`) and any future HTML error pages; leave CSP to the Next.js
   *   web app.
   * - CORP `cross-origin`: dashboard/public site embed images from the API host
   *   (different origin locally; same via Vercel proxy in prod). Also set on
   *   media responses (+ legacy static uploads when enabled).
   * - COEP off: default; enabling would break cross-origin media without CORP+CORP.
   * - HSTS only in production: avoid sticky HTTPS expectations on local HTTP.
   * - Does not alter Set-Cookie / CSRF double-submit or CORS allowlists.
   */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      strictTransportSecurity: isProd
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
    }),
  );
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');
  /**
   * Legacy disk images (`/uploads/…`) — gated by LEGACY_UPLOADS_STATIC (default on).
   * New uploads are StoredImage rows served at GET /media/:id. Flip the flag off
   * only after inventory:legacy-uploads reports zero DB refs (Phase 1).
   */
  const legacyUploadsStatic = isLegacyUploadsStaticEnabled({
    LEGACY_UPLOADS_STATIC:
      config.get<string>('LEGACY_UPLOADS_STATIC') ??
      process.env.LEGACY_UPLOADS_STATIC,
  });
  if (legacyUploadsStatic) {
    bootLogger.warn(legacyUploadsStaticBootWarning());
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/api/v1/uploads/',
      /** No directory index / listing — only named files under uploads/. */
      index: false,
      setHeaders(res) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    });
  } else {
    bootLogger.log(
      'Legacy static /api/v1/uploads/ disabled (LEGACY_UPLOADS_STATIC=false).',
    );
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const cors = resolveCorsPolicy({
    isProd,
    corsOrigins: config.get<string>('CORS_ORIGINS'),
    corsOrigin: config.get<string>('CORS_ORIGIN'),
    webOrigin: config.get<string>('WEB_ORIGIN'),
    webAppUrl: config.get<string>('WEB_APP_URL'),
  });
  // Explicit allowlist only — never `origin: true` (no arbitrary Origin reflection).
  // credentials only when at least one origin is configured.
  app.enableCors({
    origin: cors.origins.length > 0 ? cors.origins : false,
    credentials: cors.credentials,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-venue-path',
      'x-csrf-token',
    ],
  });

  if (config.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Locora API')
      .setDescription('Gaming & billiard center management SaaS')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = +config.get('PORT', '4000');
  await app.listen(port);
}

bootstrap();
