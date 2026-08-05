import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Collection } from './entities/collection.entity';
import { CollectionProperty } from './entities/collection-property.entity';
import { CollectionsService } from './collections.service';
import { CollectionsController, CollectionsAdminController } from './collections.controller';
import { HomepageCacheModule } from '../homepage/homepage-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Collection, CollectionProperty]),
    HomepageCacheModule,
  ],
  providers: [CollectionsService],
  controllers: [CollectionsController, CollectionsAdminController],
  exports: [CollectionsService],
})
export class CollectionsModule {}
