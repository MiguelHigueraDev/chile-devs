import { Module } from '@nestjs/common';
import { DevelopersModule } from '../developers/developers.module';
import { ExclusionModule } from '../exclusion/exclusion.module';
import { SyncModule } from '../sync/sync.module';
import { CandidateQueueService } from './candidate-queue.service';
import { ChileConfidenceService } from './chile-confidence.service';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { ContributorSource } from './sources/contributor-source';
import { GraphSource } from './sources/graph-source';

@Module({
  imports: [SyncModule, DevelopersModule, ExclusionModule],
  controllers: [DiscoveryController],
  providers: [
    CandidateQueueService,
    ChileConfidenceService,
    GraphSource,
    ContributorSource,
    DiscoveryService,
  ],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
