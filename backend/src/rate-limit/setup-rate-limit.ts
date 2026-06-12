import rateLimit from '@fastify/rate-limit';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RateLimitBanService } from './rate-limit-ban.service';

const logger = new Logger('RateLimit');

export async function setupRateLimit(
  app: NestFastifyApplication,
): Promise<RateLimitBanService> {
  const config = app.get(ConfigService);
  const banService = new RateLimitBanService(
    config.getOrThrow<string>('REDIS_URL'),
  );

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const { banned, retryAfterSeconds } = await banService.isBanned(
        request.ip,
      );
      if (!banned) {
        return;
      }

      reply.header('Retry-After', String(retryAfterSeconds ?? 1));
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Too many requests. You are temporarily banned.',
      });
    } catch (error) {
      logger.error(`Failed to check ban status for ${request.ip}`, error);
      return;
    }
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    ban: -1,
    redis: banService.client,
    nameSpace: 'ratelimit:counters:',
    skipOnError: true,
    errorResponseBuilder: async (request, context) => {
      const ip = request.ip;
      const existingBan = await banService.isBanned(ip);
      if (existingBan.banned) {
        return {
          statusCode: 403,
          error: 'Forbidden',
          message: 'Too many requests. You are temporarily banned.',
          retryAfter: existingBan.retryAfterSeconds,
        };
      }

      const { banned } = await banService.recordExceededWindow(ip);
      if (banned) {
        logger.warn(`Rate limit ban applied for ${ip}`);
        const banStatus = await banService.isBanned(ip);
        return {
          statusCode: 403,
          error: 'Forbidden',
          message: 'Too many requests. You are temporarily banned.',
          retryAfter: banStatus.retryAfterSeconds,
        };
      }

      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}.`,
      };
    },
  });

  return banService;
}
