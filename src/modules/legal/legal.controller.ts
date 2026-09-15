import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { LegalService } from './legal.service';
import { LegalPageKey } from './enums/legal-page-key.enum';
import { LegalPageResponseDto } from './dto/legal-response.dto';

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Public()
  @Get(':pageKey')
  @ApiOperation({ summary: 'One legal page (privacy policy or terms) by key' })
  @ApiOkResponse({ type: LegalPageResponseDto })
  async getPage(@Param('pageKey', new ParseEnumPipe(LegalPageKey)) pageKey: LegalPageKey) {
    return this.legalService.getPublicPage(pageKey);
  }
}
