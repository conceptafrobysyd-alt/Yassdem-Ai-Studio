import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

// The standalone worker and Prisma CLI need the same .env support as Next.js.
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) loadEnvFile(envFile);

// Fontconfig (used by Sharp for text) needs a writable cache in cloud tasks.
if (!process.env.XDG_CACHE_HOME) {
  const cache = resolve(process.env.STORAGE_DIR || 'storage', '.cache');
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  process.env.XDG_CACHE_HOME = cache;
}

/** Preserve Prisma's convention: relative SQLite paths are relative to prisma/. */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? 'file:./studio.db';
  if (!url.startsWith('file:'))
    throw new Error('DATABASE_URL must use a SQLite file: URL.');
  return `file:${resolve(process.cwd(), 'prisma', url.slice('file:'.length))}`;
}
