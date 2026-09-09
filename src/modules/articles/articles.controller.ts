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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { User } from '../users/entities/user.entity';
import { ArticlesService } from './articles.service';
import { QueryArticlesDto } from './dto/query-articles.dto';
import { QueryAdminArticlesDto } from './dto/query-admin-articles.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleDetailResponseDto } from './dto/article-response.dto';

// ─── Public controller ──────────────────────────────────────────────────────

@ApiTags('articles')
@Public()
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({ summary: 'List published articles with pagination' })
  findAll(@Query() query: QueryArticlesDto) {
    return this.articlesService.findAll(query);
  }

  // Declared before ':slug' — otherwise Nest would route "related" as a slug.
  @Get(':slug/related')
  @ApiOperation({
    summary:
      'Get articles related to the given one (same category first, ' +
      'newest, falling back to other published articles). Never 404s — an ' +
      'unknown slug just returns an empty array.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Default 3, max 12',
  })
  findRelated(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.articlesService.findRelated(
      slug,
      limit ? Number(limit) : undefined,
    );
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a single published article by slug' })
  @ApiOkResponse({ type: ArticleDetailResponseDto })
  findOne(@Param('slug') slug: string) {
    return this.articlesService.findBySlug(slug);
  }
}

// ─── Admin controller ───────────────────────────────────────────────────────

@ApiTags('admin / articles')
@ApiBearerAuth()
@RequireModule(AccessModule.ARTICLES)
@Controller('admin/articles')
export class ArticlesAdminController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all articles with filters (admin, all statuses)',
  })
  findAll(@Query() query: QueryAdminArticlesDto) {
    return this.articlesService.adminFindAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an article by ID (admin)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.articlesService.adminFindOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new article (author defaults to the creating admin)',
  })
  create(@Body() dto: CreateArticleDto, @CurrentUser() currentUser: User) {
    return this.articlesService.create(dto, currentUser);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an article' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an article' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.articlesService.remove(id);
  }
}
