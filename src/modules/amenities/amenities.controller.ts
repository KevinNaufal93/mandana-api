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
import { AmenitiesService } from './amenities.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';

// ─── Public controller ────────────────────────────────────────────────────────

@ApiTags('amenities')
@Public()
@Controller('amenities')
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all amenities / facilities' })
  findAll() {
    return this.amenitiesService.findAll();
  }
}

// ─── Admin controller ─────────────────────────────────────────────────────────

@ApiTags('admin / amenities')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/amenities')
export class AmenitiesAdminController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new amenity' })
  create(@Body() dto: CreateAmenityDto) {
    return this.amenitiesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an amenity' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmenityDto,
  ) {
    return this.amenitiesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an amenity' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.amenitiesService.remove(id);
  }
}
