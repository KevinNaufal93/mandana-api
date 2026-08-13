import { PartialType } from '@nestjs/swagger';
import { CreateStorageFacilityDto } from './create-storage-facility.dto';

export class UpdateStorageFacilityDto extends PartialType(
  CreateStorageFacilityDto,
) {}
