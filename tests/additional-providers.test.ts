import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  downloadReplicateArtifact,
  readReplicateConfiguration,
  ReplicateProvider,
  validateReplicateArtifactUrl,
} from '../src/lib/providers/replicate';
import {
  OllamaProvider,
  validateOllamaEndpoint,
} from '../src/lib/providers/ollama';
import { getProviderRegistry } from '../src/lib/providers/registry';

const version = 'a'.repeat(64);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Replicate adapter, with simulated network only', () => {
  it('requires a pinned model, output kind and positive explicit EUR reservation', () => {
    vi.stubEnv('REPLICATE_MODEL_VERSION', '');
    vi.stubEnv('REPLICATE_OUTPUT_KIND', '');
    vi.stubEnv('REPLICATE_ESTIMATE_CENTS', '');
    expect(() => readReplicateConfiguration()).toThrow(
      'REPLICATE_MODEL_VERSION_REQUIRED',
    );
    expect(() =>
      readReplicateConfiguration({
        version,
        outputKind: 'image',
        estimateCents: '0',
      }),
    ).toThrow('REPLICATE_ESTIMATE_REQUIRED');
    expect(() =>
      readReplicateConfiguration({
        version,
        outputKind: 'json',
        estimateCents: '25',
      }),
    ).toThrow('REPLICATE_OUTPUT_KIND_REQUIRED');
    expect(() =>
      readReplicateConfiguration({
        version: 'latest',
        outputKind: 'image',
        estimateCents: '25',
      }),
    ).toThrow('REPLICATE_MODEL_VERSION_REQUIRED');
    expect(
      readReplicateConfiguration({
        version,
        outputKind: 'image',
        estimateCents: '25',
      }),
    ).toEqual({ version, outputKind: 'image', estimateCents: 25 });
  });

  it('uses official read-only account and versioned prediction endpoints', async () => {
    const fake = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ id: 'prediction-123' })),
      );
    const provider = new ReplicateProvider({
      apiToken: 'test-token',
      fetchImpl: fake,
    });
    expect(await provider.checkConnection()).toEqual({ ok: true });
    expect(fake.mock.calls[0][0]).toBe('https://api.replicate.com/v1/account');
    expect(fake.mock.calls[0][1].method).toBe('GET');
    await provider.createPrediction({
      version,
      prompt: 'A blue dress',
      imageDataUri: 'data:image/png;base64,AAAA',
    });
    expect(fake.mock.calls[1][0]).toBe(
      'https://api.replicate.com/v1/predictions',
    );
    expect(JSON.parse(fake.mock.calls[1][1].body)).toEqual({
      version,
      input: { prompt: 'A blue dress', image: 'data:image/png;base64,AAAA' },
    });
    expect(fake.mock.calls[1][1].redirect).toBe('error');
    await provider.cancelTask('prediction-123');
    expect(fake.mock.calls[2][0]).toBe(
      'https://api.replicate.com/v1/predictions/prediction-123/cancel',
    );
    expect(fake.mock.calls[2][1].method).toBe('POST');
  });

  it('excludes compute metrics and provider prose from task and error responses', async () => {
    const fake = vi.fn().mockResolvedValue(
      Response.json({
        id: 'p1',
        status: 'failed',
        metrics: { predict_time: 9 },
        cost: 123,
        error: 'secret-provider-error',
        logs: 'private logs',
      }),
    );
    const provider = new ReplicateProvider({
      apiToken: 'test-token',
      fetchImpl: fake,
    });
    expect(await provider.getTask('p1')).toEqual({
      id: 'p1',
      status: 'failed',
      output: [],
      failureCode: 'REPLICATE_GENERATION_FAILED',
    });
    fake.mockResolvedValue(
      Response.json({ detail: 'test-token' }, { status: 401 }),
    );
    expect(await provider.checkConnection()).toEqual({
      ok: false,
      code: 'REPLICATE_AUTH_FAILED',
    });
  });

  it('never POSTs a mutable model name, remote source URL or path-bearing prediction ID', async () => {
    const fake = vi.fn();
    const provider = new ReplicateProvider({
      apiToken: 'test-token',
      fetchImpl: fake,
    });
    await expect(
      provider.createPrediction({ version: 'latest', prompt: 'Dress' }),
    ).rejects.toMatchObject({ code: 'REPLICATE_MODEL_VERSION_REQUIRED' });
    await expect(
      provider.createPrediction({
        version,
        prompt: 'Dress',
        imageDataUri: 'https://127.0.0.1/secret',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_IMAGE' });
    await expect(provider.getTask('../account')).rejects.toMatchObject({
      code: 'INVALID_TASK_ID',
    });
    expect(fake).not.toHaveBeenCalled();
  });

  it.each([
    'http://replicate.delivery/file.png',
    'https://127.0.0.1/file.png',
    'https://replicate.delivery.evil.test/file.png',
    'https://evilreplicate.delivery/file.png',
    'https://replicate.delivery:8080/file.png',
    'https://user:secret@replicate.delivery/file.png',
  ])('rejects an untrusted artifact destination: %s', (value) => {
    expect(() => validateReplicateArtifactUrl(value)).toThrow(
      'UNSAFE_ARTIFACT_URL',
    );
  });

  it('downloads only bounded, decoded images from the provider host and removes invalid files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yassdem-replicate-artifact-'));
    try {
      const image = await sharp({
        create: { width: 3, height: 4, channels: 3, background: '#123456' },
      })
        .png()
        .toBuffer();
      const fake = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(image, { headers: { 'content-type': 'image/png' } }),
          ),
        );
      const destination = join(dir, 'image');
      await expect(
        downloadReplicateArtifact(
          'https://replicate.delivery/file.png',
          destination,
          'image',
          { fetchImpl: fake },
        ),
      ).resolves.toMatchObject({
        mimeType: 'image/png',
        width: 3,
        height: 4,
        bytes: image.length,
      });
      expect(fake.mock.calls[0][1].redirect).toBe('error');
      const over = join(dir, 'over');
      await expect(
        downloadReplicateArtifact(
          'https://replicate.delivery/file.png',
          over,
          'image',
          { fetchImpl: fake, maxBytes: 12 },
        ),
      ).rejects.toMatchObject({ code: 'ARTIFACT_TOO_LARGE' });
      await expect(stat(over)).rejects.toThrow();
      fake.mockImplementation(() =>
        Promise.resolve(
          new Response('fake PNG header', {
            headers: { 'content-type': 'image/png' },
          }),
        ),
      );
      const invalid = join(dir, 'invalid');
      await expect(
        downloadReplicateArtifact(
          'https://replicate.delivery/file.png',
          invalid,
          'image',
          { fetchImpl: fake },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT' });
      await expect(stat(invalid)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('decodes an actual downloaded MP4 and rejects spoofed or corrupted video', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yassdem-replicate-video-'));
    try {
      const source = join(dir, 'source.mp4');
      await promisify(execFile)(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-f',
          'lavfi',
          '-i',
          'color=c=blue:s=32x24:r=5',
          '-t',
          '1',
          '-c:v',
          'libx264',
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          source,
        ],
        { timeout: 15_000 },
      );
      const video = await readFile(source);
      const fake = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(video, { headers: { 'content-type': 'video/mp4' } }),
          ),
        );
      await expect(
        downloadReplicateArtifact(
          'https://x.replicate.delivery/output.mp4',
          join(dir, 'output.mp4'),
          'video',
          { fetchImpl: fake },
        ),
      ).resolves.toMatchObject({
        mimeType: 'video/mp4',
        width: 32,
        height: 24,
        duration: 1,
      });
      fake.mockImplementation(() =>
        Promise.resolve(
          new Response(
            Buffer.concat([
              Buffer.from([0, 0, 0, 12]),
              Buffer.from('ftypisom'),
            ]),
            { headers: { 'content-type': 'video/mp4' } },
          ),
        ),
      );
      const invalid = join(dir, 'invalid.mp4');
      await expect(
        downloadReplicateArtifact(
          'https://replicate.delivery/invalid.mp4',
          invalid,
          'video',
          { fetchImpl: fake },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT' });
      await expect(stat(invalid)).rejects.toThrow();
      // Keep the valid moov metadata (dimensions and duration), but corrupt the
      // compressed frames. A probe alone accepts this; decoding must reject it.
      const corrupted = Buffer.from(video);
      let changed = false;
      for (let offset = 0; offset + 8 <= corrupted.length;) {
        const size = corrupted.readUInt32BE(offset);
        if (size < 8 || offset + size > corrupted.length) break;
        if (corrupted.toString('ascii', offset + 4, offset + 8) === 'mdat') {
          corrupted.fill(0, offset + 8, offset + size);
          changed = true;
        }
        offset += size;
      }
      expect(changed).toBe(true);
      fake.mockImplementation(() =>
        Promise.resolve(
          new Response(corrupted, { headers: { 'content-type': 'video/mp4' } }),
        ),
      );
      const broken = join(dir, 'broken.mp4');
      await expect(
        downloadReplicateArtifact(
          'https://replicate.delivery/broken.mp4',
          broken,
          'video',
          { fetchImpl: fake },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT' });
      await expect(stat(broken)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);

  it('rejects real MP4 containers with no frames or a duration over thirty minutes', async () => {
    const dir = await mkdtemp(
      join(tmpdir(), 'yassdem-replicate-video-limits-'),
    );
    try {
      for (const [name, options] of [
        ['empty', ['-t', '0', '-movflags', 'empty_moov+frag_keyframe']],
        ['long', ['-frames:v', '1']],
      ] as const) {
        const source = join(dir, `${name}.mp4`);
        await promisify(execFile)(
          process.env.FFMPEG_PATH || 'ffmpeg',
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-f',
            'lavfi',
            '-i',
            `color=c=blue:s=32x24:r=${name === 'long' ? '1/1801' : '5'}`,
            ...options,
            '-c:v',
            'libx264',
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            source,
          ],
          { timeout: 15_000 },
        );
        const bytes = await readFile(source);
        const destination = join(dir, `${name}-import.mp4`);
        await expect(
          downloadReplicateArtifact(
            `https://replicate.delivery/${name}.mp4`,
            destination,
            'video',
            {
              fetchImpl: async () =>
                new Response(bytes, {
                  headers: { 'content-type': 'video/mp4' },
                }),
            },
          ),
        ).rejects.toMatchObject({ code: 'INVALID_ARTIFACT' });
        await expect(stat(destination)).rejects.toThrow();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('Local Ollama, with simulated network only', () => {
  it.each([
    'https://api.example.com',
    'http://192.168.1.2:11434',
    'http://127.0.0.1:11434/path',
    'http://user:pass@localhost:11434',
  ])('rejects a non-loopback or decorated endpoint: %s', (endpoint) =>
    expect(() => validateOllamaEndpoint(endpoint)).toThrow(
      'OLLAMA_INVALID_ENDPOINT',
    ),
  );

  it('checks the exact installed tag before requesting bounded, nonstreamed JSON generation', async () => {
    const fake = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ models: [{ name: 'qwen3:8b' }] }))
      .mockResolvedValueOnce(
        Response.json({
          done: true,
          response: JSON.stringify({ titles: ['Robe bleue'] }),
        }),
      );
    const provider = new OllamaProvider({ model: 'qwen3:8b', fetchImpl: fake });
    expect(
      await provider.generateJson({
        prompt: 'Generate factual copy',
        system: 'Use French.',
        maxTokens: 4096,
      }),
    ).toEqual({ titles: ['Robe bleue'] });
    expect(String(fake.mock.calls[0][0])).toBe(
      'http://127.0.0.1:11434/api/tags',
    );
    expect(String(fake.mock.calls[1][0])).toBe(
      'http://127.0.0.1:11434/api/generate',
    );
    const body = JSON.parse(fake.mock.calls[1][1].body);
    expect(body).toMatchObject({
      model: 'qwen3:8b',
      stream: false,
      format: 'json',
      options: { num_predict: 4096 },
    });
    expect(body.system).toContain('Never invent certifications');
    expect(fake.mock.calls[1][1].redirect).toBe('error');
  });

  it('does not download a missing model or accept a truncated JSON response', async () => {
    const fake = vi.fn().mockResolvedValueOnce(Response.json({ models: [] }));
    const provider = new OllamaProvider({
      model: 'missing:tag',
      fetchImpl: fake,
    });
    await expect(
      provider.generateJson({ prompt: 'Copy' }),
    ).rejects.toMatchObject({ code: 'OLLAMA_MODEL_NOT_FOUND' });
    expect(fake).toHaveBeenCalledTimes(1);
    fake
      .mockResolvedValueOnce(
        Response.json({ models: [{ name: 'missing:tag' }] }),
      )
      .mockResolvedValueOnce(Response.json({ done: false, response: '{}' }));
    await expect(
      provider.generateJson({ prompt: 'Copy' }),
    ).rejects.toMatchObject({ code: 'OLLAMA_INVALID_RESPONSE' });
  });

  it('returns safe registry capabilities without checking a remote service by default', async () => {
    vi.stubEnv('REPLICATE_API_TOKEN', 'private-test-token');
    vi.stubEnv('REPLICATE_MODEL_VERSION', version);
    vi.stubEnv('REPLICATE_OUTPUT_KIND', 'image');
    vi.stubEnv('REPLICATE_ESTIMATE_CENTS', '25');
    vi.stubEnv('OLLAMA_MODEL', 'qwen3:8b');
    const fake = vi.fn();
    vi.stubGlobal('fetch', fake);
    const statuses = await getProviderRegistry();
    expect(statuses.find((s) => s.id === 'replicate')).toMatchObject({
      configured: true,
      capabilities: ['prompt-to-image'],
      estimateCents: 25,
      connection: 'unchecked',
    });
    expect(statuses.find((s) => s.id === 'ollama')).toMatchObject({
      configured: true,
      capabilities: ['marketing-json'],
    });
    expect(JSON.stringify(statuses)).not.toContain('private-test-token');
    expect(fake).not.toHaveBeenCalled();
  });
});

describe('Replicate persisted financial and crash safeguards', () => {
  it('verifies zero budget, shared reservations, cancellation and a single ambiguous POST in real Node', async () => {
    // Keep the native SQLite adapter in the same Node runtime as the real worker.
    const script = `
      import assert from 'node:assert/strict';
      import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      import { DatabaseSync } from 'node:sqlite';
      const dir = await mkdtemp(join(tmpdir(), 'yassdem-replicate-budget-'));
      process.env.DATABASE_URL = 'file:' + join(dir, 'test.db');
      process.env.STORAGE_DIR = join(dir, 'storage');
      process.env.REPLICATE_API_TOKEN = 'dummy-never-sent';
      process.env.REPLICATE_MODEL_VERSION = '${version}';
      process.env.REPLICATE_OUTPUT_KIND = 'image';
      process.env.REPLICATE_ESTIMATE_CENTS = '25';
      const sqlite = new DatabaseSync(join(dir, 'test.db'));
      const migrations = join(process.cwd(), 'prisma/migrations');
      for (const migration of (await readdir(migrations, { withFileTypes: true })).filter(v => v.isDirectory()).sort((a,b) => a.name.localeCompare(b.name)))
        sqlite.exec(await readFile(join(migrations, migration.name, 'migration.sql'), 'utf8'));
      sqlite.close();
      const { db } = await import(${JSON.stringify(join(process.cwd(), 'src/lib/db.ts'))});
      const jobs = await import(${JSON.stringify(join(process.cwd(), 'src/lib/replicate-jobs.ts'))});
      const { updateSettings } = await import(${JSON.stringify(join(process.cwd(), 'src/lib/settings.ts'))});
      let requests = 0;
      globalThis.fetch = async () => { requests++; throw new Error('Ambiguous response'); };
      const input = key => ({projectId:'p1',prompt:'Blue dress',confirmedPaid:true,expectedCostCents:25,expectedModelVersion:'${version}',idempotencyKey:key});
      const reset = async budget => {
        requests = 0;
        await db.job.deleteMany(); await db.media.deleteMany(); await db.project.deleteMany(); await db.settings.deleteMany();
        await db.project.create({data:{id:'p1',name:'Test'}});
        await db.settings.create({data:{replicateEnabled:true,monthlyBudgetCents:budget}});
      };
      const passed = [];
      try {
        const defaults = await db.settings.create({data:{}});
        assert.equal(defaults.replicateEnabled,false);
        await assert.rejects(updateSettings({replicateEnabled:'true'}), {code:'INVALID_SETTINGS'});
        assert.equal((await updateSettings({replicateEnabled:true})).replicateEnabled,true);
        passed.push('activation-default-and-validation');
        await reset(0);
        await assert.rejects(jobs.enqueueReplicateJob(input('zero')), {code:'BUDGET_EXCEEDED'});
        assert.equal(requests,0); assert.equal(await db.job.count(),0); passed.push('zero-budget');
        await reset(50);
        await assert.rejects(jobs.enqueueReplicateJob({...input('confirm'),confirmedPaid:false}), {code:'PAID_CONFIRMATION_REQUIRED'});
        await assert.rejects(jobs.enqueueReplicateJob({...input('price'),expectedCostCents:24}), {code:'PRICE_CHANGED'});
        await db.settings.update({where:{id:'default'},data:{replicateEnabled:false}});
        await assert.rejects(jobs.enqueueReplicateJob(input('disabled')), {code:'REPLICATE_DISABLED'});
        assert.equal(requests,0); passed.push('activation-confirmation-price');
        await reset(25);
        await assert.rejects(jobs.enqueueReplicateJob({...input('missing-model'),expectedModelVersion:undefined}), {code:'MODEL_VERSION_REQUIRED'});
        await assert.rejects(jobs.enqueueReplicateJob({...input('mutable-model'),expectedModelVersion:'latest'}), {code:'MODEL_VERSION_REQUIRED'});
        process.env.REPLICATE_MODEL_VERSION = 'b'.repeat(64);
        await assert.rejects(jobs.enqueueReplicateJob(input('same-price-new-model')), {code:'MODEL_CHANGED'});
        assert.equal(await db.job.count(),0); assert.equal(requests,0);
        process.env.REPLICATE_MODEL_VERSION = '${version}';
        const original = await jobs.enqueueReplicateJob(input('retry-after-change'));
        process.env.REPLICATE_MODEL_VERSION = 'b'.repeat(64);
        process.env.REPLICATE_API_TOKEN = '';
        assert.equal((await jobs.enqueueReplicateJob(input('retry-after-change'))).id,original.id);
        await assert.rejects(jobs.enqueueReplicateJob({...input('retry-after-change'),expectedModelVersion:'b'.repeat(64)}), {code:'IDEMPOTENCY_CONFLICT'});
        assert.equal(await db.job.count(),1); assert.equal(requests,0);
        process.env.REPLICATE_MODEL_VERSION = '${version}';
        process.env.REPLICATE_API_TOKEN = 'dummy-never-sent';
        passed.push('model-consent-and-retry-after-config-change');
        await reset(25);
        await db.job.create({data:{projectId:'p1',sourceMediaId:'',provider:'runway',kind:'generation',budgetMonth:new Date().toISOString().slice(0,7),reservedCents:25,idempotencyKey:'runway-reservation'}});
        await assert.rejects(jobs.enqueueReplicateJob(input('shared')), {code:'BUDGET_EXCEEDED'});
        assert.equal(requests,0); passed.push('shared-ledger');
        await reset(25);
        const pending = await jobs.enqueueReplicateJob(input('pending'));
        assert.equal((await jobs.enqueueReplicateJob(input('pending'))).id,pending.id);
        await assert.rejects(jobs.enqueueReplicateJob({...input('pending'),prompt:'Changed'}), {code:'IDEMPOTENCY_CONFLICT'});
        const cancelled = await jobs.cancelReplicateJob(pending.id);
        assert.equal(cancelled.reservedCents,0); assert.equal(cancelled.status,'CANCELLED'); assert.equal(requests,0); passed.push('idempotency-and-free-cancel');
        await reset(25);
        const lowered = await jobs.enqueueReplicateJob(input('lowered'));
        await db.settings.update({where:{id:'default'},data:{monthlyBudgetCents:0}});
        await jobs.processReplicateJobs();
        const blocked = await db.job.findUniqueOrThrow({where:{id:lowered.id}});
        assert.equal(blocked.status,'FAILED'); assert.equal(blocked.reservedCents,0); assert.equal(requests,0); passed.push('worker-rechecks-budget');
        await reset(25);
        const unknown = await jobs.enqueueReplicateJob(input('unknown'));
        await jobs.processReplicateJobs(); await jobs.processReplicateJobs();
        const saved = await db.job.findUniqueOrThrow({where:{id:unknown.id}});
        assert.equal(saved.status,'UNKNOWN'); assert.equal(saved.providerRequested,true); assert.equal(saved.reservedCents,25); assert.equal(saved.actualCostCents,null); assert.equal(requests,1);
        passed.push('ambiguous-post-never-retried');
        await reset(25);
        const running = await jobs.enqueueReplicateJob(input('running'));
        await db.job.update({where:{id:running.id},data:{providerRequested:true,providerTaskId:'p123',status:'RUNNING'}});
        globalThis.fetch = async (url,init) => { requests++; assert.ok(String(url).endsWith('/predictions/p123/cancel')); assert.equal(init.method,'POST'); return Response.json({status:'canceled'}); };
        const canceledPaid = await jobs.cancelReplicateJob(running.id);
        assert.equal(canceledPaid.status,'CANCELLED'); assert.equal(canceledPaid.reservedCents,25); assert.equal(canceledPaid.actualCostCents,null); passed.push('submitted-cancel-retains-reservation');
        await reset(25);
        const terminal = await jobs.enqueueReplicateJob(input('terminal'));
        await db.job.update({where:{id:terminal.id},data:{providerRequested:true,providerTaskId:'p456',status:'RUNNING',updatedAt:new Date(Date.now()-6000)}});
        globalThis.fetch = async () => { requests++; return Response.json({id:'p456',status:'failed',metrics:{predict_time:10},error:'never expose'}); };
        await jobs.processReplicateJobs();
        const failed = await db.job.findUniqueOrThrow({where:{id:terminal.id}});
        assert.equal(failed.status,'FAILED'); assert.equal(failed.reservedCents,25); assert.equal(failed.actualCostCents,null); passed.push('compute-time-is-not-cost');
        await reset(25);
        const queued = await jobs.enqueueReplicateJob(input('changed-model'));
        process.env.REPLICATE_MODEL_VERSION = 'b'.repeat(64);
        await jobs.processReplicateJobs();
        const changed = await db.job.findUniqueOrThrow({where:{id:queued.id}});
        assert.equal(changed.status,'FAILED'); assert.equal(changed.errorCode,'REPLICATE_CONFIGURATION_CHANGED');
        assert.equal(changed.reservedCents,0); assert.equal(requests,0);
        process.env.REPLICATE_MODEL_VERSION = '${version}';
        passed.push('immutable-queued-configuration');
        await reset(25);
        const other = await db.job.create({data:{projectId:'p1',sourceMediaId:'',provider:'local',kind:'edit',budgetMonth:new Date().toISOString().slice(0,7),status:'PROCESSING',idempotencyKey:'editor-untouched'}});
        await jobs.processReplicateJobs();
        assert.equal((await db.job.findUniqueOrThrow({where:{id:other.id}})).status,'PROCESSING');
        assert.equal(requests,0); passed.push('worker-isolation');
        await reset(25);
        const sharp = (await import('sharp')).default;
        const pixels = await sharp({create:{width:6,height:8,channels:3,background:'#123456'}}).png().toBuffer();
        globalThis.fetch = async (url,init) => {
          requests++;
          if (init?.method === 'POST') {
            assert.equal(String(url),'https://api.replicate.com/v1/predictions');
            assert.deepEqual(JSON.parse(init.body),{version:'${version}',input:{prompt:'Blue dress'}});
            return Response.json({id:'p789',status:'starting'});
          }
          if (String(url) === 'https://api.replicate.com/v1/predictions/p789')
            return Response.json({id:'p789',status:'succeeded',output:['https://replicate.delivery/result.png','https://replicate.delivery/second.png'],metrics:{predict_time:10}});
          assert.equal(String(url),'https://replicate.delivery/result.png');
          assert.equal(init.headers,undefined);
          return new Response(pixels,{headers:{'content-type':'image/png'}});
        };
        const result = await jobs.enqueueReplicateJob(input('successful'));
        await jobs.processReplicateJobs();
        assert.equal((await db.job.findUniqueOrThrow({where:{id:result.id}})).status,'RUNNING');
        await db.job.update({where:{id:result.id},data:{updatedAt:new Date(Date.now()-6000)}});
        await jobs.processReplicateJobs();
        const completed = await db.job.findUniqueOrThrow({where:{id:result.id}});
        assert.equal(completed.status,'SUCCEEDED'); assert.equal(completed.reservedCents,25); assert.equal(completed.actualCostCents,null);
        const meta = JSON.parse(completed.parameters);
        assert.equal(meta.nativeWidth,6); assert.equal(meta.nativeHeight,8); assert.equal(meta.upscaled,false);
        assert.equal(meta.providerOutputCount,2); assert.equal(meta.outputSelection,'first');
        const output = await db.media.findUniqueOrThrow({where:{id:completed.outputMediaId}});
        assert.equal(output.mimeType,'image/png'); assert.equal(output.width,6); assert.equal(output.height,8);
        assert.deepEqual(await readFile(join(process.env.STORAGE_DIR,output.path)),pixels);
        assert.equal(requests,3); passed.push('native-output-persisted-reservation-retained');
        console.log(JSON.stringify(passed));
      } finally { await db.$disconnect(); await rm(dir,{recursive:true,force:true}); }
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(JSON.parse(stdout)).toEqual([
      'activation-default-and-validation',
      'zero-budget',
      'activation-confirmation-price',
      'model-consent-and-retry-after-config-change',
      'shared-ledger',
      'idempotency-and-free-cancel',
      'worker-rechecks-budget',
      'ambiguous-post-never-retried',
      'submitted-cancel-retains-reservation',
      'compute-time-is-not-cost',
      'immutable-queued-configuration',
      'worker-isolation',
      'native-output-persisted-reservation-retained',
    ]);
  }, 35_000);
});
