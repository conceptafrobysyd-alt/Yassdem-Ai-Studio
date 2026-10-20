/** Isolated production HTTP checks for the real editor, audio import and Pinterest copy. */
import assert from 'node:assert/strict';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execute = promisify(execFile);
async function main() {
  const root = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'yassdem-editor-http-'));
  const origin = `http://127.0.0.1:${Number(process.env.SMOKE_EDITOR_PORT || 4330)}`;
  const env = {
    ...process.env,
    DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    STORAGE_DIR: path.join(directory, 'storage'),
    APP_ORIGIN: origin,
    NODE_ENV: 'production' as const,
    RUNWAY_API_KEY: '',
    REPLICATE_API_TOKEN: '',
    COMFYUI_URL: 'http://127.0.0.1:1',
    COMFYUI_FASHION_WORKFLOW: '',
    COMFYUI_TRYON_WORKFLOW: '',
    OLLAMA_URL: 'http://127.0.0.1:1',
    OLLAMA_MODEL: '',
  };
  let cookie = '',
    logs = '';
  let web: ChildProcess | undefined, worker: ChildProcess | undefined;
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  function start(args: string[]) {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      stream?.on('data', (bytes) => {
        logs = (logs + bytes.toString()).slice(-16000);
      });
    return child;
  }
  async function stop(child: ChildProcess | undefined) {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(5000),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
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
      signal: AbortSignal.timeout(30000),
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  }
  async function json(url: string, body?: unknown, method?: string) {
    const response = await call(url, body, method);
    const result = await response.json();
    assert.ok(
      response.ok,
      `${url}: HTTP${response.status} ${JSON.stringify(result)}`,
    );
    return result;
  }
  async function upload(
    bytes: Uint8Array,
    name: string,
    type: string,
    projectId: string,
    role = 'SOURCE',
  ) {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(bytes)], name, { type }));
    form.set('role', role);
    form.set('projectId', projectId);
    return (await json('/api/media', form)).media;
  }
  async function ffmpeg(args: string[]) {
    return execute(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-threads',
        '2',
        '-filter_threads',
        '2',
        ...args,
      ],
      { encoding: 'buffer', timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    );
  }
  async function frame(file: string, seconds: number) {
    const output = await ffmpeg([
      '-ss',
      String(seconds),
      '-i',
      file,
      '-frames:v',
      '1',
      '-threads',
      '2',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ]);
    return sharp(output.stdout)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }
  function pixel(
    image: { data: Buffer; info: { width: number; channels: number } },
    x: number,
    y: number,
  ) {
    const offset = (y * image.info.width + x) * image.info.channels;
    return [...image.data.subarray(offset, offset + 3)];
  }
  try {
    const migrate = start([
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
    ]);
    await new Promise<void>((resolve, reject) =>
      migrate.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error('Migration failed')),
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
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        if (
          (
            await fetch(origin + '/api/bootstrap', {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {}
      await delay(250);
    }
    assert.ok(ready, 'Production HTTP server did not become ready');
    assert.equal((await fetch(origin + '/api/editor/private')).status, 401);
    assert.equal((await fetch(origin + '/api/seo/private')).status, 401);
    const setup = await call('/api/auth/setup', {
      password: randomBytes(24).toString('base64url'),
    });
    assert.ok(setup.ok);
    cookie = setup.headers.get('set-cookie')!.split(';')[0];
    const project = (
      await json('/api/projects', {
        name: 'Editor and Pinterest smoke',
        type: 'product',
        parameters: { custom: 'preserve me' },
      })
    ).project;
    const redPath = path.join(directory, 'red.mp4'),
      bluePath = path.join(directory, 'blue.mp4');
    const musicPath = path.join(directory, 'licensed.wav');
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=320x240:r=24:d=2',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      redPath,
    ]);
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240:r=24:d=2',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      bluePath,
    ]);
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=48000:duration=0.4',
      '-c:a',
      'pcm_s16le',
      musicPath,
    ]);
    const red = await upload(
      await readFile(redPath),
      'red.mp4',
      'video/mp4',
      project.id,
    );
    const blue = await upload(
      await readFile(bluePath),
      'blue.mp4',
      'video/mp4',
      project.id,
    );
    const music = await upload(
      await readFile(musicPath),
      'licensed.wav',
      'audio/wav',
      project.id,
    );
    assert.equal(music.mimeType, 'audio/wav');
    assert.ok(music.duration > 0.3 && music.duration < 0.5);
    const logo = await upload(
      await sharp({
        create: { width: 32, height: 32, channels: 4, background: '#00ff00' },
      })
        .png()
        .toBuffer(),
      'logo.png',
      'image/png',
      project.id,
      'LOGO',
    );
    const forged = new FormData();
    forged.set(
      'file',
      new File([Buffer.from('RIFF0000WAVEinvalid')], 'fake.wav', {
        type: 'audio/wav',
      }),
    );
    assert.equal((await call('/api/media', forged)).status, 400);
    const timeline = {
      version: 1,
      clips: [
        { mediaId: blue.id, startSeconds: 0.25, endSeconds: 1.25 },
        { mediaId: red.id, startSeconds: 0.5, endSeconds: 1.5 },
      ],
      captions: [
        {
          text: "Été : l'élégance 100%",
          startSeconds: 0.1,
          endSeconds: 0.5,
          position: 'bottom',
        },
      ],
      transition: 'fade',
      musicMediaId: music.id,
      musicVolume: 0.5,
      format: '1:1',
      resolution: 720,
      codec: 'h264',
      logoId: logo.id,
      logoSize: 10,
      logoOpacity: 1,
      logoPosition: 'top-left',
      logoFade: false,
      logoTiming: 'all',
      quality: 21,
    };
    assert.deepEqual(
      (await json('/api/editor/' + project.id, { timeline }, 'PUT')).timeline,
      timeline,
    );
    assert.deepEqual(
      (await json('/api/editor/' + project.id)).timeline,
      timeline,
    );
    assert.equal(
      (await call('/api/media/' + music.id, {}, 'DELETE')).status,
      409,
    );
    const renderPath = `/api/editor/${project.id}/render`;
    assert.equal(
      (await call(renderPath, { idempotencyKey: randomUUID() })).status,
      400,
    );
    const request = {
      idempotencyKey: randomUUID(),
      musicRightsConfirmed: true,
    };
    const queued = (await json(renderPath, request)).job;
    assert.equal((await json(renderPath, request)).job.id, queued.id);
    assert.equal((await json('/api/jobs')).jobs.length, 1);
    console.log(
      'PASS private editor APIs, decoded audio uploads, saved ordered trims, media protection and music rights/idempotency gates',
    );

    const brief = {
      productName: 'Sac Alba',
      brand: 'Yassdem',
      category: 'Accessoires',
      features: ['Deux poches', 'Coloris sable'],
      audience: '',
      keywords: ['sac Alba', 'sac sable'],
      url: 'https://boutique.example/sac',
      affiliateUrl: 'https://boutique.example/ref',
      adDisclosure: 'Commission possible.',
      language: 'both',
    };
    const seoPath = '/api/seo/' + project.id;
    assert.equal(
      (
        await call(seoPath, {
          mode: 'local',
          input: { ...brief, adDisclosure: '' },
        })
      ).status,
      400,
    );
    const document = (await json(seoPath, { mode: 'local', input: brief }))
      .document;
    assert.equal(document.source, 'local');
    assert.deepEqual(
      document.versions.map(
        (version: { language: string }) => version.language,
      ),
      ['fr', 'en'],
    );
    assert.equal(document.versions[0].titles.length, 3);
    assert.equal(document.versions[0].descriptions.length, 2);
    assert.ok(
      document.versions[0].descriptions.every((value: string) =>
        value.includes('Publicité · lien affilié.'),
      ),
    );
    assert.ok(
      document.versions[1].descriptions.every((value: string) =>
        value.includes('Ad · affiliate link.'),
      ),
    );
    document.versions[0].titles[0] = 'Sac Alba · sélection été';
    const edited = (
      await json(seoPath, { versions: document.versions }, 'PATCH')
    ).document;
    assert.equal(
      (await json(seoPath)).document.versions[0].titles[0],
      edited.versions[0].titles[0],
    );
    const csv = await call(seoPath + '/export?format=csv');
    assert.match(csv.headers.get('content-type') || '', /text\/csv/);
    const csvText = await csv.text();
    assert.ok(csvText.includes('"Title","Media URL","Pinterest board"'));
    assert.ok(csvText.includes('Sac Alba · sélection été'));
    assert.ok(csvText.includes('https://boutique.example/ref'));
    const exported = await call(seoPath + '/export?format=json');
    assert.deepEqual(await exported.json(), edited);
    const preserved = (await json('/api/projects/' + project.id)).project
      .parameters;
    assert.deepEqual(preserved.editor, timeline);
    assert.equal(preserved.custom, 'preserve me');
    assert.equal(preserved.seo.source, 'local');
    console.log(
      'PASS fact-based bilingual SEO, required affiliate disclosures, human edits, CSV/JSON and preserved editor settings',
    );

    worker = start(['--import', 'tsx', 'src/worker.ts']);
    let finished;
    for (let attempt = 0; attempt < 240; attempt++) {
      finished = (await json('/api/jobs/' + queued.id)).job;
      if (finished.status === 'SUCCEEDED') break;
      if (['FAILED', 'UNKNOWN', 'CANCELLED'].includes(finished.status))
        throw new Error(JSON.stringify(finished));
      await delay(250);
    }
    assert.equal(finished?.status, 'SUCCEEDED');
    assert.equal(finished.actualCostCents, 0);
    assert.equal(finished.parameters.sourceKind, 'editor');
    assert.equal(finished.parameters.aiUpscaling, false);
    const response = await call('/api/media/' + finished.outputMediaId);
    assert.match(response.headers.get('content-type') || '', /video\/mp4/);
    const renderedPath = path.join(directory, 'rendered.mp4');
    await writeFile(renderedPath, Buffer.from(await response.arrayBuffer()));
    const probe = await execute(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height:format=duration',
        '-of',
        'json',
        renderedPath,
      ],
      { timeout: 15000 },
    );
    const details = JSON.parse(probe.stdout);
    assert.ok(Math.abs(Number(details.format.duration) - 1.65) < 0.2);
    assert.ok(
      details.streams.some(
        (stream: { codec_name: string; width?: number; height?: number }) =>
          stream.codec_name === 'h264' &&
          stream.width === 720 &&
          stream.height === 720,
      ),
    );
    assert.ok(
      details.streams.some(
        (stream: { codec_name: string }) => stream.codec_name === 'aac',
      ),
    );
    const first = await frame(renderedPath, 0.6),
      second = await frame(renderedPath, 1.3),
      mixed = await frame(renderedPath, 0.82);
    assert.ok(pixel(first, 360, 360)[2] > 200);
    assert.ok(pixel(second, 360, 360)[0] > 200);
    assert.ok(pixel(mixed, 360, 360)[0] > 70 && pixel(mixed, 360, 360)[2] > 70);
    assert.ok(pixel(first, 50, 50)[1] > 200);
    const audio = (
      await ffmpeg([
        '-ss',
        '0.6',
        '-i',
        renderedPath,
        '-t',
        '0.2',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        'pipe:1',
      ])
    ).stdout;
    let sum = 0;
    for (let offset = 0; offset < audio.length - 1; offset += 2)
      sum += (audio.readInt16LE(offset) / 32768) ** 2;
    assert.ok(
      Math.sqrt(sum / (audio.length / 2)) > 0.01,
      'Music stream must contain audible samples',
    );
    const cover = await call('/api/media/' + finished.parameters.coverMediaId);
    const image = await sharp(
      Buffer.from(await cover.arrayBuffer()),
    ).metadata();
    assert.equal(image.format, 'jpeg');
    assert.equal(image.width, 720);
    assert.equal(image.height, 720);
    const archive = await call('/api/projects/' + project.id + '/archive');
    assert.equal(
      Buffer.from(await archive.arrayBuffer()).readUInt32LE(0),
      0x04034b50,
    );
    const settings = (await json('/api/bootstrap')).settings;
    assert.equal(settings.monthlyBudgetCents, 0);
    assert.equal((await json('/api/jobs')).jobs.length, 1);
    console.log(
      'PASS persistent FFmpeg worker renders real ordered/faded H264/AAC video, audible music, logo, JPEG cover and ZIP without paid generation',
    );
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    await stop(worker);
    await stop(web);
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
