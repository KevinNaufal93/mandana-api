import { PartialType } from '@nestjs/swagger';
import { CreateStorageUnitDto } from './create-storage-unit.dto';

export class UpdateStorageUnitDto extends PartialType(CreateStorageUnitDto) {}
