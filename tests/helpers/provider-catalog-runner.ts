import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-provider-default-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  const sqlite = new DatabaseSync(join(directory, 'test.db'));
  for (const migration of (
    await readdir(join(process.cwd(), 'prisma/migrations'), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort())
    sqlite.exec(
      await readFile(
        join(process.cwd(), 'prisma/migrations', migration, 'migration.sql'),
        'utf8',
      ),
    );
  sqlite.close();
  const { db } = await import('../../src/lib/db');
  const { updateSettings } = await import('../../src/lib/settings');
  const { GET } = await import('../../src/app/api/providers/models/route');
  const passed: string[] = [];
  try {
    globalThis.fetch = async () => {
      throw new Error('Catalog/default must not make a network request');
    };
    const response = await GET(
      new Request('http://127.0.0.1:3000/api/providers/models'),
    );
    assert.equal(response.status, 401);
    passed.push('private-catalog-api');
    await db.settings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: { defaultProvider: 'local' },
    });
    await db.project.create({
      data: {
        id: 'existing-project',
        name: 'Existing',
        parameters: JSON.stringify({ provider: 'runway', prompt: 'Preserved' }),
      },
    });
    process.env.REPLICATE_API_TOKEN = 'test-only-key';
    process.env.REPLICATE_MODEL_VERSION = 'd'.repeat(64);
    process.env.REPLICATE_ESTIMATE_CENTS = '25';
    for (const kind of ['', 'image']) {
      process.env.REPLICATE_OUTPUT_KIND = kind;
      await assert.rejects(
        updateSettings({ defaultProvider: 'replicate' }),
        (error) =>
          Boolean(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'REPLICATE_VIDEO_MODEL_REQUIRED',
          ),
      );
      assert.equal(
        (await db.settings.findUniqueOrThrow({ where: { id: 'default' } }))
          .defaultProvider,
        'local',
      );
    }
    process.env.REPLICATE_OUTPUT_KIND = 'video';
    process.env.REPLICATE_API_TOKEN = '';
    await assert.rejects(updateSettings({ defaultProvider: 'replicate' }));
    process.env.REPLICATE_API_TOKEN = 'test-only-key';
    process.env.REPLICATE_MODEL_VERSION = 'latest';
    await assert.rejects(updateSettings({ defaultProvider: 'replicate' }));
    process.env.REPLICATE_MODEL_VERSION = 'd'.repeat(64);
    passed.push('invalid-and-image-defaults-rejected');
    const saved = await updateSettings({ defaultProvider: 'replicate' });
    assert.equal(saved.defaultProvider, 'replicate');
    assert.equal(saved.replicateEnabled, false);
    assert.equal(saved.monthlyBudgetCents, 0);
    const settings = await db.settings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    assert.equal(settings.defaultProvider, 'replicate');
    assert.equal(settings.providerEnabled, false);
    passed.push('video-default-persists-with-zero-budget-and-no-activation');
    assert.deepEqual(
      JSON.parse(
        (
          await db.project.findUniqueOrThrow({
            where: { id: 'existing-project' },
          })
        ).parameters,
      ),
      { provider: 'runway', prompt: 'Preserved' },
    );
    assert.equal(await db.job.count(), 0);
    passed.push('existing-projects-and-ledger-unchanged');
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
