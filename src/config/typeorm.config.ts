import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      username: this.configService.get<string>('database.username'),
      password: this.configService.get<string>('database.password'),
      database: this.configService.get<string>('database.name'),
      entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
      migrations: [
        join(__dirname, '..', 'database', 'migrations', '*.{ts,js}'),
      ],
      // synchronize: false in all environments — always use migrations
      synchronize: false,
      logging: this.configService.get<string>('app.nodeEnv') === 'development',
    };
  }
}
