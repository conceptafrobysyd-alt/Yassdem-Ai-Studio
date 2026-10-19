/** Real private HTTP/SQLite/Sharp phase-3 workflow, using isolated data. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
async function main() {
  const root = process.cwd(),
    directory = await mkdtemp(path.join(tmpdir(), 'yassdem-fashion-http-'));
  const origin = `http://127.0.0.1:${Number(process.env.SMOKE_FASHION_PORT || 4320)}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    STORAGE_DIR: path.join(directory, 'storage'),
    APP_ORIGIN: origin,
    NODE_ENV: 'production' as const,
    RUNWAY_API_KEY: '',
    COMFYUI_URL: 'http://127.0.0.1:1',
    COMFYUI_FASHION_WORKFLOW: '',
    COMFYUI_TRYON_WORKFLOW: '',
  };
  let cookie = '',
    logs = '',
    web: ChildProcess | undefined,
    worker: ChildProcess | undefined;
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function start(args: string[]) {
    const p = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const s of [p.stdout, p.stderr])
      s?.on('data', (b) => {
        logs = (logs + b.toString()).slice(-16000);
      });
    return p;
  }
  async function stop(p: ChildProcess | undefined) {
    if (!p || p.exitCode !== null) return;
    p.kill('SIGTERM');
    await Promise.race([new Promise((r) => p.once('exit', r)), delay(5000)]);
    if (p.exitCode === null) p.kill('SIGKILL');
  }
  async function call(
    url: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const headers = new Headers({ cookie });
    if (method !== 'GET') headers.set('origin', origin);
    if (body && !(body instanceof FormData))
      headers.set('content-type', 'application/json');
    return fetch(origin + url, {
      method,
      headers,
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  }
  async function json(url: string, body?: unknown, method?: string) {
    const r = await call(url, body, method);
    const b = await r.json();
    assert.ok(r.ok, `${url} HTTP${r.status} ${JSON.stringify(b)}`);
    return b;
  }
  async function upload(color: string, name: string, projectId: string) {
    const form = new FormData();
    const bytes = await sharp({
      create: { width: 300, height: 400, channels: 3, background: color },
    })
      .png()
      .toBuffer();
    form.set(
      'file',
      new File([new Uint8Array(bytes)], name, { type: 'image/png' }),
    );
    form.set('role', 'SOURCE');
    form.set('projectId', projectId);
    return (await json('/api/media', form)).media;
  }
  try {
    const migrate = start([
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
    ]);
    await new Promise<void>((resolve, reject) =>
      migrate.once('exit', (c) =>
        c === 0 ? resolve() : reject(new Error('Migration failed')),
      ),
    );
    web = start([
      'node_modules/next/dist/bin/next',
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      new URL(origin).port,
    ]);
    for (let n = 0; n < 80; n++) {
      try {
        if ((await fetch(origin + '/api/bootstrap')).ok) break;
      } catch {}
      await delay(250);
    }
    assert.equal((await fetch(origin + '/api/mannequins')).status, 401);
    const setup = await call('/api/auth/setup', {
      password: randomBytes(24).toString('base64url'),
    });
    assert.ok(setup.ok);
    cookie = setup.headers.get('set-cookie')!.split(';')[0];
    const project = (
      await json('/api/projects', { name: 'Fashion smoke', type: 'lookbook' })
    ).project;
    const red = await upload('#ee0010', 'red.png', project.id),
      blue = await upload('#0010ee', 'blue.png', project.id),
      portrait = await upload('#00bb00', 'portrait.png', project.id);
    const mannequin = (
      await json('/api/mannequins', {
        name: 'Reusable profile',
        description: 'Independent choices',
        referenceMediaId: portrait.id,
        parameters: {
          skinTone: 'deep',
          bodyType: 'curvy',
          heightCm: 175,
          hair: 'braids',
          hijab: false,
          pose: 'standing',
        },
      })
    ).mannequin;
    const look = (
      await json('/api/looks', {
        name: 'Editorial look',
        projectId: project.id,
        mannequinId: mannequin.id,
        garmentMediaIds: [red.id, blue.id],
        parameters: {
          styles: ['Edgy / Grunge'],
          coverage: 'open shoulders',
          colors: ['red', 'blue'],
          accessories: [],
          fit: 'relaxed',
          mood: 'editorial',
          prompt: 'Preserve garments',
        },
      })
    ).look;
    assert.equal(look.mannequin.parameters.hijab, false);
    assert.equal(look.parameters.coverage, 'open shoulders');
    assert.equal(
      (await call('/api/media/' + red.id, {}, 'DELETE')).status,
      409,
    );
    assert.equal(
      (await call('/api/media/' + portrait.id, {}, 'DELETE')).status,
      409,
    );
    console.log(
      'PASS private profiles, reusable garments, independent styles and referenced-media protection',
    );
    const request = { mode: 'collage', idempotencyKey: randomUUID() };
    const queued = (await json('/api/looks/' + look.id + '/render', request))
      .job;
    assert.equal(
      (await json('/api/looks/' + look.id + '/render', request)).job.id,
      queued.id,
    );
    worker = start(['--import', 'tsx', 'src/worker.ts']);
    let done;
    for (let n = 0; n < 120; n++) {
      done = (await json('/api/jobs/' + queued.id)).job;
      if (done.status === 'SUCCEEDED') break;
      if (['FAILED', 'UNKNOWN', 'CANCELLED'].includes(done.status))
        throw new Error(JSON.stringify(done));
      await delay(250);
    }
    assert.equal(done?.status, 'SUCCEEDED');
    assert.equal(done.actualCostCents, 0);
    assert.equal(done.parameters.aiGenerated, false);
    assert.equal(done.parameters.sourceKind, 'collage');
    const rendered = (await json('/api/looks/' + look.id)).look;
    assert.equal(rendered.outputMediaId, done.outputMediaId);
    assert.equal(rendered.sourceMedia.length, 2);
    const bytes = Buffer.from(
      await (await call('/api/media/' + done.outputMediaId)).arrayBuffer(),
    );
    const image = sharp(bytes);
    const meta = await image.metadata();
    assert.ok(
      meta.width && meta.height && meta.width > 300 && meta.height > 400,
    );
    assert.equal(meta.format, 'png');
    console.log(
      'PASS persistent worker renders a real contact sheet, without duplicate jobs or fake AI',
    );
    const variant = (await json('/api/looks/' + look.id + '/duplicate', {}))
      .look;
    assert.notEqual(variant.id, look.id);
    assert.equal(variant.mannequinId, mannequin.id);
    const clone = (await json('/api/projects/' + project.id + '/duplicate', {}))
      .project;
    const copied = (await json('/api/looks?projectId=' + clone.id)).looks;
    assert.ok(copied.length >= 2);
    assert.notEqual(copied[0].garmentMediaIds[0], red.id);
    assert.ok((await call('/api/media/' + copied[0].garmentMediaIds[0])).ok);
    const archive = await call('/api/projects/' + project.id + '/archive');
    assert.equal(archive.status, 200);
    assert.equal(
      Buffer.from(await archive.arrayBuffer()).readUInt32LE(0),
      0x04034b50,
    );
    const missing = await call('/api/looks/' + look.id + '/render', {
      mode: 'try-on',
      idempotencyKey: randomUUID(),
    });
    assert.ok(missing.status >= 400);
    const count = (await json('/api/jobs')).jobs.length;
    assert.equal(count, 1);
    console.log(
      'PASS look variants, independent project copies, complete ZIP and explicit missing-Comfy rejection',
    );
  } catch (e) {
    console.error(logs);
    throw e;
  } finally {
    await stop(worker);
    await stop(web);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
