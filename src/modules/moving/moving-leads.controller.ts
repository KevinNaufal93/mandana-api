import {
  Body,
  Controller,
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MovingLeadsService } from './moving-leads.service';
import { MovingMapper } from './moving.mapper';
import { CreateMovingLeadDto } from './dto/create-moving-lead.dto';
import { QueryMovingLeadsDto } from './dto/query-moving-leads.dto';
import { UpdateMovingLeadDto } from './dto/update-moving-lead.dto';
import {
  MovingLeadAdminListResponseDto,
  MovingLeadAdminResponseDto,
  MovingLeadResponseDto,
} from './dto/moving-lead-response.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('moving')
@Public()
@Controller('moving/leads')
export class MovingLeadsController {
  constructor(
    private readonly leadsService: MovingLeadsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Capture a Moving Support lead — persists the configured order (truck, pickup, destinations, add-ons, price) the moment the customer commits to it, before the real conversation happens over WhatsApp.',
  })
  @ApiCreatedResponse({ type: MovingLeadResponseDto })
  async create(@Body() dto: CreateMovingLeadDto) {
    const lead = await this.leadsService.create(dto);
    return this.mapper.toLeadDto(lead);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / moving')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/moving/leads')
export class MovingLeadsAdminController {
  constructor(
    private readonly leadsService: MovingLeadsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List Moving Support leads (paginated; filter by status, capture-date range, and free-text search over reference / customer name / phone)',
  })
  @ApiOkResponse({ type: MovingLeadAdminListResponseDto })
  async findAll(@Query() query: QueryMovingLeadsDto) {
    const { data, meta } = await this.leadsService.findAllAdmin(query);
    return { data: data.map((l) => this.mapper.toLeadAdminDto(l)), meta };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a single Moving Support lead with its destinations and add-on lines',
  })
  @ApiOkResponse({ type: MovingLeadAdminResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const lead = await this.leadsService.findOneOrFail(id);
    return this.mapper.toLeadAdminDto(lead);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update a lead’s triage status and/or internal note — no confirm/reject flow, nothing here is reserved',
  })
  @ApiOkResponse({ type: MovingLeadAdminResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMovingLeadDto,
  ) {
    const lead = await this.leadsService.update(id, dto);
    return this.mapper.toLeadAdminDto(lead);
  }
}
