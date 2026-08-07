import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { PropertiesService } from './properties.service';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { QueryAdminPropertiesDto } from './dto/query-admin-properties.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { UpdatePropertyImageDto } from './dto/update-property-image.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('properties')
@Public()
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List published properties with filters and pagination' })
  findAll(@Query() query: QueryPropertiesDto) {
    return this.propertiesService.findAll(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a single published property by slug' })
  findOne(@Param('slug') slug: string) {
    return this.propertiesService.findBySlug(slug);
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / properties')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/properties')
export class PropertiesAdminController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all properties with filters (admin, all statuses)' })
  findAll(@Query() query: QueryAdminPropertiesDto) {
    return this.propertiesService.adminFindAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a property by ID (admin)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.adminFindOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new property listing' })
  create(@Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a property listing' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a property listing' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.propertiesService.remove(id);
  }

  // ─── Image sub-resources ──────────────────────────────────────────────────

  @Post(':id/images')
  @ApiOperation({ summary: 'Upload and attach an image to a property' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  addImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AddPropertyImageDto,
  ) {
    return this.propertiesService.addImage(id, file, dto);
  }

  @Patch(':id/images/:imageId')
  @ApiOperation({ summary: 'Update image metadata (alt, sortOrder, isCover)' })
  updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdatePropertyImageDto,
  ) {
    return this.propertiesService.updateImage(id, imageId, dto);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a property image (removes S3 asset too)' })
  async removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    await this.propertiesService.removeImage(id, imageId);
  }
}
