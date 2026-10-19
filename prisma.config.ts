import { defineConfig } from 'prisma/config';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { databaseUrl } from './src/lib/database-config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () => new PrismaBetterSQLite3({ url: databaseUrl() }),
});
