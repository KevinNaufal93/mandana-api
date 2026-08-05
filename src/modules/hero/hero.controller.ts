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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { HeroService } from './hero.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@ApiTags('admin / hero')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/hero-slides')
export class HeroController {
  constructor(private readonly heroService: HeroService) {}

  @Get()
  @ApiOperation({ summary: 'List all hero slides (admin)' })
  findAll() {
    return this.heroService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new hero slide' })
  create(@Body() dto: CreateHeroSlideDto) {
    return this.heroService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a hero slide' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHeroSlideDto,
  ) {
    return this.heroService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a hero slide' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.heroService.remove(id);
  }
}
