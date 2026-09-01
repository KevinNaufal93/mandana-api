import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { MediaPurpose } from './enums/media-purpose.enum';

const MAX_RASTER_MB = 20;

@ApiTags('admin / media')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOperation({
    summary:
      'Browse uploaded media assets (admin picker) — filter by purpose or by unused',
  })
  findAllAdmin(@Query() query: QueryMediaDto) {
    return this.mediaService.findAllAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one media asset' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.findOneOrFail(id);
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload an image (or SVG icon) and generate responsive variants',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'purpose'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: `Image file. JPEG/PNG/WebP up to ${MAX_RASTER_MB} MB for any purpose; SVG up to 512 KB, icon purpose only (rasterized on upload — see purpose).`,
        },
        purpose: {
          type: 'string',
          enum: Object.values(MediaPurpose),
          description:
            'Determines the generated width ladder and formats. SVG is only accepted when purpose=icon.',
        },
        alt: { type: 'string', description: 'Alt text for accessibility' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_RASTER_MB * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ) {
    return this.mediaService.upload(file, dto);
  }

  @Post('backfill-placeholders')
  @ApiOperation({
    summary:
      'One-off, idempotent: generate LQIP placeholders for assets uploaded before that column existed',
  })
  backfillPlaceholders() {
    return this.mediaService.backfillPlaceholders();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a media asset and all its storage variants',
    description:
      'Returns 409 if the asset is still referenced by a hero slide, property image, or any other owning record — detach it first.',
  })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.mediaService.delete(id);
  }
}
