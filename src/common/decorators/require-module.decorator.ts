import { SetMetadata } from '@nestjs/common';
import { AccessModule } from '../enums/access-module.enum';

/**
 * Gates a controller/route behind the RBAC module grant matrix instead of a
 * hard role check. An `admin` caller always passes (short-circuited in
 * RolesGuard); any other role must have `module` granted via
 * RbacService/admin-rbac endpoints. Use @Roles(UserRole.ADMIN) instead for
 * routes that must never be grantable away from admin (e.g. user
 * management, RBAC administration itself).
 */
export const REQUIRE_MODULE_KEY = 'requireModule';
export const RequireModule = (module: AccessModule) =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
