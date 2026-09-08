import { ApiProperty } from '@nestjs/swagger';
import { AccessModule } from '../../../common/enums/access-module.enum';
import { UserRole } from '../../users/enums/user-role.enum';

/**
 * Response-shape DTOs, declared purely so Swagger/OpenAPI can describe the
 * `{ data }` envelope the global `TransformInterceptor` wraps handler
 * returns in — same convention as event-support/dto/event-support-response.dto.ts.
 * Handlers keep returning bare objects; these classes exist only to drive
 * `@ApiOkResponse`.
 */

export class AccessModuleResponseDto {
  @ApiProperty({ enum: AccessModule }) key!: AccessModule;
  @ApiProperty() label!: string;
  @ApiProperty() description!: string;
  @ApiProperty({
    description: 'false = can never be granted to a non-admin role.',
  })
  grantable!: boolean;
  @ApiProperty({
    description: 'true = every active user has this module, admin or not.',
  })
  alwaysOn!: boolean;
}

export class RolePermissionsResponseDto {
  @ApiProperty({ enum: UserRole }) role!: UserRole;
  @ApiProperty({ enum: AccessModule, isArray: true }) modules!: AccessModule[];
  @ApiProperty({
    description:
      "true for 'admin' — its grant set is implicit-all and cannot be edited.",
  })
  locked!: boolean;
}
