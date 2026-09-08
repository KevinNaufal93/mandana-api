import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { EventSupportSettingsService } from './event-support-settings.service';
import { EventSupportMapper } from './event-support.mapper';
import { UpdateEventSupportSettingsDto } from './dto/update-event-support-settings.dto';
import { EventSupportSettingsResponseDto } from './dto/event-support-response.dto';

/** Singleton settings — GET/PATCH only, no POST/DELETE/`:id`. Same pattern
 * as moving/moving-settings.controller.ts. */
@ApiTags('admin / event-support')
@ApiBearerAuth()
@RequireModule(AccessModule.EVENT_SUPPORT)
@Controller('admin/event-support/settings')
export class EventSupportSettingsAdminController {
  constructor(
    private readonly settingsService: EventSupportSettingsService,
    private readonly mapper: EventSupportMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the Event Support commercial settings' })
  @ApiOkResponse({ type: EventSupportSettingsResponseDto })
  async get() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the Event Support commercial settings' })
  @ApiOkResponse({ type: EventSupportSettingsResponseDto })
  async update(@Body() dto: UpdateEventSupportSettingsDto) {
    const settings = await this.settingsService.update(dto);
    return this.mapper.toSettingsDto(settings);
  }
}
