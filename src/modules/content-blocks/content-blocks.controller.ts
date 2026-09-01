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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ContentBlocksService } from './content-blocks.service';
import { ContentBlocksMapper } from './content-blocks.mapper';
import { CreateContentBlockDto } from './dto/create-content-block.dto';
import { UpdateContentBlockDto } from './dto/update-content-block.dto';
import { QueryContentBlocksDto } from './dto/query-content-blocks.dto';

// No public route here, same as hero_slides/service_cards before it — the
// landing page consumes these exclusively through GET /homepage's cached,
// per-type payload (see HomepageService), never this controller directly.
@ApiTags('admin / content-blocks')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/content-blocks')
export class ContentBlocksController {
  constructor(
    private readonly contentBlocksService: ContentBlocksService,
    private readonly mapper: ContentBlocksMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List content blocks (admin) — hero slides, service cards, etc. Filter with ?type=',
  })
  async findAll(@Query() query: QueryContentBlocksDto) {
    const blocks = await this.contentBlocksService.findAll(query);
    return blocks.map((b) => this.mapper.toDto(b));
  }

  @Post()
  @ApiOperation({ summary: 'Create a content block' })
  async create(@Body() dto: CreateContentBlockDto) {
    return this.mapper.toDto(await this.contentBlocksService.create(dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a content block' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentBlockDto,
  ) {
    return this.mapper.toDto(await this.contentBlocksService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content block' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.contentBlocksService.remove(id);
  }
}
