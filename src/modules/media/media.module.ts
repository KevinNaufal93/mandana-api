import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { StorageService } from './storage.service';
import { ImageProcessorService } from './image-processor.service';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset])],
  providers: [StorageService, ImageProcessorService, MediaService],
  controllers: [MediaController],
  exports: [MediaService, StorageService],
})
export class MediaModule {}
