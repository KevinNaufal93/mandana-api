import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { ArticlesService } from './articles.service';
import { ArticleCategoriesService } from './article-categories.service';
import { CreateArticleCategoryDto } from './dto/create-article-category.dto';
import { UpdateArticleCategoryDto } from './dto/update-article-category.dto';

// ─── Public controller ──────────────────────────────────────────────────────
// Its own top-level route (not nested under /articles) — matches the
// contract's URL and property-types.controller.ts's precedent for a
// lookup-table sibling to the main resource controller.

@ApiTags('article-categories')
@Public()
@Controller('article-categories')
export class ArticleCategoriesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({
    summary: 'List article categories that have at least one published article',
  })
  findAll() {
    return this.articlesService.findPublicCategories();
  }
}

// ─── Admin controller ───────────────────────────────────────────────────────

@ApiTags('admin / article-categories')
@ApiBearerAuth()
@RequireModule(AccessModule.ARTICLES)
@Controller('admin/article-categories')
export class ArticleCategoriesAdminController {
  constructor(
    private readonly articleCategoriesService: ArticleCategoriesService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List all article categories, regardless of whether they have any ' +
      "published articles — the source for the article create/edit form's " +
      'category dropdown',
  })
  findAll() {
    return this.articleCategoriesService.findAllAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an article category by ID (admin)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleCategoriesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new article category' })
  create(@Body() dto: CreateArticleCategoryDto) {
    return this.articleCategoriesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an article category' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleCategoryDto,
  ) {
    return this.articleCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete an article category (rejected if any articles still use it)',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.articleCategoriesService.remove(id);
  }
}
