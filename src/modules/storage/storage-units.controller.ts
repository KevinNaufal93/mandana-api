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
import { StorageUnitsService } from './storage-units.service';
import { StorageMapper } from './storage.mapper';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { BulkCreateStorageUnitsDto } from './dto/bulk-create-storage-units.dto';
import { QueryStorageUnitsDto } from './dto/query-storage-units.dto';
import {
  StorageUnitAdminListResponseDto,
  StorageUnitListResponseDto,
  StorageUnitResponseDto,
} from './dto/storage-response.dto';

@ApiTags('admin / storage')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/storage/units')
export class StorageUnitsController {
  constructor(
    private readonly unitsService: StorageUnitsService,
    private readonly mapper: StorageMapper,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List individual storage units (paginated, filterable by facility/unit type/status)',
  })
  @ApiOkResponse({ type: StorageUnitAdminListResponseDto })
  async findAll(@Query() query: QueryStorageUnitsDto) {
    const { data, meta } = await this.unitsService.findAllAdmin(query);
    return { data: data.map((u) => this.mapper.toUnitDto(u)), meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single storage unit' })
  @ApiOkResponse({ type: StorageUnitResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const unit = await this.unitsService.findOneOrFail(id);
    return this.mapper.toUnitDto(unit);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single storage unit' })
  @ApiOkResponse({ type: StorageUnitResponseDto })
  async create(@Body() dto: CreateStorageUnitDto) {
    const unit = await this.unitsService.create(dto);
    return this.mapper.toUnitDto(unit);
  }

  @Post('bulk')
  @ApiOperation({
    summary:
      'Add N units of one type to a facility, auto-numbered from the next free sequence',
  })
  @ApiOkResponse({ type: StorageUnitListResponseDto })
  async bulkCreate(@Body() dto: BulkCreateStorageUnitsDto) {
    const units = await this.unitsService.bulkCreate(dto);
    return units.map((u) => this.mapper.toUnitDto(u));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a storage unit (status, position, code, ...)',
  })
  @ApiOkResponse({ type: StorageUnitResponseDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageUnitDto,
  ) {
    const unit = await this.unitsService.update(id, dto);
    return this.mapper.toUnitDto(unit);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a storage unit' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.unitsService.remove(id);
  }
}
