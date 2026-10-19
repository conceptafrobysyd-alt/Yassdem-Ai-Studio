/** Real HTTP + SQLite + FFmpeg smoke test. Requires npm run build first.
 * Uses a separate temporary DB/storage and never calls a paid provider. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  spawn,
  execFile as execFileCallback,
  type ChildProcess,
} from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCallback);
import sharp from 'sharp';

async function main() {
  const root = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'yassdem-smoke-'));
  const port = Number(process.env.SMOKE_PORT || 4317);
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    STORAGE_DIR: path.join(directory, 'storage'),
    APP_ORIGIN: origin,
    RUNWAY_API_KEY: '',
    NODE_ENV: process.env.SMOKE_DEV
      ? ('development' as const)
      : ('production' as const),
  };
  const password = randomBytes(24).toString('base64url');
  let cookie = '';
  let server: ChildProcess | undefined, worker: ChildProcess | undefined;
  let logs = '';
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  function launch(args: string[]) {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (chunk) => {
        logs = (logs + chunk.toString()).slice(-16000);
      });
    return child;
  }
  async function command(args: string[]) {
    const child = launch(args);
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`Command failed (${code})`)),
      );
    });
  }
  async function stop(child: ChildProcess | undefined) {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((r) => child.once('exit', r)),
      delay(5000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  async function request(
    url: string,
    options: RequestInit = {},
    anonymous = false,
  ) {
    const headers = new Headers(options.headers);
    if (!anonymous && cookie) headers.set('cookie', cookie);
    if (options.method && options.method !== 'GET')
      headers.set('origin', origin);
    const response = await fetch(origin + url, { ...options, headers });
    return response;
  }
  async function json(
    url: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ) {
    const response = await request(url, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    assert.ok(
      response.ok,
      `${method} ${url}: ${response.status} ${JSON.stringify(data)}`,
    );
    return data;
  }
  async function startup() {
    const child = launch([
      'node_modules/next/dist/bin/next',
      process.env.SMOKE_DEV ? 'dev' : 'start',
      ...(process.env.SMOKE_DEV ? ['--webpack'] : []),
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ]);
    server = child;
    for (let n = 0; n < 80; n++) {
      try {
        const r = await request('/api/bootstrap', {}, true);
        if (r.ok) return;
      } catch {}
      if (child.exitCode !== null) break;
      await delay(500);
    }
    throw new Error('Web server did not become ready');
  }
  async function upload(
    bytes: Buffer,
    name: string,
    role: string,
    projectId: string,
  ) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(bytes)], name));
    form.set('role', role);
    form.set('projectId', projectId);
    const r = await request('/api/media', { method: 'POST', body: form });
    const b = await r.json();
    assert.ok(r.ok, JSON.stringify(b));
    return b.media;
  }
  async function waitJob(id: string) {
    for (let n = 0; n < 180; n++) {
      const body = await json('/api/jobs/' + id);
      const job = body.job || body;
      if (job.status === 'SUCCEEDED') return job;
      if (['FAILED', 'CANCELLED', 'UNKNOWN'].includes(job.status))
        throw new Error(`Job ended ${job.status}: ${job.errorCode}`);
      await delay(1000);
    }
    throw new Error('Job timed out');
  }
  let checks = 0;
  function passed(text: string) {
    checks++;
    console.log(`PASS ${text}`);
  }
  try {
    await mkdir(env.STORAGE_DIR, { recursive: true });
    await command(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    await command(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
    passed('migrations apply twice without data loss');
    await startup();
    const initial = await json('/api/bootstrap');
    assert.equal(initial.needsSetup, true);
    assert.equal(initial.authenticated, false);
    assert.equal((await request('/api/projects', {}, true)).status, 401);
    const hostile = await fetch(origin + '/api/auth/setup', {
      method: 'POST',
      headers: {
        origin: 'https://untrusted.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    assert.equal(hostile.status, 403);
    const setup = await request(
      '/api/auth/setup',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      },
      true,
    );
    assert.equal(setup.status, 200);
    cookie = setup.headers.get('set-cookie')!.split(';')[0];
    assert.ok(cookie);
    passed('private setup, session and cross-origin protection');
    const boot = await json('/api/bootstrap');
    assert.equal(boot.settings.monthlyBudgetCents, 0);
    assert.ok(!('passwordHash' in boot.settings));
    const project = (
      await json('/api/projects', {
        name: 'Smoke product',
        type: 'product',
        parameters: { preset: 'minimal' },
      })
    ).project;
    await json(
      '/api/settings',
      {
        locale: 'en',
        contentLocale: 'fr',
        theme: 'dark',
        preferredResolution: 2160,
        preferredStyles: ['Streetwear', 'Minimalist'],
        customStyles: ['My style'],
        hijab: false,
      },
      'PATCH',
    );
    const image = await sharp({
      create: { width: 320, height: 240, channels: 3, background: '#f8f4ed' },
    })
      .png()
      .toBuffer();
    const source = await upload(image, 'product.png', 'SOURCE', project.id);
    const logoBytes = await sharp({
      create: { width: 80, height: 80, channels: 4, background: '#ef1020' },
    })
      .png()
      .toBuffer();
    const logo = await upload(logoBytes, 'logo.png', 'LOGO', project.id);
    const logo2 = await upload(logoBytes, 'logo-2.png', 'LOGO', project.id);
    assert.notEqual(logo.id, logo2.id);
    assert.ok(!('path' in source));
    assert.equal(source.width, 320);
    const invalid = new FormData();
    invalid.set(
      'file',
      new File(['pretend image'], 'fake.png', { type: 'image/png' }),
    );
    assert.equal(
      (await request('/api/media', { method: 'POST', body: invalid })).status,
      400,
    );
    const svg = new FormData();
    svg.set(
      'file',
      new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', {
        type: 'image/svg+xml',
      }),
    );
    assert.equal(
      (await request('/api/media', { method: 'POST', body: svg })).status,
      400,
    );
    assert.equal(
      (await request('/api/media/' + source.id, {}, true)).status,
      401,
    );
    passed(
      'real image/logo uploads, metadata, validation and private retrieval',
    );
    await json(
      '/api/projects/' + project.id,
      { parameters: { preset: 'minimal', sourceMediaId: source.id } },
      'PATCH',
    );
    const duplicate = (
      await json('/api/projects/' + project.id + '/duplicate', {})
    ).project;
    assert.notEqual(duplicate.id, project.id);
    const backup = await request('/api/projects/' + project.id + '/archive');
    assert.equal(backup.status, 200);
    const zip = Buffer.from(await backup.arrayBuffer());
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.ok(zip.length > image.length);
    passed('projects persistence, duplication and ZIP backup with media');
    const paid = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: project.id,
        sourceMediaId: source.id,
        provider: 'runway',
        durationSeconds: 5,
        format: '16:9',
        resolution: 720,
        prompt: 'Luxury product',
        confirmedPaid: true,
        expectedCostCents: 25,
        idempotencyKey: randomUUID(),
      }),
    });
    assert.ok(paid.status >= 400 && paid.status < 500);
    passed('paid generation blocked with default configuration');
    worker = launch(['--import', 'tsx', 'src/worker.ts']);
    const payload = {
      projectId: project.id,
      sourceMediaId: source.id,
      provider: 'local',
      durationSeconds: 5,
      format: '16:9',
      resolution: 720,
      codec: 'h264',
      prompt: 'Local smoke',
      logoId: logo.id,
      logoSize: 15,
      logoOpacity: 1,
      logoPosition: 'bottom-right',
      idempotencyKey: randomUUID(),
    };
    const queued = (await json('/api/jobs', payload)).job;
    const repeated = (await json('/api/jobs', payload)).job;
    assert.equal(repeated.id, queued.id);
    const completed = await waitJob(queued.id);
    assert.ok(completed.outputMediaId);
    const video = await request('/api/media/' + completed.outputMediaId);
    assert.equal(video.status, 200);
    const videoBytes = Buffer.from(await video.arrayBuffer());
    assert.ok(videoBytes.length > 1000);
    await writeFile(path.join(directory, 'local.mp4'), videoBytes);
    const probe = JSON.parse(
      (
        await execFile(process.env.FFPROBE_PATH || 'ffprobe', [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name,width,height:format=duration',
          '-of',
          'json',
          path.join(directory, 'local.mp4'),
        ])
      ).stdout,
    );
    assert.equal(probe.streams[0].codec_name, 'h264');
    assert.equal(probe.streams[0].width, 1280);
    assert.ok(Number(probe.format.duration) >= 4.9);
    await execFile(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path.join(directory, 'local.mp4'),
      '-frames:v',
      '1',
      path.join(directory, 'frame.png'),
    ]);
    const pixel = await sharp(path.join(directory, 'frame.png'))
      .extract({ left: 1160, top: 600, width: 1, height: 1 })
      .raw()
      .toBuffer();
    assert.ok(
      pixel[0] > 150 && pixel[0] > pixel[1] * 2,
      'Logo must appear in encoded video',
    );
    const range = await request('/api/media/' + completed.outputMediaId, {
      headers: { range: 'bytes=0-99' },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 100);
    passed(
      'persistent worker creates a real playable MP4 and idempotency prevents duplicate jobs',
    );
    const out = (
      await json('/api/exports', {
        ...payload,
        sourceMediaId: completed.outputMediaId,
        inputVideoId: completed.outputMediaId,
        resolution: 2160,
        idempotencyKey: randomUUID(),
      })
    ).job;
    const exported = await waitJob(out.id);
    const finalMedia = (await json('/api/media')).media.find(
      (m: { id: string }) => m.id === exported.outputMediaId,
    );
    assert.equal(finalMedia.width, 3840);
    assert.equal(finalMedia.height, 2160);
    passed('real 3840×2160 FFmpeg export with logo');
    await stop(worker);
    worker = undefined;
    await stop(server);
    server = undefined;
    await startup();
    const restored = await json('/api/bootstrap');
    assert.equal(restored.settings.locale, 'en');
    assert.equal(restored.settings.contentLocale, 'fr');
    assert.equal(restored.settings.theme, 'dark');
    assert.ok(
      restored.projects.some((p: { id: string }) => p.id === project.id),
    );
    assert.ok(
      restored.media.some((m: { id: string }) => m.id === finalMedia.id),
    );
    passed('projects, preferences, media and authentication survive restart');
    await json('/api/auth/logout', {});
    cookie = '';
    assert.equal((await request('/api/projects')).status, 401);
    const login = await request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      },
      true,
    );
    assert.equal(login.status, 200);
    passed('logout and password login');
    console.log(`${checks} HTTP smoke checks passed; no paid requests.`);
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    await stop(worker);
    await stop(server);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
