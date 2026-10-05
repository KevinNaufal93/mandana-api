import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { PropertySettingsService } from './property-settings.service';
import { UpdatePropertySettingsDto } from './dto/update-property-settings.dto';
import { PropertySettingsResponseDto } from './dto/property-settings-response.dto';

/** Singleton settings: GET/PATCH only. A separate path from
 *  /admin/properties so it can never be read as the :id route. */
@ApiTags('admin / properties')
@ApiBearerAuth()
@RequireModule(AccessModule.PROPERTIES)
@Controller('admin/property-settings')
export class PropertySettingsAdminController {
  constructor(private readonly settingsService: PropertySettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get the property settings (KPR rate and tenor)' })
  @ApiOkResponse({ type: PropertySettingsResponseDto })
  async get() {
    const settings = await this.settingsService.get();
    return this.settingsService.toDto(settings);
  }

  @Patch()
  @ApiOperation({
    summary: 'Update the property settings (KPR rate and tenor)',
  })
  @ApiOkResponse({ type: PropertySettingsResponseDto })
  async update(@Body() dto: UpdatePropertySettingsDto) {
    const settings = await this.settingsService.update(dto);
    return this.settingsService.toDto(settings);
  }
}
