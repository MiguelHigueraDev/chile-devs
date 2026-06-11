import { Module } from '@nestjs/common';
import { QueryParserService } from './query-parser.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, QueryParserService],
})
export class SearchModule {}
