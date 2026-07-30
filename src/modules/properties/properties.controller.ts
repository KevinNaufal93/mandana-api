import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PropertiesService } from './properties.service';
import { QueryPropertiesDto } from './dto/query-properties.dto';

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
