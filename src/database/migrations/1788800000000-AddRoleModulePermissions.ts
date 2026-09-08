import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RBAC foundation: a role -> module grant table backing the new
 * admin/rbac endpoints and RolesGuard's @RequireModule() checks.
 *
 * A row's presence means the (role, module) pair is granted. No rows are
 * ever inserted for 'admin' — admin is implicit-all, handled in code
 * (RbacService.getGrantedModules / RolesGuard), so an admin can never be
 * locked out by a bad row or a stray DELETE.
 *
 * Seeds 'editor' with every module except User Management, Notifikasi and
 * Roles & Permissions — those three stay admin-only (see AccessModule /
 * ACCESS_MODULES' `grantable` flag). 'dashboard' is also seeded here even
 * though it's `alwaysOn` in code (unioned in at read time regardless of
 * this row) — seeding it keeps the table's contents consistent with what
 * GET /admin/rbac/permissions actually reports for 'editor'.
 */
export class AddRoleModulePermissions1788800000000
  implements MigrationInterface
{
  name = 'AddRoleModulePermissions1788800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_module_permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "role" "public"."users_role_enum" NOT NULL,
        "module" character varying(64) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_role_module_permissions_role_module" UNIQUE ("role", "module")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "role_module_permissions" ("role", "module")
      VALUES
        ('editor', 'dashboard'),
        ('editor', 'properties'),
        ('editor', 'event-support'),
        ('editor', 'storage'),
        ('editor', 'moving'),
        ('editor', 'content-media')
      ON CONFLICT ON CONSTRAINT "UQ_role_module_permissions_role_module" DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "role_module_permissions"`);
  }
}
