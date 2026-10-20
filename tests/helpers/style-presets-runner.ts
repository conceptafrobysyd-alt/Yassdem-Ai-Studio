import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-style-presets-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  const sqlite = new DatabaseSync(join(directory, 'test.db'));
  for (const name of (
    await readdir(join(process.cwd(), 'prisma/migrations'))
  ).sort())
    if (name !== 'migration_lock.toml')
      sqlite.exec(
        await readFile(
          join(process.cwd(), 'prisma/migrations', name, 'migration.sql'),
          'utf8',
        ),
      );
  sqlite.close();
  const { db } = await import('../../src/lib/db');
  const styles = await import('../../src/lib/style-presets');
  const { applyStylePresetToLook } =
    await import('../../src/lib/style-preset-values');
  const fashion = await import('../../src/lib/fashion');
  const jobs = await import('../../src/lib/fashion-jobs');
  const { duplicateProject } = await import('../../src/lib/projects');
  const { GET, POST } = await import('../../src/app/api/style-presets/route');
  const passed: string[] = [];
  try {
    assert.equal(
      (await GET(new Request('http://127.0.0.1:3000/api/style-presets')))
        .status,
      401,
    );
    assert.equal(
      (
        await POST(
          new Request('http://127.0.0.1:3000/api/style-presets', {
            method: 'POST',
            headers: {
              origin: 'https://outside.example',
              'content-type': 'application/json',
            },
            body: '{"name":"outside"}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(await db.stylePreset.count(), 0);
    passed.push('private-api-and-origin-protection');

    const alpha = await styles.createStylePreset({
      name: ' Casual Chic ',
      parameters: {
        fit: 'relaxed',
        length: 'ankle',
        colors: ['navy', 'cream', 'navy'],
        accessories: ['belt'],
        layering: 'linen jacket',
        coverage: 'long sleeves',
        mood: 'daylight',
        decor: 'city street',
        pose: 'walking',
        bodyFeatures: 'tall',
      },
    });
    const beta = await styles.createStylePreset({
      name: 'Colorful & Funky',
      parameters: {
        fit: 'oversized',
        colors: ['coral'],
        accessories: ['scarf'],
        mood: 'studio',
      },
    });
    assert.equal(alpha.name, 'Casual Chic');
    assert.deepEqual(alpha.parameters.colors, ['navy', 'cream']);
    assert.equal(beta.parameters.coverage, '');
    assert.equal((await styles.listStylePresets()).length, 2);
    assert.deepEqual(await styles.getStylePreset(alpha.id), alpha);
    for (const input of [
      { name: 'Hijab is not a style parameter', parameters: { hijab: true } },
      { name: 'Unknown', parameters: { prompt: 'unexpected' } },
      { name: 'Wrong fit', parameters: { fit: 'auto-modest' } },
      { name: 'Oversize', parameters: { decor: 'x'.repeat(201) } },
      {
        name: 'Too many',
        parameters: { colors: Array.from({ length: 13 }, (_, i) => String(i)) },
      },
      { name: 'Invalid lists', parameters: { accessories: [''] } },
      { name: 'Wrong shape', parameters: [] },
      { name: 'Unknown field', parameters: {}, modelId: 'other' },
      { name: 'x'.repeat(101) },
      { name: 'Control\ncharacter' },
    ])
      await assert.rejects(styles.createStylePreset(input));
    await assert.rejects(
      styles.updateStylePreset(alpha.id, {
        parameters: { bodyFeatures: 'x'.repeat(201) },
      }),
    );
    assert.deepEqual(await styles.getStylePreset(alpha.id), alpha);
    assert.equal(await db.stylePreset.count(), 2);
    passed.push('strict-reusable-parameters-and-independent-edits');

    const project = await db.project.create({
      data: { name: 'Style composition', type: 'fashion' },
    });
    const mannequin = await fashion.createMannequin({
      name: 'Independent profile',
      parameters: { hijab: true, bodyType: 'curvy', pose: 'standing' },
    });
    const image = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#aa2233' },
    })
      .png()
      .toBuffer();
    await mkdir(join(directory, 'storage/media'), { recursive: true });
    await writeFile(join(directory, 'storage/media/garment.png'), image);
    const media = await db.media.create({
      data: {
        name: 'Garment',
        mimeType: 'image/png',
        path: 'media/garment.png',
        size: image.length,
        width: 16,
        height: 16,
      },
    });
    const first = applyStylePresetToLook(
      {
        ...fashion.DEFAULT_LOOK,
        styles: ['Streetwear'],
        colors: ['black'],
        accessories: [],
        prompt: 'Keep the original fabric',
      },
      alpha,
    );
    const combined = applyStylePresetToLook(first, beta);
    assert.deepEqual(combined.styles, [
      'Streetwear',
      'Casual Chic',
      'Colorful & Funky',
    ]);
    assert.ok(!combined.styles.includes('Modest Fashion'));
    assert.deepEqual(combined.colors, ['black', 'navy', 'cream', 'coral']);
    assert.deepEqual(combined.accessories, ['belt', 'scarf']);
    assert.equal(combined.fit, 'oversized');
    assert.equal(combined.mood, 'studio');
    assert.equal(combined.decor, 'city street');
    assert.equal(combined.prompt, 'Keep the original fabric');
    assert.equal('hijab' in combined, false);
    assert.throws(
      () =>
        applyStylePresetToLook(
          {
            ...fashion.DEFAULT_LOOK,
            styles: Array.from({ length: 12 }, (_, i) => `Style ${i}`),
          },
          alpha,
        ),
      /STYLE_PRESET_LIST_LIMIT/,
    );
    const look = await fashion.createLook({
      name: 'Combined look',
      projectId: project.id,
      mannequinId: mannequin.id,
      garmentMediaIds: [media.id],
      parameters: combined,
    });
    assert.deepEqual(look.parameters, combined);
    assert.equal(look.mannequin?.parameters.hijab, true);
    assert.equal(look.mannequin?.parameters.bodyType, 'curvy');
    assert.equal(look.mannequin?.parameters.pose, 'standing');
    passed.push('explicit-combination-preserves-model-hijab-and-prompt');

    const job = await jobs.enqueueFashionJob({
      lookId: look.id,
      mode: 'collage',
      idempotencyKey: 'styles-snapshot',
    });
    assert.deepEqual(JSON.parse(job.parameters).lookParameters, combined);
    await styles.updateStylePreset(alpha.id, {
      parameters: { fit: 'fitted', colors: ['green'], decor: 'new studio' },
    });
    await styles.deleteStylePreset(beta.id);
    const storedLook = await fashion.getLook(look.id);
    assert.deepEqual(storedLook.parameters, combined);
    assert.deepEqual(
      JSON.parse(
        (await db.job.findUniqueOrThrow({ where: { id: job.id } })).parameters,
      ).lookParameters,
      combined,
    );
    assert.equal(
      (await fashion.getMannequin(mannequin.id)).parameters.hijab,
      true,
    );
    // Copy snapshots, never link a look to future preset edits.
    const duplicate = await duplicateProject(project.id);
    const copied = await db.look.findFirstOrThrow({
      where: { projectId: duplicate.id },
    });
    assert.deepEqual(JSON.parse(copied.parameters), combined);
    assert.notEqual(JSON.parse(copied.garmentMediaIds)[0], media.id);
    passed.push('look-job-and-project-copy-keep-independent-snapshots');

    // Simulate pre-upgrade rows: new descriptors receive empty defaults and a no-op
    // save preserves existing render outputs instead of invalidating them.
    const legacy = {
      styles: ['Minimalist'],
      fit: 'regular',
      colors: [],
      accessories: [],
      coverage: '',
      mood: '',
      prompt: '',
    };
    const legacyLook = await db.look.create({
      data: {
        name: 'Legacy',
        projectId: project.id,
        garmentMediaIds: JSON.stringify([media.id]),
        parameters: JSON.stringify(legacy),
        outputMediaId: media.id,
      },
    });
    const publicLegacy = await fashion.getLook(legacyLook.id);
    assert.equal(publicLegacy.parameters.length, '');
    const unchanged = await fashion.updateLook(legacyLook.id, {
      parameters: publicLegacy.parameters,
    });
    assert.equal(unchanged.outputMediaId, media.id);
    assert.deepEqual(unchanged.updatedAt, legacyLook.updatedAt);
    passed.push('legacy-look-defaults-preserve-existing-results');

    await db.$disconnect();
    const reopened = new DatabaseSync(join(directory, 'test.db'));
    const persisted = reopened
      .prepare('SELECT name, parameters FROM StylePreset WHERE id = ?')
      .get(alpha.id) as { name: string; parameters: string };
    assert.equal(persisted.name, 'Casual Chic');
    assert.equal(JSON.parse(persisted.parameters).decor, 'new studio');
    reopened.close();
    await assert.rejects(styles.getStylePreset(beta.id), {
      code: 'STYLE_PRESET_NOT_FOUND',
    });
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
