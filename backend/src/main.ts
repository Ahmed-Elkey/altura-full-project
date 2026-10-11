import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, rawBody: true });
  const config = app.get(ConfigService);

  // Forwarded client addresses are trusted only when deployment explicitly
  // configures a proxy hop count. Direct local development stays untrusted.
  const trustProxy = config.get<boolean | number>('TRUST_PROXY', false);
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  const port = config.get<number>('PORT', 4000);
  const host = config.get<string>('HOST', '127.0.0.1');
  const apiPrefix = config.get<string>('API_PREFIX', 'api/v1');
  const frontendOrigins = config
    .get<string>('FRONTEND_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isDevelopment = config.get<string>('NODE_ENV', 'development') !== 'production';

  // Helmet defaults already include a restrictive Content-Security-Policy,
  // HSTS (production HTTPS), noSniff, frameguard, and referrer-policy.
  // Cross-Origin-Embedder-Policy stays off because Swagger UI loads CDN assets.
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || frontendOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // START_ALTURA.bat may select 3000-3010 when a local port is occupied.
      if (isDevelopment && /^http:\/\/localhost:(?:300[0-9]|3010)$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ALTURA Commerce API')
    .setDescription('Local API for ALTURA e-commerce')
    .setVersion('0.7.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  if (isDevelopment) {
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  await app.listen(port, host);

  console.log(`ALTURA API: http://${host}:${port}/${apiPrefix}`);
  console.log(`Swagger:   http://${host}:${port}/${apiPrefix}/docs`);
}

void bootstrap();
