import {
  BadRequestException,
  Controller,
  Headers,
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
  async triggerSync(@Headers('authorization') authorization?: string) {
    this.validateSyncToken(this.extractBearerToken(authorization));
    return this.syncService.runSync();
  }

  @Post('user')
  async syncUser(
    @Headers('authorization') authorization?: string,
    @Query('user') user?: string,
  ) {
    this.validateSyncToken(this.extractBearerToken(authorization));

    const login = user?.trim();
    if (!login) {
      throw new BadRequestException('Missing required query parameter: user');
    }

    return this.syncService.syncUser(login);
  }

  private extractBearerToken(authorization?: string): string | undefined {
    if (!authorization?.toLowerCase().startsWith('bearer ')) {
      return undefined;
    }

    const token = authorization.slice(7).trim();
    return token || undefined;
  }

  private validateSyncToken(token?: string): void {
    const expectedToken = this.configService.get<string>('SYNC_TOKEN');
    if (!expectedToken || token !== expectedToken) {
      throw new UnauthorizedException('Invalid or missing sync token');
    }
  }
}
