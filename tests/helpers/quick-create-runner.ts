import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
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
import { NextResponse } from 'next/server';
import sharp from 'sharp';

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-quick-create-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  delete process.env.COMFYUI_FASHION_WORKFLOW;
  delete process.env.COMFYUI_TRYON_WORKFLOW;
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
  const { quickCreate, quickCreateCapabilities } =
    await import('../../src/lib/quick-create');
  const { getBudget, processPendingJobs } = await import('../../src/lib/jobs');
  const { probeMedia } = await import('../../src/lib/export');
  const { resolveMediaPath } = await import('../../src/lib/media');
  const { GET, POST } = await import('../../src/app/api/quick-create/route');
  const { hashPassword, setSession } = await import('../../src/lib/auth');
  const passed: string[] = [];
  const requests: string[] = [];
  let healthyService = false;
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (healthyService && req.method === 'GET' && req.url === '/system_stats')
      res.end(JSON.stringify({ system: {}, devices: [] }));
    else {
      res.statusCode = 500;
      res.end('{}');
    }
  });
  let running = false;
  try {
    const origin = 'http://127.0.0.1:3000';
    const request = (
      body: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) =>
      new Request(`${origin}/api/quick-create`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await GET(new Request(`${origin}/api/quick-create`))).status,
      401,
    );
    assert.equal((await POST(request({}))).status, 401);
    assert.equal(
      (await POST(request({}, { origin: 'https://outside.example' }))).status,
      403,
    );
    assert.equal(await db.project.count(), 0);
    const passwordHash = await hashPassword('quick-test-password-only');
    await db.settings.update({
      where: { id: 'default' },
      data: { passwordHash },
    });
    const response = NextResponse.json({});
    await setSession(response, new Request(origin), passwordHash);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const capabilitiesResponse = await GET(
      new Request(`${origin}/api/quick-create`, { headers: { cookie } }),
    );
    assert.equal(capabilitiesResponse.status, 200);
    assert.equal(
      capabilitiesResponse.headers.get('cache-control'),
      'private, no-store',
    );
    assert.equal(
      (await POST(request({}, { cookie, origin: 'https://outside.example' })))
        .status,
      403,
    );
    assert.equal(
      (
        await POST(
          new Request(`${origin}/api/quick-create`, {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: '{}',
          }),
        )
      ).status,
      403,
    );
    assert.equal(await db.project.count(), 0);
    passed.push('private-api-and-origin-protection');

    const owner = await db.project.create({
      data: {
        name: 'Existing untouched product',
        parameters: '{"kept":"original"}',
      },
    });
    await mkdir(join(directory, 'storage/media'), { recursive: true });
    const bytes = await sharp({
      create: { width: 300, height: 400, channels: 3, background: '#aa2233' },
    })
      .png()
      .toBuffer();
    await writeFile(join(directory, 'storage/media/source.png'), bytes);
    const source = await db.media.create({
      data: {
        name: 'Product.png',
        path: 'media/source.png',
        size: bytes.length,
        width: 300,
        height: 400,
        mimeType: 'image/png',
        role: 'SOURCE',
        projectId: owner.id,
      },
    });
    const logoBytes = await sharp({
      create: { width: 32, height: 32, channels: 4, background: '#00ff00' },
    })
      .png()
      .toBuffer();
    await writeFile(join(directory, 'storage/media/logo.png'), logoBytes);
    const logo = await db.media.create({
      data: {
        name: 'Logo.png',
        path: 'media/logo.png',
        size: logoBytes.length,
        width: 32,
        height: 32,
        mimeType: 'image/png',
        role: 'LOGO',
      },
    });
    const input = {
      sourceMediaId: source.id,
      action: 'video',
      idempotencyKey: 'quick-first-video',
      locale: 'fr',
    };
    for (const invalid of [
      { ...input, provider: 'runway' },
      { ...input, confirmedPaid: true },
      { ...input, sourceMediaId: '../secret' },
      { ...input, action: 'try-on' },
      { ...input, locale: 'de' },
      { ...input, idempotencyKey: '' },
    ])
      await assert.rejects(quickCreate(invalid), {
        code: 'QUICK_CREATE_INVALID_INPUT',
      });
    for (const id of ['missing', logo.id])
      await assert.rejects(quickCreate({ ...input, sourceMediaId: id }), {
        code: 'QUICK_CREATE_SOURCE_REQUIRED',
      });
    const nonRaster = await db.media.create({
      data: {
        name: 'Not an image',
        mimeType: 'video/mp4',
        path: 'media/source.png',
        size: bytes.length,
      },
    });
    await assert.rejects(
      quickCreate({ ...input, sourceMediaId: nonRaster.id }),
      { code: 'QUICK_CREATE_SOURCE_REQUIRED' },
    );
    const missingFile = await db.media.create({
      data: {
        name: 'Missing.png',
        mimeType: 'image/png',
        path: 'media/missing.png',
        size: bytes.length,
      },
    });
    await assert.rejects(
      quickCreate({ ...input, sourceMediaId: missingFile.id }),
      { code: 'QUICK_CREATE_SOURCE_REQUIRED' },
    );
    assert.equal(await db.project.count(), 1);
    assert.equal(await db.job.count(), 0);
    const malformed = await POST(
      request({ ...input, provider: 'runway' }, { cookie }),
    );
    assert.equal(malformed.status, 400);
    passed.push('strict-source-validation-without-project-side-effects');

    await db.settings.update({
      where: { id: 'default' },
      data: {
        defaultProvider: 'runway',
        providerEnabled: true,
        replicateEnabled: true,
        monthlyBudgetCents: 2000,
        preferredResolution: 2160,
        preferredFormat: '16:9',
        activeLogoId: logo.id,
        logoSize: 10,
        logoOpacity: 1,
        logoPosition: 'top-left',
        logoFade: false,
      },
    });
    const createdResponse = await POST(request(input, { cookie }));
    assert.equal(createdResponse.status, 202);
    assert.equal(
      createdResponse.headers.get('cache-control'),
      'private, no-store',
    );
    const created = await createdResponse.json();
    assert.equal(created.project.type, 'product');
    assert.equal(created.project.parameters.sourceMediaId, source.id);
    assert.equal(created.job.provider, 'local');
    assert.equal(created.job.providerRequested, false);
    assert.equal(created.job.reservedCents, 0);
    assert.equal(created.job.estimatedCostCents, 0);
    assert.deepEqual(
      Object.fromEntries(
        [
          'durationSeconds',
          'format',
          'resolution',
          'codec',
          'quality',
          'logoId',
          'logoSize',
          'logoOpacity',
          'logoPosition',
        ].map((k) => [k, created.job.parameters[k]]),
      ),
      {
        durationSeconds: 5,
        format: '9:16',
        resolution: 720,
        codec: 'h264',
        quality: 21,
        logoId: logo.id,
        logoSize: 10,
        logoOpacity: 1,
        logoPosition: 'top-left',
      },
    );
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: source.id } }))
        .projectId,
      owner.id,
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: owner.id } }))
        .parameters,
      '{"kept":"original"}',
    );
    passed.push('one-click-video-is-local-with-saved-brand-defaults');

    await db.settings.update({
      where: { id: 'default' },
      data: {
        activeLogoId: null,
        logoOpacity: 0.2,
        logoPosition: 'bottom-right',
      },
    });
    const repeated = await Promise.all(
      Array.from({ length: 6 }, () => quickCreate(input)),
    );
    assert.ok(
      repeated.every(
        (result) =>
          result.project.id === created.project.id &&
          result.job.id === created.job.id,
      ),
    );
    assert.ok(
      repeated.every(
        (result) =>
          record(result.job.parameters).logoId === logo.id &&
          record(result.job.parameters).logoOpacity === 1,
      ),
    );
    assert.equal(await db.project.count(), 2);
    assert.equal(await db.job.count(), 1);
    await assert.rejects(
      quickCreate({ ...input, sourceMediaId: missingFile.id }),
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    await assert.rejects(quickCreate({ ...input, action: 'model' }), {
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const parallelInput = {
      ...input,
      idempotencyKey: 'parallel-first-requests',
    };
    const parallel = await Promise.all(
      Array.from({ length: 5 }, () => quickCreate(parallelInput)),
    );
    assert.ok(
      parallel.every(
        (result) =>
          result.project.id === parallel[0].project.id &&
          result.job.id === parallel[0].job.id,
      ),
    );
    assert.equal(await db.project.count(), 3);
    assert.equal(await db.job.count(), 2);
    // Reproduce the persisted state left if preparation committed but queueing
    // was interrupted: a retry must reuse that project and its saved settings.
    await db.job.delete({ where: { id: parallel[0].job.id } });
    const resumedPreparation = await quickCreate(parallelInput);
    assert.equal(resumedPreparation.project.id, parallel[0].project.id);
    assert.deepEqual(
      resumedPreparation.job.parameters,
      parallel[0].job.parameters,
    );
    assert.equal(await db.project.count(), 3);
    assert.equal(await db.job.count(), 2);
    passed.push('retries-concurrency-and-key-conflicts-preserve-one-job');

    await processPendingJobs();
    const final = await db.job.findUniqueOrThrow({
      where: { id: created.job.id },
    });
    assert.equal(final.status, 'SUCCEEDED', final.errorCode ?? undefined);
    const media = await db.media.findUniqueOrThrow({
      where: { id: final.outputMediaId! },
    });
    const probe = await probeMedia(resolveMediaPath(media.path));
    assert.equal(probe.width, 720);
    assert.equal(probe.height, 1280);
    assert.ok(Math.abs((probe.durationSeconds ?? 0) - 5) < 0.2);
    const { stdout: image } = await promisify(execFile)(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '1',
        '-i',
        resolveMediaPath(media.path),
        '-vf',
        'crop=2:2:40:40',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { encoding: 'buffer' },
    );
    assert.ok(
      image[1] > 200 && image[0] < 60 && image[2] < 60,
      'Saved green brand logo must be visible in encoded video',
    );
    assert.equal(final.provider, 'local');
    assert.equal(final.estimatedCostCents, 0);
    assert.equal(final.reservedCents, 0);
    assert.ok(final.actualCostCents === null || final.actualCostCents === 0);
    assert.equal(final.providerRequested, false);
    const budget = await getBudget();
    assert.equal(budget.actualCostCents, 0);
    assert.equal(budget.reservedCents, 0);
    assert.equal(budget.committedCents, 0);
    const savedSettings = await db.settings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    assert.equal(savedSettings.defaultProvider, 'runway');
    assert.equal(savedSettings.providerEnabled, true);
    assert.equal(savedSettings.replicateEnabled, true);
    assert.equal(savedSettings.monthlyBudgetCents, 2000);
    assert.ok(
      (await db.job.findMany()).every(
        (job) =>
          job.provider === 'local' &&
          !job.providerRequested &&
          job.reservedCents === 0,
      ),
    );
    assert.equal((await quickCreate(input)).job.id, final.id);
    passed.push('real-worker-encodes-five-second-branded-mp4');

    const modelInput = {
      ...input,
      action: 'model',
      idempotencyKey: 'model-request',
    };
    assert.equal((await quickCreateCapabilities()).model.available, false);
    await assert.rejects(quickCreate(modelInput), {
      code: 'COMFYUI_FASHION_WORKFLOW_REQUIRED',
    });
    const workflowFile = join(directory, 'workflow.json');
    process.env.COMFYUI_FASHION_WORKFLOW = workflowFile;
    const workflow = {
      version: 1,
      mode: 'fashion-image',
      garmentSlots: 1,
      prompt: {
        '1': {
          class_type: 'TestContractOnly',
          inputs: {
            prompt: '{{prompt}}',
            model: '{{mannequin_parameters}}',
            garment: '{{garment_1}}',
          },
        },
      },
    };
    await writeFile(
      workflowFile,
      JSON.stringify({
        ...workflow,
        prompt: {
          '1': {
            class_type: 'TestContractOnly',
            inputs: {
              ...workflow.prompt['1'].inputs,
              portrait: '{{portrait_image}}',
            },
          },
        },
      }),
    );
    await assert.rejects(quickCreate(modelInput), {
      code: 'COMFYUI_PORTRAIT_REQUIRED',
    });
    await writeFile(
      workflowFile,
      JSON.stringify({
        ...workflow,
        garmentSlots: 2,
        prompt: {
          '1': {
            class_type: 'TestContractOnly',
            inputs: {
              ...workflow.prompt['1'].inputs,
              garment2: '{{garment_2}}',
            },
          },
        },
      }),
    );
    await assert.rejects(quickCreate(modelInput), {
      code: 'COMFYUI_GARMENT_MAPPING_MISMATCH',
    });
    assert.equal(await db.project.count(), 3);
    assert.equal(await db.look.count(), 0);
    assert.equal(await db.mannequin.count(), 0);
    await writeFile(workflowFile, JSON.stringify(workflow));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    running = true;
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.COMFYUI_URL = `http://127.0.0.1:${address.port}`;
    assert.equal((await quickCreateCapabilities()).model.available, false);
    const unavailable = await POST(request(modelInput, { cookie }));
    assert.equal(unavailable.status, 503);
    assert.equal(
      (await unavailable.json()).error.code,
      'COMFYUI_REQUEST_FAILED',
    );
    assert.equal(await db.project.count(), 3);
    assert.equal(await db.look.count(), 0);
    assert.equal(await db.mannequin.count(), 0);
    assert.equal(await db.job.count(), 2);
    passed.push(
      'missing-model-service-and-incompatible-workflows-create-nothing',
    );

    healthyService = true;
    assert.equal((await quickCreateCapabilities()).model.available, true);
    await db.settings.update({
      where: { id: 'default' },
      data: {
        hijab: true,
        preferredStyles: JSON.stringify(['Minimalist', 'Casual Chic']),
      },
    });
    const model = await quickCreate(modelInput);
    assert.equal(model.project.type, 'fashion');
    assert.equal(model.job.provider, 'comfyui');
    assert.equal(model.job.kind, 'fashion_image');
    const modelParameters = record(model.job.parameters);
    assert.equal(modelParameters.sourceKind, 'comfyui-fashion-image');
    assert.deepEqual(modelParameters.garmentMediaIds, [source.id]);
    assert.equal(record(modelParameters.mannequinParameters).hijab, true);
    assert.deepEqual(record(modelParameters.lookParameters).styles, [
      'Minimalist',
      'Casual Chic',
    ]);
    assert.equal(model.job.reservedCents, 0);
    assert.equal(model.job.actualCostCents, 0);
    assert.equal(model.job.providerRequested, false);
    assert.equal(await db.look.count(), 1);
    assert.equal(await db.mannequin.count(), 1);
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: source.id } }))
        .projectId,
      owner.id,
    );
    assert.ok(
      requests.every((line) => line === 'GET /system_stats'),
      'Queueing must not upload images or submit inference',
    );
    passed.push('configured-model-shortcut-preserves-source-and-preferences');

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    running = false;
    delete process.env.COMFYUI_FASHION_WORKFLOW;
    const recovered = await quickCreate(modelInput);
    assert.equal(recovered.job.id, model.job.id);
    assert.equal(recovered.project.id, model.project.id);
    assert.equal(await db.project.count(), 4);
    assert.equal(await db.job.count(), 3);
    assert.equal(
      (
        await db.job.aggregate({
          _sum: { reservedCents: true, actualCostCents: true },
        })
      )._sum.reservedCents,
      0,
    );
    passed.push('acknowledged-model-retry-needs-no-running-service');
    process.stdout.write(JSON.stringify(passed));
  } finally {
    if (running)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
