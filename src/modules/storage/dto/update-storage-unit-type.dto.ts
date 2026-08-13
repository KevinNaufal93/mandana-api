import { PartialType } from '@nestjs/swagger';
import { CreateStorageUnitTypeDto } from './create-storage-unit-type.dto';

export class UpdateStorageUnitTypeDto extends PartialType(
  CreateStorageUnitTypeDto,
) {}
