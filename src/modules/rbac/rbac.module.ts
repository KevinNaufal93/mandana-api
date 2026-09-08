import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleModulePermission } from './entities/role-module-permission.entity';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';

/**
 * Imported by AppModule (RolesGuard, provided globally there, depends on
 * RbacService) and by AuthModule (AuthService reads the caller's granted
 * modules for GET /auth/me).
 */
@Module({
  imports: [TypeOrmModule.forFeature([RoleModulePermission])],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
