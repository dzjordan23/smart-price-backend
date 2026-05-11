import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrawlerService } from './crawler.service';

@Module({
  imports: [ConfigModule],
  providers: [CrawlerService],
  exports: [CrawlerService],
})
export class CrawlerModule {}
