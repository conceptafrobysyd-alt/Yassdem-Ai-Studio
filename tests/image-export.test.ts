import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
const isolated = vi.hoisted(() => ({
  client: null as import('@prisma/client').PrismaClient | null,
}));
vi.mock('@/lib/db', () => ({
  get db() {
    if (!isolated.client) throw new Error('Missing test database');
    return isolated.client;
  },
}));
import {
  exportImage,
  imageExportDimensions,
  parseImageExportOptions,
  renderImageExport,
} from '@/lib/image-export';
import { deleteMedia, resolveMediaPath } from '@/lib/media';
import { duplicateProject } from '@/lib/projects';

let directory = '';
const previousStorage = process.env.STORAGE_DIR;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'yassdem-image-export-'));
  process.env.STORAGE_DIR = directory;
  isolated.client = new PrismaClient({
    adapter: new PrismaBetterSQLite3({
      url: `file:${path.join(directory, 'test.db')}`,
    }),
  });
  const migrations = path.join(process.cwd(), 'prisma/migrations');
  for (const migration of (await readdir(migrations, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(
      path.join(migrations, migration.name, 'migration.sql'),
      'utf8',
    );
    for (const statement of sql
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean))
      await isolated.client.$executeRawUnsafe(statement);
  }
});
afterAll(async () => {
  await isolated.client?.$disconnect();
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  await rm(directory, { recursive: true, force: true });
});
const raster = (
  width: number,
  height: number,
  background: string | { r: number; g: number; b: number; alpha: number },
) =>
  sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer();
function options(input: Record<string, unknown> = {}) {
  return parseImageExportOptions(input);
}
async function pixel(bytes: Buffer, x: number, y: number) {
  const output = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * output.info.width + x) * 4;
  return [...output.data.subarray(offset, offset + 4)];
}

