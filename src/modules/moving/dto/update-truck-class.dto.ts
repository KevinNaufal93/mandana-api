import { PartialType } from '@nestjs/swagger';
import { CreateTruckClassDto } from './create-truck-class.dto';

export class UpdateTruckClassDto extends PartialType(CreateTruckClassDto) {}
