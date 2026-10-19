import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { databaseUrl } from './database-config';
const globalForDb = globalThis as unknown as { studioDb?: PrismaClient };
export const db =
  globalForDb.studioDb ??
  new PrismaClient({
    adapter: new PrismaBetterSQLite3({ url: databaseUrl() }),
  });
if (process.env.NODE_ENV !== 'production') globalForDb.studioDb = db;
