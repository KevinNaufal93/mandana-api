import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { SeoService } from './seo.service';
import { SeoPayloadResponseDto } from './dto/seo-response.dto';

@ApiTags('seo')
@Controller('seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sitewide SEO settings + per-page title/description/share-image overrides',
  })
  @ApiOkResponse({ type: SeoPayloadResponseDto })
  async getSeo(@Res() res: Response): Promise<void> {
    const data = await this.seoService.getPublicPayload();

    // Same ETag/304 shape as HomepageController.getHomepage() — see that
    // controller's own comment on why res.json()/.end() must not be
    // `return`ed through the global ClassSerializerInterceptor.
    const etag = `"${createHash('md5').update(JSON.stringify(data)).digest('hex')}"`;
    const ifNoneMatch = res.req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .set('ETag', etag)
      .json({ data });
  }
}
