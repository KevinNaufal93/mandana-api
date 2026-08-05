import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';

@ApiTags('admin / media')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload an image and generate responsive variants' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ) {
    return this.mediaService.upload(file, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a media asset and all its storage variants' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.mediaService.delete(id);
  }
}
