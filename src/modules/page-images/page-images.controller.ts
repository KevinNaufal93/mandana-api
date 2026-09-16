import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PageImagesService } from './page-images.service';
import { PageImageListResponseDto } from './dto/page-images-response.dto';

@ApiTags('page-images')
@Controller('page-images')
export class PageImagesController {
  constructor(private readonly pageImagesService: PageImagesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Admin-managed images for fixed pages (currently: Tentang Kami)',
  })
  @ApiOkResponse({ type: PageImageListResponseDto })
  async getPageImages() {
    return this.pageImagesService.getPublicPayload();
  }
}
