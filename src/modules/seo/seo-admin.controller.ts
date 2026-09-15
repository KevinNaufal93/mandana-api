import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { SeoService } from './seo.service';
import { SeoMapper } from './seo.mapper';
import { SeoPageKey } from './enums/seo-page-key.enum';
import { UpdateSeoSettingsDto } from './dto/update-seo-settings.dto';
import { UpdatePageSeoDto } from './dto/update-page-seo.dto';
import {
  PageSeoListResponseDto,
  PageSeoResponseDto,
  SeoSettingsResponseDto,
} from './dto/seo-response.dto';

@ApiTags('admin / seo')
@ApiBearerAuth()
@RequireModule(AccessModule.SEO)
@Controller('admin/seo')
export class SeoAdminController {
  constructor(
    private readonly seoService: SeoService,
    private readonly mapper: SeoMapper,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get the sitewide SEO/business settings' })
  @ApiOkResponse({ type: SeoSettingsResponseDto })
  async getSettings() {
    const settings = await this.seoService.getSettings();
    return this.mapper.toSettingsPayload(settings);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update the sitewide SEO/business settings' })
  @ApiOkResponse({ type: SeoSettingsResponseDto })
  async updateSettings(@Body() dto: UpdateSeoSettingsDto) {
    const settings = await this.seoService.updateSettings(dto);
    return this.mapper.toSettingsPayload(settings);
  }

  @Get('pages')
  @ApiOperation({
    summary: 'List SEO title/description/share-image for every fixed page',
  })
  @ApiOkResponse({ type: PageSeoListResponseDto })
  async getPages() {
    const pages = await this.seoService.getPages();
    return pages.map((p) => this.mapper.toPagePayload(p));
  }

  @Patch('pages/:pageKey')
  @ApiOperation({
    summary:
      'Update one page\'s SEO title/description/share-image. Rejects noIndex:true for "home".',
  })
  @ApiOkResponse({ type: PageSeoResponseDto })
  async updatePage(
    @Param('pageKey', new ParseEnumPipe(SeoPageKey)) pageKey: SeoPageKey,
    @Body() dto: UpdatePageSeoDto,
  ) {
    const page = await this.seoService.updatePage(pageKey, dto);
    return this.mapper.toPagePayload(page);
  }
}
