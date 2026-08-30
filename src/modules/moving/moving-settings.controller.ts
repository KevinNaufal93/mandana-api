import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MovingSettingsService } from './moving-settings.service';
import { MovingMapper } from './moving.mapper';
import { UpdateMovingSettingsDto } from './dto/update-moving-settings.dto';
import { MovingSettingsResponseDto } from './dto/truck-class-response.dto';

/** Singleton settings — GET/PATCH only, no POST/DELETE/`:id`. */
@ApiTags('admin / moving')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/moving/settings')
export class MovingSettingsAdminController {
  constructor(
    private readonly settingsService: MovingSettingsService,
    private readonly mapper: MovingMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the Moving Support pricing policy' })
  @ApiOkResponse({ type: MovingSettingsResponseDto })
  async get() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the Moving Support pricing policy' })
  @ApiOkResponse({ type: MovingSettingsResponseDto })
  async update(@Body() dto: UpdateMovingSettingsDto) {
    const settings = await this.settingsService.update(dto);
    return this.mapper.toSettingsDto(settings);
  }
}
