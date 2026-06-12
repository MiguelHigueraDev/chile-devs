import { Module } from '@nestjs/common';
import { EnrichmentCacheService } from './enrichment-cache.service';
import { GithubService } from './github.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [SyncController],
  providers: [EnrichmentCacheService, GithubService, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
