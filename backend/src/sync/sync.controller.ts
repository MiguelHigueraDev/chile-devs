import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
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
    this.validateSyncToken(token);
    return this.syncService.runSync();
  }

  @Post('user')
  async syncUser(@Query('token') token?: string, @Query('user') user?: string) {
    this.validateSyncToken(token);

    const login = user?.trim();
    if (!login) {
      throw new BadRequestException('Missing required query parameter: user');
    }

    return this.syncService.syncUser(login);
  }

  private validateSyncToken(token?: string): void {
    const expectedToken = this.configService.get<string>('SYNC_TOKEN');
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid or missing sync token');
    }
  }
}
