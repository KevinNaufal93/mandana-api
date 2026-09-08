import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { AccessModule } from '../../../common/enums/access-module.enum';

/**
 * Grant-row model: a row's presence means the role can access that module.
 * No rows are ever stored for `admin` — admin is implicit-all, short-
 * circuited in RolesGuard, which makes an admin lockout structurally
 * impossible even via hand-written SQL. See RbacService for the read/write
 * API and its caching.
 *
 * `module` is `varchar`, not a Postgres enum, deliberately: adding a new
 * product module must not require an `ALTER TYPE` migration the way adding
 * a UserRole value would.
 */
@Entity('role_module_permissions')
@Unique('UQ_role_module_permissions_role_module', ['role', 'module'])
export class RoleModulePermission extends BaseEntity {
  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ type: 'varchar', length: 64 })
  module!: AccessModule;
}
