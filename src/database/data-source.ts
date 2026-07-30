import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'path';

/**
 * Standalone DataSource for the TypeORM CLI (migration:generate, migration:run, etc.)
 * Used via the "datasource" key in nest-cli.json and the migration npm scripts.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: true,
});
