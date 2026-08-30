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
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MovingService } from './moving.service';
import { MovingAddonsService } from './moving-addons.service';
import { MovingSettingsService } from './moving-settings.service';
import { MovingMapper } from './moving.mapper';
import { CreateTruckClassDto } from './dto/create-truck-class.dto';
import { UpdateTruckClassDto } from './dto/update-truck-class.dto';
import { QueryTruckClassesDto } from './dto/query-truck-classes.dto';
import { QuoteMovingDto } from './dto/quote-moving.dto';
import {
  MovingAddonListResponseDto,
  MovingQuoteResponseDto,
  MovingSettingsResponseDto,
  TruckClassListResponseDto,
  TruckClassResponseDto,
} from './dto/truck-class-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('moving')
@Public()
@Controller('moving')
export class MovingController {
  constructor(
    private readonly movingService: MovingService,
    private readonly addonsService: MovingAddonsService,
    private readonly settingsService: MovingSettingsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get('truck-classes')
  @ApiOperation({
    summary: 'List active truck classes for the Moving Support page',
  })
  @ApiOkResponse({ type: TruckClassListResponseDto })
  async findAllTruckClasses() {
    const trucks = await this.movingService.findAllPublic();
    return trucks.map((t) => this.mapper.toDto(t));
  }

  @Get('addons')
  @ApiOperation({
    summary:
      'List active add-on fees (helper, packaging, waiting, insurance, toll) for the Moving Support page',
  })
  @ApiOkResponse({ type: MovingAddonListResponseDto })
  async findAllAddons() {
    const addons = await this.addonsService.findAllPublic();
    return addons.map((a) => this.mapper.toAddonDto(a));
  }

  @Get('pricing-config')
  @ApiOperation({
    summary:
      'Pricing policy (rounding step, ± estimate band, fallback included-km) — fetch these instead of hardcoding them client-side',
  })
  @ApiOkResponse({ type: MovingSettingsResponseDto })
  async getPricingConfig() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Compute an authoritative price band for a truck class + road distance, plus any selected add-ons',
  })
  @ApiOkResponse({ type: MovingQuoteResponseDto })
  quote(@Body() dto: QuoteMovingDto) {
    return this.movingService.quote(dto);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / moving')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/moving/truck-classes')
export class MovingAdminController {
  constructor(
    private readonly movingService: MovingService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all truck classes, including inactive' })
  @ApiOkResponse({ type: TruckClassListResponseDto })
  async findAll(@Query() query: QueryTruckClassesDto) {
    const trucks = await this.movingService.findAllAdmin(query.isActive);
    return trucks.map((t) => this.mapper.toDto(t));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single truck class' })
  @ApiOkResponse({ type: TruckClassResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const truck = await this.movingService.findOneOrFail(id);
    return this.mapper.toDto(truck);
  }

  @Post()
  @ApiOperation({ summary: 'Create a truck class' })
  @ApiOkResponse({ type: TruckClassResponseDto })
  async create(@Body() dto: CreateTruckClassDto) {
    const truck = await this.movingService.create(dto);
    return this.mapper.toDto(truck);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a truck class' })
  @ApiOkResponse({ type: TruckClassResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTruckClassDto,
  ) {
    const truck = await this.movingService.update(id, dto);
    return this.mapper.toDto(truck);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a truck class' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.movingService.remove(id);
  }
}
