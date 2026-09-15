import { Body, Controller, Get, Param, ParseEnumPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { LegalService } from './legal.service';
import { LegalMapper } from './legal.mapper';
import { LegalPageKey } from './enums/legal-page-key.enum';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';
import { LegalPageListResponseDto, LegalPageResponseDto } from './dto/legal-response.dto';

/**
 * Gated by AccessModule.SEO, not a dedicated module — legal pages are
 * managed from the same admin SEO section (a third tab, see the SEO plan,
 * §11.5) by whoever already manages page titles/descriptions. Splitting
 * this into its own permission is an easy follow-up if legal text ever
 * needs tighter access than the rest of SEO.
 */
@ApiTags('admin / legal')
@ApiBearerAuth()
@RequireModule(AccessModule.SEO)
@Controller('admin/legal')
export class LegalAdminController {
  constructor(
    private readonly legalService: LegalService,
    private readonly mapper: LegalMapper,
  ) {}

  @Get('pages')
  @ApiOperation({ summary: 'List both legal pages' })
  @ApiOkResponse({ type: LegalPageListResponseDto })
  async getPages() {
    const pages = await this.legalService.getPages();
    return pages.map((p) => this.mapper.toPayload(p));
  }

  @Patch('pages/:pageKey')
  @ApiOperation({ summary: "Update one legal page's title/body" })
  @ApiOkResponse({ type: LegalPageResponseDto })
  async updatePage(
    @Param('pageKey', new ParseEnumPipe(LegalPageKey)) pageKey: LegalPageKey,
    @Body() dto: UpdateLegalPageDto,
  ) {
    const page = await this.legalService.updatePage(pageKey, dto);
    return this.mapper.toPayload(page);
  }
}
