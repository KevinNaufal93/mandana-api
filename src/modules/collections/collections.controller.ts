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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddCollectionPropertyDto } from './dto/add-collection-property.dto';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Get a collection with its property listings (public)',
  })
  findBySlug(@Param('slug') slug: string) {
    return this.collectionsService.findBySlug(slug);
  }
}

@ApiTags('admin / collections')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/collections')
export class CollectionsAdminController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all collections (admin)' })
  findAll() {
    return this.collectionsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a collection' })
  create(@Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a collection' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCollectionDto,
  ) {
    return this.collectionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.collectionsService.remove(id);
  }

  @Post(':id/properties')
  @ApiOperation({ summary: 'Add a property to a collection' })
  addProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCollectionPropertyDto,
  ) {
    return this.collectionsService.addProperty(id, dto);
  }

  @Delete(':id/properties/:propertyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a property from a collection' })
  async removeProperty(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
  ) {
    await this.collectionsService.removeProperty(id, propertyId);
  }
}
