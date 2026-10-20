import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
const isolated = vi.hoisted(() => ({
  client: null as import('@prisma/client').PrismaClient | null,
}));
vi.mock('@/lib/db', () => ({
  get db() {
    if (!isolated.client) throw new Error('Database not ready');
    return isolated.client;
  },
}));
import { saveProductState } from '@/lib/product-state';
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yassdem-product-state-'));
  const file = join(directory, 'state.db');
  const sqlite = new DatabaseSync(file);
  for (const entry of (
    await readdir('prisma/migrations', { withFileTypes: true })
  )
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    sqlite.exec(
      await readFile(
        join('prisma/migrations', entry.name, 'migration.sql'),
        'utf8',
      ),
    );
  }
  sqlite.close();
  isolated.client = new PrismaClient({
    adapter: new PrismaBetterSQLite3({ url: `file:${file}` }),
  });
});
afterAll(async () => {
  await isolated.client?.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('saves an older product draft without losing more recent editor, SEO or import state', async () => {
  const project = await isolated.client!.project.create({
    data: {
      name: 'Shared project',
      parameters: JSON.stringify({
        prompt: 'Original',
        editor: { version: 1, clips: [] },
      }),
    },
  });
  const oldDraft = {
    prompt: 'Updated product prompt',
    provider: 'local',
    duration: 5,
    sourceMediaId: '',
    stylePreferences: { fit: 'regular' },
  };
  const fresh = {
    prompt: 'Original',
    editor: {
      version: 1,
      clips: [{ mediaId: 'video-new', startSeconds: 0, endSeconds: 2 }],
    },
    seo: {
      versions: [{ language: 'en', titles: ['Human edit'] }],
      source: 'local',
    },
    productReference: {
      url: 'https://shop.example/products/new',
      mediaIds: ['import-new'],
    },
    imageExports: [{ outputMediaId: 'image-new' }],
  };
  await isolated.client!.project.update({
    where: { id: project.id },
    data: { parameters: JSON.stringify(fresh) },
  });
  await saveProductState(project.id, { parameters: oldDraft });
  const saved = JSON.parse(
    (
      await isolated.client!.project.findUniqueOrThrow({
        where: { id: project.id },
      })
    ).parameters,
  );
  expect(saved).toEqual({ ...fresh, ...oldDraft });
});
it('rejects cross-module keys and oversized merged state without changing the row', async () => {
  const parameters = JSON.stringify({
    editor: { version: 1 },
    seo: { value: 'preserved' },
    large: 'a'.repeat(19000),
  });
  const project = await isolated.client!.project.create({
    data: { name: 'Protected', parameters },
  });
  await expect(
    saveProductState(project.id, { parameters: { editor: { clips: [] } } }),
  ).rejects.toMatchObject({ code: 'INVALID_PRODUCT_STATE' });
  await expect(
    saveProductState(project.id, { parameters: { prompt: 'b'.repeat(2000) } }),
  ).rejects.toMatchObject({ code: 'INVALID_PARAMETERS' });
  await expect(
    saveProductState(project.id, { parameters: { logoOpacity: 2 } }),
  ).rejects.toMatchObject({ code: 'INVALID_PRODUCT_STATE' });
  expect(
    (
      await isolated.client!.project.findUniqueOrThrow({
        where: { id: project.id },
      })
    ).parameters,
  ).toBe(parameters);
});
