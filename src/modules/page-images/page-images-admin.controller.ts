import { Body, Controller, Get, Param, ParseEnumPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { AccessModule } from '../../common/enums/access-module.enum';
import { PageImagesService } from './page-images.service';
import { PageImagesMapper } from './page-images.mapper';
import { PageImageSlot } from './enums/page-image-slot.enum';
import { UpdatePageImageDto } from './dto/update-page-image.dto';
import { PageImageListResponseDto, PageImageResponseDto } from './dto/page-images-response.dto';

/**
 * Gated by AccessModule.CONTENT_MEDIA, not a dedicated module — these
 * slots are managed from the admin's Content Media Management section
 * (a fixed-page tab alongside the Hero/Service/Promo content-block tabs),
 * by whoever already manages homepage imagery.
 */
@ApiTags('admin / page-images')
@ApiBearerAuth()
@RequireModule(AccessModule.CONTENT_MEDIA)
@Controller('admin/page-images')
export class PageImagesAdminController {
  constructor(
    private readonly pageImagesService: PageImagesService,
    private readonly mapper: PageImagesMapper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every fixed page-image slot' })
  @ApiOkResponse({ type: PageImageListResponseDto })
  async getSlots() {
    const slots = await this.pageImagesService.getSlots();
    return slots.map((s) => this.mapper.toPayload(s));
  }

  @Patch(':slotKey')
  @ApiOperation({ summary: "Update one slot's image" })
  @ApiOkResponse({ type: PageImageResponseDto })
  async updateSlot(
    @Param('slotKey', new ParseEnumPipe(PageImageSlot)) slotKey: PageImageSlot,
    @Body() dto: UpdatePageImageDto,
  ) {
    const slot = await this.pageImagesService.updateSlot(slotKey, dto);
    return this.mapper.toPayload(slot);
  }
}
