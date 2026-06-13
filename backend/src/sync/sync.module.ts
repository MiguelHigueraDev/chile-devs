import { Module } from '@nestjs/common';
import { DevelopersModule } from '../developers/developers.module';
import { ExclusionModule } from '../exclusion/exclusion.module';
import { EnrichmentCacheService } from './enrichment-cache.service';
import { GithubService } from './github.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [ExclusionModule, DevelopersModule],
  controllers: [SyncController],
  providers: [EnrichmentCacheService, GithubService, SyncService],
  exports: [SyncService, GithubService, EnrichmentCacheService],
})
export class SyncModule {}
