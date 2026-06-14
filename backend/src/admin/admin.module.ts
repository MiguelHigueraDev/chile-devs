import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiscoveryService } from '../discovery/discovery.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, DiscoveryService],
  exports: [AdminService],
})
export class AdminModule {}
