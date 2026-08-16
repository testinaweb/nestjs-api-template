import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AllExceptionsFilter } from '#src/common/filters/http-exception.filter.js';
import { requestIdMiddleware } from '#src/common/middleware/request-id.middleware.js';
import type { AppConfig } from '#src/config/configuration.js';

/**
 * Shared app configuration (middleware, filters, pipes, docs). Used by main.ts's
 * bootstrap() and by e2e tests, so both run against an identically configured app.
 * Kept out of main.ts so importing it never has the side effect of listening.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const appName = config.getOrThrow<AppConfig['appName']>('appName');
  const corsOrigin = config.getOrThrow<AppConfig['corsOrigin']>('corsOrigin');
  const swaggerEnabled =
    config.getOrThrow<AppConfig['swaggerEnabled']>('swaggerEnabled');

  app.use(helmet());
  app.use(compression());
  app.use(requestIdMiddleware);
  app.enableCors({ origin: corsOrigin });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle(appName).addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
