import {
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService } from './discovery.service';

@Controller('api/discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  async triggerDiscovery(
    @Headers('authorization') authorization?: string,
    @Query('dryRun') dryRun?: string,
  ) {
    this.validateSyncToken(this.extractBearerToken(authorization));
    return this.discoveryService.runDiscovery({
      dryRun: this.parseBool(dryRun),
    });
  }

  @Get('last')
  async lastRun(@Headers('authorization') authorization?: string) {
    this.validateSyncToken(this.extractBearerToken(authorization));
    return this.discoveryService.getLastDiscoveryRun();
  }

  private parseBool(value?: string): boolean {
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
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