describe('raster image exports', () => {
  it('validates options and distinguishes exact 4K export sizes from source density', () => {
    expect(imageExportDimensions(800, 600, '4k', '16:9')).toEqual({
      width: 3840,
      height: 2160,
    });
    expect(imageExportDimensions(800, 600, '4k', '9:16')).toEqual({
      width: 2160,
      height: 3840,
    });
    expect(imageExportDimensions(800, 600, '4k', '4:5')).toEqual({
      width: 3072,
      height: 3840,
    });
    expect(imageExportDimensions(800, 600, 'native', '1:1')).toEqual({
      width: 600,
      height: 600,
    });
    expect(imageExportDimensions(83, 147, 'native', 'original')).toEqual({
      width: 83,
      height: 147,
    });
    for (const invalid of [
      { resolution: 999999 },
      { ratio: '100000:1' },
      { format: 'svg' },
      { logoSize: 0 },
      { logoOpacity: 2 },
      { logoPosition: 'evil' },
      { logoId: '../secret' },
      { quality: 0 },
      { arbitrary: true },
    ])
      expect(() => options(invalid)).toThrow();
  });
  it('creates a real 3840×2160 PNG and reports enlargement without inventing AI', async () => {
    const rendered = await renderImageExport(
      await raster(320, 240, '#1020ff'),
      options({ resolution: '4k', ratio: '16:9' }),
    );
    const meta = await sharp(rendered.bytes).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([3840, 2160, 'png']);
    expect(rendered.metadata).toMatchObject({
      nativeWidth: 320,
      nativeHeight: 240,
      width: 3840,
      height: 2160,
      upscaled: true,
      aiUpscaling: false,
      costCents: 0,
    });
    expect(await pixel(rendered.bytes, 1900, 1000)).toEqual([16, 32, 255, 255]);
  });
  it('multiplies logo opacity by its real alpha and preserves transparent PNG pixels', async () => {
    const transparent = await raster(100, 100, { r: 0, g: 0, b: 0, alpha: 0 });
    const logo = await raster(10, 10, { r: 255, g: 0, b: 0, alpha: 0.5 });
    const result = await renderImageExport(
      transparent,
      options({
        logoId: 'logo',
        logoOpacity: 0.5,
        logoSize: 20,
        logoPosition: 'center',
      }),
      logo,
    );
    const centre = await pixel(result.bytes, 50, 50);
    expect(centre[0]).toBe(255);
    expect(centre[3]).toBeGreaterThanOrEqual(63);
    expect(centre[3]).toBeLessThanOrEqual(65);
    expect((await pixel(result.bytes, 5, 5))[3]).toBe(0);
    const opaque = await renderImageExport(
      await raster(100, 100, '#0000ff'),
      options({
        logoId: 'logo',
        logoOpacity: 0.5,
        logoSize: 20,
        logoPosition: 'center',
      }),
      logo,
    );
    const blend = await pixel(opaque.bytes, 50, 50);
    expect(blend[0]).toBeGreaterThanOrEqual(63);
    expect(blend[0]).toBeLessThanOrEqual(65);
    expect(blend[2]).toBeGreaterThanOrEqual(190);
    expect(blend[2]).toBeLessThanOrEqual(192);
    expect(blend[3]).toBe(255);
  });
  it('flattens JPEG onto white while keeping PNG and WebP transparency', async () => {
    const source = await raster(32, 16, { r: 0, g: 0, b: 0, alpha: 0 });
    const jpeg = await renderImageExport(
      source,
      options({ format: 'jpeg', quality: 100 }),
    );
    const metadata = await sharp(jpeg.bytes).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.hasAlpha).toBe(false);
    expect(await pixel(jpeg.bytes, 10, 10)).toEqual([255, 255, 255, 255]);
    const webp = await renderImageExport(source, options({ format: 'webp' }));
    expect((await sharp(webp.bytes).metadata()).format).toBe('webp');
    expect((await pixel(webp.bytes, 10, 10))[3]).toBe(0);
  });
  it('normalizes EXIF orientation and rejects damaged raster data', async () => {
    const rotated = await sharp(await raster(40, 80, '#ff0000'))
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await renderImageExport(rotated, options());
    expect(result.metadata).toMatchObject({
      nativeWidth: 80,
      nativeHeight: 40,
      width: 80,
      height: 40,
      upscaled: false,
    });
    await expect(
      renderImageExport(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]),
        options(),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_EXPORT_INVALID_IMAGE' });
    await expect(
      renderImageExport(
        await raster(10, 10, 'white'),
        options({ logoId: 'logo' }),
      ),
    ).rejects.toMatchObject({ code: 'IMAGE_EXPORT_LOGO_NOT_FOUND' });
  });
  it('persists real media and archive references without replacing editor or SEO settings', async () => {
    const db = isolated.client!;
    const project = await db.project.create({
      data: {
        name: 'Image export project',
        parameters: JSON.stringify({
          editor: { keep: true },
          seo: { keep: true },
        }),
      },
    });
    const sourceBytes = await raster(100, 80, '#0000ff'),
      logoBytes = await raster(20, 20, '#ff0000');
    await writeFile(path.join(directory, 'source.png'), sourceBytes);
    await writeFile(path.join(directory, 'logo.png'), logoBytes);
    const source = await db.media.create({
      data: {
        name: 'source.png',
        path: 'source.png',
        mimeType: 'image/png',
        size: sourceBytes.length,
        width: 100,
        height: 80,
        projectId: project.id,
      },
    });
    const logo = await db.media.create({
      data: {
        name: 'logo.png',
        path: 'logo.png',
        mimeType: 'image/png',
        role: 'LOGO',
        size: logoBytes.length,
        width: 20,
        height: 20,
      },
    });
    const result = await exportImage(source.id, {
      logoId: logo.id,
      logoSize: 20,
      logoOpacity: 1,
      logoPosition: 'top-left',
    });
    expect(result.media).toMatchObject({
      role: 'EXPORT',
      projectId: project.id,
      mimeType: 'image/png',
      width: 100,
      height: 80,
    });
    const stored = await db.media.findUniqueOrThrow({
      where: { id: result.media.id },
    });
    expect(
      await pixel(await readFile(resolveMediaPath(stored.path)), 10, 10),
    ).toEqual([255, 0, 0, 255]);
    const parameters = JSON.parse(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .parameters,
    );
    expect(parameters.editor).toEqual({ keep: true });
    expect(parameters.seo).toEqual({ keep: true });
    expect(parameters.imageExports[0]).toMatchObject({
      sourceMediaId: source.id,
      outputMediaId: result.media.id,
      logoId: logo.id,
      costCents: 0,
    });
    await expect(deleteMedia(logo.id)).rejects.toMatchObject({
      code: 'MEDIA_IN_USE',
    });
    const copy = await duplicateProject(project.id);
    const copyParameters = copy.parameters as Record<string, any>;
    const copiedExport = copyParameters.imageExports[0];
    expect(copiedExport.sourceMediaId).not.toBe(source.id);
    expect(copiedExport.logoId).not.toBe(logo.id);
    expect(copiedExport.outputMediaId).not.toBe(result.media.id);
    const copiedMedia = await db.media.findUniqueOrThrow({
      where: { id: copiedExport.outputMediaId },
    });
    expect(await readFile(resolveMediaPath(copiedMedia.path))).toEqual(
      await readFile(resolveMediaPath(stored.path)),
    );
  });
  it('removes an uncommitted output if project metadata exceeds its bound', async () => {
    const db = isolated.client!;
    const project = await db.project.create({
      data: {
        name: 'Full project',
        parameters: JSON.stringify({ note: 'x'.repeat(19990) }),
      },
    });
    const sourceBytes = await raster(30, 20, '#001122');
    await writeFile(path.join(directory, 'rollback.png'), sourceBytes);
    const source = await db.media.create({
      data: {
        name: 'rollback.png',
        path: 'rollback.png',
        mimeType: 'image/png',
        size: sourceBytes.length,
        projectId: project.id,
      },
    });
    const beforeFiles = await readdir(path.join(directory, 'media')),
      beforeCount = await db.media.count();
    await expect(exportImage(source.id, {})).rejects.toMatchObject({
      code: 'IMAGE_EXPORT_PROJECT_TOO_LARGE',
    });
    expect(await db.media.count()).toBe(beforeCount);
    expect(await readdir(path.join(directory, 'media'))).toEqual(beforeFiles);
  });
});
