import { Controller, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SyncService } from './sync.service';

@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async triggerSync(@Query('token') token?: string) {
    const expectedToken = this.configService.get<string>('SYNC_TOKEN');
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid or missing sync token');
    }
    return this.syncService.runSync();
  }
}
