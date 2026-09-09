import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from './entities/article.entity';
import { ArticleCategory } from './entities/article-category.entity';
import { ArticlesService } from './articles.service';
import { ArticleCategoriesService } from './article-categories.service';
import {
  ArticlesController,
  ArticlesAdminController,
} from './articles.controller';
import {
  ArticleCategoriesController,
  ArticleCategoriesAdminController,
} from './article-categories.controller';
import { ArticleMapper } from './article.mapper';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleCategory]),
    MediaModule, // for ArticleMapper's MediaService.buildImageDto() calls
  ],
  providers: [ArticlesService, ArticleCategoriesService, ArticleMapper],
  controllers: [
    ArticlesController,
    ArticlesAdminController,
    ArticleCategoriesController,
    ArticleCategoriesAdminController,
  ],
})
export class ArticlesModule {}
