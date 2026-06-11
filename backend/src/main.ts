import fastifyCookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCookie);

  const frontendUrl =
    app.get(ConfigService).get<string>('FRONTEND_URL') ??
    'http://localhost:5173';
  const corsOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: '0.0.0.0',
  });
}

void bootstrap();
