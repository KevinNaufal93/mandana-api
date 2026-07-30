import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmConfigService } from './config/typeorm.config';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';

@Module({
  imports: [
    // Global config — app refuses to start on missing/invalid env vars (Joi)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),

    // TypeORM — async so it can inject ConfigService
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),

    // Feature modules
    UsersModule,
    AuthModule,
    PropertiesModule,
    InquiriesModule,
  ],
  providers: [
    // Global JWT guard: all routes protected by default; @Public() opts out
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
