import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { RoleModulePermission } from './entities/role-module-permission.entity';
import { UserRole } from '../users/enums/user-role.enum';
import {
  ACCESS_MODULES,
  AccessModule,
  ALWAYS_ON_MODULES,
  GRANTABLE_MODULES,
} from '../../common/enums/access-module.enum';
import { RolePermissionsResponseDto } from './dto/rbac-response.dto';

const CACHE_KEY = (role: UserRole) => `rbac:modules:${role}`;
/** Safety net only — every write path explicitly invalidates the key it
 *  touches (see setRoleModules), so this TTL is what bounds staleness in
 *  the case that invalidation itself is ever missed. */
const CACHE_TTL_MS = 300_000;

/**
 * Grants are tiny (one non-admin role x a handful of modules) but read on
 * every guarded request via RolesGuard, so they're cached in the same
 * Redis-backed cacheManager JwtStrategy already uses for the logout
 * blacklist — a plain in-memory Map would go stale across instances.
 */
@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(RoleModulePermission)
    private readonly repo: Repository<RoleModulePermission>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Admin is implicit-all and never touches the DB or cache — it can never
   * be locked out by a missing row, a bad write, or a cache miss.
   */
  async getGrantedModules(role: UserRole): Promise<AccessModule[]> {
    if (role === UserRole.ADMIN) {
      return ACCESS_MODULES.map((m) => m.key);
    }

    const cached = await this.cacheManager.get<AccessModule[]>(CACHE_KEY(role));
    if (cached) return cached;

    const rows = await this.repo.find({ where: { role } });
    const modules = Array.from(
      new Set<AccessModule>([
        ...rows.map((r) => r.module),
        ...ALWAYS_ON_MODULES,
      ]),
    );

    await this.cacheManager.set(CACHE_KEY(role), modules, CACHE_TTL_MS);
    return modules;
  }

  async hasModule(role: UserRole, module: AccessModule): Promise<boolean> {
    const granted = await this.getGrantedModules(role);
    return granted.includes(module);
  }

  async getMatrix(): Promise<RolePermissionsResponseDto[]> {
    return Promise.all(
      Object.values(UserRole).map(async (role) => ({
        role,
        modules: await this.getGrantedModules(role),
        locked: role === UserRole.ADMIN,
      })),
    );
  }

  async setRoleModules(
    role: UserRole,
    modules: AccessModule[],
  ): Promise<RolePermissionsResponseDto> {
    if (role === UserRole.ADMIN) {
      throw new BadRequestException(
        "Role 'admin' has implicit access to every module and cannot be edited.",
      );
    }

    // Always-on modules (e.g. 'dashboard') are a no-op here, not an error:
    // they're unioned into every read regardless of what's stored (see
    // getGrantedModules), and the RBAC page's UI always shows them checked,
    // so the natural "PUT back what GET returned" replace-the-set pattern
    // must not be rejected for including one. Only a module that is
    // genuinely non-grantable (users, notifications, rbac) is a real error.
    const requested = modules.filter((m) => !ALWAYS_ON_MODULES.includes(m));

    const nonGrantable = requested.filter(
      (m) => !GRANTABLE_MODULES.includes(m),
    );
    if (nonGrantable.length > 0) {
      throw new BadRequestException(
        `The following modules cannot be granted: ${nonGrantable.join(', ')}`,
      );
    }

    // DELETE + INSERT in one transaction so a concurrent read never sees
    // this role with zero grant rows mid-write. Always-on modules are
    // never persisted as rows — they're never revocable via a bad write
    // or a stray DELETE precisely because they don't depend on one.
    const unique = Array.from(new Set(requested));
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(RoleModulePermission, { role });
      if (unique.length > 0) {
        await manager.insert(
          RoleModulePermission,
          unique.map((module) => ({ role, module })),
        );
      }
    });

    await this.cacheManager.del(CACHE_KEY(role));

    return {
      role,
      modules: Array.from(new Set([...unique, ...ALWAYS_ON_MODULES])),
      locked: false,
    };
  }
}
