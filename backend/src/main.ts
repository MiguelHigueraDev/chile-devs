import fastifyCookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { parseFrontendUrlConfig } from './lib/frontend-url';

const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  await app.register(helmet, {
    global: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 63_072_000,
      includeSubDomains: true,
    },
  });

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('Permissions-Policy', PERMISSIONS_POLICY);
    done();
  });

  await app.register(fastifyCookie);

  const { corsOrigins } = parseFrontendUrlConfig(
    app.get(ConfigService).get<string>('FRONTEND_URL'),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: '0.0.0.0',
  });
}

void bootstrap();
