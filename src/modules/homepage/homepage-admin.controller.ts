import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { HomepageService } from './homepage.service';
import { HomepageCacheService } from './homepage-cache.service';
import { SetRecommendationsDto } from './dto/set-recommendations.dto';

@ApiTags('admin / homepage')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/homepage')
export class HomepageAdminController {
  constructor(
    private readonly homepageService: HomepageService,
    private readonly cacheService: HomepageCacheService,
  ) {}

  @Get('recommendations')
  @ApiOperation({ summary: 'List current homepage recommendations (admin)' })
  getRecommendations() {
    return this.homepageService.getRecommendations();
  }

  @Post('recommendations')
  @ApiOperation({ summary: 'Set homepage recommendations (replaces entire list)' })
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
