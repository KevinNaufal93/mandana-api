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
  async getHomepage(@Res() res: Response): Promise<void> {
    const data = await this.homepageService.getHomepage();

    const etag = `"${createHash('md5').update(JSON.stringify(data)).digest('hex')}"`;
    const ifNoneMatch = res.req.headers['if-none-match'];

    // Must not `return` the res chain — see the identical, longer comment
    // in StorageController.getAvailability(): res.json()/.end() return
    // `this`, and passing that through the global
    // ClassSerializerInterceptor crashes deep in Node's http internals.
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    res
      .set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
      .set('ETag', etag)
      .json({ data });
  }
}
