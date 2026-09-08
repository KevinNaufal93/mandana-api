import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum } from 'class-validator';
import { AccessModule } from '../../../common/enums/access-module.enum';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    enum: AccessModule,
    isArray: true,
    description:
      'Full replacement set of granted modules for this role. Non-grantable ' +
      "modules (e.g. 'users') and role 'admin' are rejected — see RbacService.setRoleModules.",
  })
  @IsArray()
  @IsEnum(AccessModule, { each: true })
  modules!: AccessModule[];
}
