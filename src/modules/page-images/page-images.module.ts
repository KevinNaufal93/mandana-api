import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageImage } from './entities/page-image.entity';
import { PageImagesService } from './page-images.service';
import { PageImagesMapper } from './page-images.mapper';
import { PageImagesCacheService } from './page-images-cache.service';
import { PageImagesController } from './page-images.controller';
import { PageImagesAdminController } from './page-images-admin.controller';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [TypeOrmModule.forFeature([PageImage]), MediaModule],
  providers: [PageImagesService, PageImagesMapper, PageImagesCacheService],
  controllers: [PageImagesController, PageImagesAdminController],
})
export class PageImagesModule {}
