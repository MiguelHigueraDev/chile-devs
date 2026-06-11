import fastifyCookie from '@fastify/cookie';
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

  app.enableCors({
    origin: ['http://localhost:5173', 'https://chile-devs.vercel.app'],
    credentials: true,
  });

  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: '0.0.0.0',
  });
}

void bootstrap();
