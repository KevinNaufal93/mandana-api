import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { EventSupportSettingsService } from './event-support-settings.service';
import { EventSupportMapper } from './event-support.mapper';
import { UpdateEventSupportSettingsDto } from './dto/update-event-support-settings.dto';
import { EventSupportSettingsResponseDto } from './dto/event-support-response.dto';

/** Singleton settings — GET/PATCH only, no POST/DELETE/`:id`. Same pattern
 * as moving/moving-settings.controller.ts. */
@ApiTags('admin / event-support')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/event-support/settings')
export class EventSupportSettingsAdminController {
  constructor(
    private readonly settingsService: EventSupportSettingsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the Event Support hourly-pricing policy' })
  @ApiOkResponse({ type: EventSupportSettingsResponseDto })
  async get() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the Event Support hourly-pricing policy' })
  @ApiOkResponse({ type: EventSupportSettingsResponseDto })
  async update(@Body() dto: UpdateEventSupportSettingsDto) {
    const settings = await this.settingsService.update(dto);
    return this.mapper.toSettingsDto(settings);
  }
}
