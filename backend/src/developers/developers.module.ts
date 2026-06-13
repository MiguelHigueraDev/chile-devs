import { Module } from '@nestjs/common';
import { DeveloperWriterService } from './developer-writer.service';

@Module({
  providers: [DeveloperWriterService],
  exports: [DeveloperWriterService],
})
export class DevelopersModule {}
