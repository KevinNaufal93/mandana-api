import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD } from '@nestjs/core';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { TypeOrmConfigService } from './config/typeorm.config';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { MediaModule } from './modules/media/media.module';
import { HeroModule } from './modules/hero/hero.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { HomepageModule } from './modules/homepage/homepage.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { MovingModule } from './modules/moving/moving.module';

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

    // Global Redis cache — accessed via CACHE_MANAGER injection token
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.getOrThrow<string>('redis.host');
        const port = config.getOrThrow<number>('redis.port');
        return {
          stores: [
            new Keyv({
              store: new KeyvRedis(`redis://${host}:${port}`),
              namespace: 'mandana',
            }),
          ],
        };
      },
    }),

    // Feature modules
    UsersModule,
    AuthModule,
    PropertiesModule,
    InquiriesModule,
    MediaModule,
    HeroModule,
    CollectionsModule,
    HomepageModule,
    AmenitiesModule,
    MovingModule,
  ],
  providers: [
    // Global JWT guard: all routes protected by default; @Public() opts out
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global roles guard: enforces @Roles() on top of JWT
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
