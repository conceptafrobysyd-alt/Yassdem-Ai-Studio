/** Real SQLite lifecycle outside the test runner's native module VM. */
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-brand-presets-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  const sqlite = new DatabaseSync(join(directory, 'test.db'));
  for (const name of (
    await readdir(join(process.cwd(), 'prisma/migrations'))
  ).sort()) {
    if (name !== 'migration_lock.toml')
      sqlite.exec(
        await readFile(
          join(process.cwd(), 'prisma/migrations', name, 'migration.sql'),
          'utf8',
        ),
      );
  }
  sqlite.close();
  const { db } = await import('../../src/lib/db');
  const brands = await import('../../src/lib/brand-presets');
  const { updateSettings } = await import('../../src/lib/settings');
  const { GET, POST } = await import('../../src/app/api/brand-presets/route');
  const passed: string[] = [];
  try {
    assert.equal(
      (await GET(new Request('http://127.0.0.1:3000/api/brand-presets')))
        .status,
      401,
    );
    assert.equal(
      (
        await POST(
          new Request('http://127.0.0.1:3000/api/brand-presets', {
            method: 'POST',
            headers: {
              origin: 'https://outside.example',
              'content-type': 'application/json',
            },
            body: '{"name":"Unsafe"}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(await db.brandPreset.count(), 0);
    passed.push('private-api-and-origin-protection');

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAjYAAAAASUVORK5CYII=',
      'base64',
    );
    await mkdir(join(directory, 'storage', 'media'), { recursive: true });
    await writeFile(join(directory, 'storage', 'media', 'logo.png'), png);
    const logo = await db.media.create({
      data: {
        name: 'Logo Alba',
        path: 'media/logo.png',
        mimeType: 'image/png',
        role: 'LOGO',
        size: png.length,
      },
    });
    const source = await db.media.create({
      data: {
        name: 'Source',
        path: 'media/source.png',
        mimeType: 'image/png',
        role: 'SOURCE',
        size: png.length,
      },
    });
    const alpha = await brands.createBrandPreset({
      name: ' Alba ',
      logoMediaId: logo.id,
      logoSize: 22,
      logoOpacity: 0.65,
      logoPosition: 'top-left',
      logoFade: true,
    });
    const beta = await brands.createBrandPreset({
      name: 'Yassdem',
      logoMediaId: null,
    });
    assert.equal(alpha.name, 'Alba');
    assert.equal(alpha.logoFade, true);
    assert.equal(beta.logoSize, 15);
    assert.equal(beta.logoPosition, 'bottom-right');
    assert.equal((await brands.listBrandPresets()).length, 2);
    assert.deepEqual(await brands.getBrandPreset(alpha.id), alpha);
    passed.push('multiple-persisted-identities-and-public-dates');

    for (const invalid of [
      { name: 'Source is not a logo', logoMediaId: source.id },
      { name: 'Missing logo', logoMediaId: 'missing' },
      { name: 'Oversized logo', logoSize: 51 },
      { name: 'Invalid opacity', logoOpacity: -0.1 },
      { name: 'Invalid opacity', logoOpacity: Infinity },
      { name: 'Filter injection', logoPosition: 'center;movie=/etc/passwd' },
      { name: 'Invalid fade', logoFade: 'true' },
      { name: 'Unknown option', prompt: 'not an input' },
      { name: 'x'.repeat(81) },
    ])
      await assert.rejects(brands.createBrandPreset(invalid));
    assert.equal(await db.brandPreset.count(), 2);
    await assert.rejects(
      brands.updateBrandPreset(alpha.id, { logoMediaId: source.id }),
      { code: 'INVALID_LOGO' },
    );
    assert.deepEqual(await brands.getBrandPreset(alpha.id), alpha);
    const edited = await brands.updateBrandPreset(alpha.id, {
      name: 'Alba été',
      logoOpacity: 0.5,
    });
    assert.equal(edited.logoMediaId, logo.id);
    assert.equal(edited.logoFade, true);
    assert.deepEqual(await brands.getBrandPreset(beta.id), beta);
    passed.push('strict-validation-and-independent-edits');

    const applied = await updateSettings({
      activeLogoId: edited.logoMediaId,
      logoSize: edited.logoSize,
      logoOpacity: edited.logoOpacity,
      logoPosition: edited.logoPosition,
      logoFade: edited.logoFade,
    });
    assert.equal(applied.activeLogoId, logo.id);
    assert.equal(applied.logoFade, true);
    const snapshot = {
      logoMediaId: applied.activeLogoId,
      logoSize: applied.logoSize,
      logoOpacity: applied.logoOpacity,
      logoPosition: applied.logoPosition,
      logoAnimation: applied.logoFade ? 'fade' : 'none',
    };
    const project = await db.project.create({
      data: {
        name: 'Frozen brand settings',
        parameters: JSON.stringify(snapshot),
      },
    });
    await brands.updateBrandPreset(alpha.id, {
      logoOpacity: 0.1,
      logoFade: false,
    });
    assert.deepEqual(
      JSON.parse(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .parameters,
      ),
      snapshot,
    );
    assert.equal(
      (await db.settings.findUniqueOrThrow({ where: { id: 'default' } }))
        .logoOpacity,
      0.5,
    );
    passed.push('applied-preferences-and-existing-project-snapshots');

    await assert.rejects(db.media.delete({ where: { id: logo.id } }));
    await brands.deleteBrandPreset(alpha.id);
    assert.ok(await db.media.findUnique({ where: { id: logo.id } }));
    assert.equal((await brands.listBrandPresets()).length, 1);
    await assert.rejects(brands.getBrandPreset(alpha.id), {
      code: 'BRAND_PRESET_NOT_FOUND',
    });
    await assert.rejects(brands.deleteBrandPreset(alpha.id), {
      code: 'BRAND_PRESET_NOT_FOUND',
    });
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .parameters,
      JSON.stringify(snapshot),
    );
    passed.push(
      'referential-logo-protection-and-nondestructive-preset-deletion',
    );
    console.log(JSON.stringify(passed));
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
