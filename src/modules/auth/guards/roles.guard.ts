import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { REQUIRE_MODULE_KEY } from '../../../common/decorators/require-module.decorator';
import { UserRole } from '../../users/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AccessModule } from '../../../common/enums/access-module.enum';
import { RbacService } from '../../rbac/rbac.service';

/**
 * The single authorization gate, registered globally (see app.module.ts).
 * Understands two independent metadata kinds, either or both of which may
 * be set on a handler/class:
 *  - @Roles(...) — hard role check (e.g. UsersAdminController, RBAC admin
 *    endpoints themselves): never grantable away via the permission matrix.
 *  - @RequireModule(...) — RBAC module-grant check: admin always passes,
 *    any other role is checked against RbacService.
 *
 * Neither present -> route is open to any authenticated user (JwtAuthGuard
 * already ran first). @Public() short-circuits both, fixing a pre-existing
 * bug: a @Public() method inside a @Roles()/@RequireModule() class used to
 * crash here on `user.role` because JwtAuthGuard skips such routes, leaving
 * `request.user` undefined. That's why StorageAdminStreamController and
 * NotificationsAdminStreamController exist as separate controllers today —
 * this fix means a future stream route no longer needs that split.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    const requiredModule = this.reflector.getAllAndOverride<AccessModule>(
      REQUIRE_MODULE_KEY,
      targets,
    );

    if (!requiredRoles?.length && !requiredModule) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) return false;

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      return false;
    }
    if (!requiredModule) return true;

    // Admin short-circuits: never touches the DB, can never be locked out.
    if (user.role === UserRole.ADMIN) return true;
    return this.rbacService.hasModule(user.role, requiredModule);
  }
}
