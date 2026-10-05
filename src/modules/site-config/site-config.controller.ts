import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { SiteConfigService } from './site-config.service';
import { SiteConfigResponseDto } from './dto/site-config-response.dto';

@ApiTags('site-config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'WhatsApp number per line of business + KPR simulator rate and tenor, for the public website',
  })
  @ApiOkResponse({ type: SiteConfigResponseDto })
  async getSiteConfig(@Res() res: Response): Promise<void> {
    const data = await this.siteConfigService.getPublicPayload();

    // Same ETag/304 shape as SeoController.getSeo(); see that
    // controller's comment on why res.json()/.end() must not be
    // `return`ed through the global ClassSerializerInterceptor.
    const etag = `"${createHash('md5').update(JSON.stringify(data)).digest('hex')}"`;
    const ifNoneMatch = res.req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    // Short max-age (60s vs the SEO endpoint's 300s): an admin edit to a
    // WhatsApp number should reach the site within about a minute.
    res
      .set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')
      .set('ETag', etag)
      .json({ data });
  }
}
