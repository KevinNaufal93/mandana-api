import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { StorageSettingsService } from './storage-settings.service';
import { StorageMapper } from './storage.mapper';
import { UpdateStorageSettingsDto } from './dto/update-storage-settings.dto';
import { StorageSettingsResponseDto } from './dto/storage-response.dto';

/** Singleton settings — GET/PATCH only, no POST/DELETE/`:id`. Mirrors
 * MovingSettingsAdminController exactly. */
@ApiTags('admin / storage')
@ApiBearerAuth()
@RequireModule(AccessModule.STORAGE)
@Controller('admin/storage/settings')
export class StorageSettingsAdminController {
  constructor(
    private readonly settingsService: StorageSettingsService,
    private readonly mapper: StorageMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the Smart Storage pricing policy' })
  @ApiOkResponse({ type: StorageSettingsResponseDto })
  async get() {
    const settings = await this.settingsService.get();
    return this.mapper.toSettingsDto(settings);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the Smart Storage pricing policy' })
  @ApiOkResponse({ type: StorageSettingsResponseDto })
  async update(@Body() dto: UpdateStorageSettingsDto) {
    const settings = await this.settingsService.update(dto);
    return this.mapper.toSettingsDto(settings);
  }
}
