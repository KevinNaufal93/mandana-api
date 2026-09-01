import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentBlock } from './entities/content-block.entity';
import { ContentBlocksService } from './content-blocks.service';
import { ContentBlocksMapper } from './content-blocks.mapper';
import { ContentBlocksController } from './content-blocks.controller';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContentBlock]),
    HomepageCacheModule,
    MediaModule,
  ],
  providers: [ContentBlocksService, ContentBlocksMapper],
  controllers: [ContentBlocksController],
  exports: [ContentBlocksService],
})
export class ContentBlocksModule {}
