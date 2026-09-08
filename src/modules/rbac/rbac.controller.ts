import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { ACCESS_MODULES } from '../../common/enums/access-module.enum';
import { RbacService } from './rbac.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import {
  AccessModuleResponseDto,
  RolePermissionsResponseDto,
} from './dto/rbac-response.dto';

/**
 * RBAC administration itself is gated with a hard @Roles(UserRole.ADMIN),
 * not @RequireModule() — deliberately, so it can never be granted away
 * through the very matrix it manages.
 */
@ApiTags('admin / rbac')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('modules')
  @ApiOperation({ summary: 'List the product module catalog' })
  @ApiOkResponse({ type: AccessModuleResponseDto, isArray: true })
  getModules() {
    return ACCESS_MODULES;
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Get the full role x module permission matrix' })
  @ApiOkResponse({ type: RolePermissionsResponseDto, isArray: true })
  getPermissions() {
    return this.rbacService.getMatrix();
  }

  @Put('permissions/:role')
  @ApiOperation({
    summary:
      "Replace one role's granted modules. Rejects role 'admin' and any non-grantable module.",
  })
  @ApiOkResponse({ type: RolePermissionsResponseDto })
  updatePermissions(
    @Param('role', new ParseEnumPipe(UserRole)) role: UserRole,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rbacService.setRoleModules(role, dto.modules);
  }
}
