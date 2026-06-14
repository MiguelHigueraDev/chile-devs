import { Module } from '@nestjs/common';
import { ExclusionModule } from '../exclusion/exclusion.module';
import { ActivityCacheService } from './activity-cache.service';
import { EnrichmentCacheService } from './enrichment-cache.service';
import { GithubService } from './github.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ExclusionModule],
  controllers: [SyncController],
  providers: [
    ActivityCacheService,
    EnrichmentCacheService,
    GithubService,
    SyncService,
  ],
  exports: [SyncService, GithubService, ActivityCacheService],
})
export class SyncModule {}
