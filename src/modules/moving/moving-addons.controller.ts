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
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MovingAddonsService } from './moving-addons.service';
import { MovingMapper } from './moving.mapper';
import { CreateMovingAddonDto } from './dto/create-moving-addon.dto';
import { UpdateMovingAddonDto } from './dto/update-moving-addon.dto';
import { QueryMovingAddonsDto } from './dto/query-moving-addons.dto';
import {
  MovingAddonListResponseDto,
  MovingAddonResponseDto,
} from './dto/truck-class-response.dto';

@ApiTags('admin / moving')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/moving/addons')
export class MovingAddonsAdminController {
  constructor(
    private readonly addonsService: MovingAddonsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all moving add-ons, including inactive' })
  @ApiOkResponse({ type: MovingAddonListResponseDto })
  async findAll(@Query() query: QueryMovingAddonsDto) {
    const addons = await this.addonsService.findAllAdmin(query.isActive);
    return addons.map((a) => this.mapper.toAddonDto(a));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single moving add-on' })
  @ApiOkResponse({ type: MovingAddonResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const addon = await this.addonsService.findOneOrFail(id);
    return this.mapper.toAddonDto(addon);
  }

  @Post()
  @ApiOperation({ summary: 'Create a moving add-on' })
  @ApiOkResponse({ type: MovingAddonResponseDto })
  async create(@Body() dto: CreateMovingAddonDto) {
    const addon = await this.addonsService.create(dto);
    return this.mapper.toAddonDto(addon);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a moving add-on' })
  @ApiOkResponse({ type: MovingAddonResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovingAddonDto,
  ) {
    const addon = await this.addonsService.update(id, dto);
    return this.mapper.toAddonDto(addon);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a moving add-on' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.addonsService.remove(id);
  }
}
