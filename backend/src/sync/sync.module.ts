import { Module } from '@nestjs/common';
import { ExclusionModule } from '../exclusion/exclusion.module';
import { EnrichmentCacheService } from './enrichment-cache.service';
import { GithubService } from './github.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ExclusionModule],
  controllers: [SyncController],
  providers: [EnrichmentCacheService, GithubService, SyncService],
  exports: [SyncService],
})
export class SyncModule {}
