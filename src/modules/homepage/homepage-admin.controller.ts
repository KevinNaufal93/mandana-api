import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { HomepageService } from './homepage.service';
import { HomepageCacheService } from './homepage-cache.service';
import { SetRecommendationsDto } from './dto/set-recommendations.dto';

@ApiTags('admin / homepage')
@ApiBearerAuth()
@RequireModule(AccessModule.CONTENT_MEDIA)
@Controller('admin/homepage')
export class HomepageAdminController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly cacheService: HomepageCacheService,
  ) {}

  @Get('recommendations')
  @ApiOperation({
    summary:
      'List current homepage recommendations (admin) — the public Unggulan (isFeatured) properties',
  })
  getRecommendations() {
    return this.homepageService.getRecommendations();
  }

  @Post('recommendations')
  @ApiOperation({
    summary:
      'Deprecated, no effect on the site: the homepage now shows Unggulan (isFeatured) properties',
    deprecated: true,
  })
  setRecommendations(@Body() dto: SetRecommendationsDto) {
    return this.homepageService.setRecommendations(dto);
  }

  @Post('cache/bust')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Manually bust the homepage Redis cache' })
  async bustCache() {
    await this.cacheService.bust();
  }
}
