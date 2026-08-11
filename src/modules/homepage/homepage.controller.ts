import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { HomepageService } from './homepage.service';

@ApiTags('homepage')
@Controller('homepage')
export class HomepageController {
  constructor(private readonly homepageService: HomepageService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aggregated homepage payload (hero, collections, recommendations)',
  })
  async getHomepage(@Res() res: Response) {
    const data = await this.homepageService.getHomepage();

    const etag = `"${createHash('md5').update(JSON.stringify(data)).digest('hex')}"`;
    const ifNoneMatch = res.req.headers['if-none-match'];

    if (ifNoneMatch === etag) {
      return res.status(304).end();
    }

    return res
      .set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      .set('ETag', etag)
      .json({ data });
  }
}
