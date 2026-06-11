import { Controller, Post } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('api/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post()
  async triggerSync() {
    return this.syncService.runSync();
  }
}
