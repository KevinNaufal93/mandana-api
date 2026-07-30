import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PropertiesService } from './properties.service';

@ApiTags('property-types')
@Public()
@Controller('property-types')
export class PropertyTypesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all property types / categories' })
  findAll() {
    return this.propertiesService.findAllTypes();
  }
}
