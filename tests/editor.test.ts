import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createLocalAnimation, exportVideo } from '@/lib/export';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import {
  defaultEditorTimeline,
  editorDuration,
  parseEditorTimeline,
  probeEditorInput,
  renderEditorTimeline,
} from '@/lib/editor';
const isolated = vi.hoisted(() => ({
  client: null as import('@prisma/client').PrismaClient | null,
}));
vi.mock('@/lib/db', () => ({
  get db() {
    if (!isolated.client) throw new Error('Test database is not initialized');
    return isolated.client;
  },
}));
import {
  enqueueEditorJob,
  getEditorTimeline,
  processEditJobs,
  saveEditorTimeline,
} from '@/lib/editor-jobs';

const execute = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
let directory: string;
let red: string, blue: string, music: string, logo: string;
const previousStorage = process.env.STORAGE_DIR;
async function ffmpegCommand(args: string[]) {
  return execute(
    ffmpeg,
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
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 30_000 },
  );
}
async function frame(path: string, seconds: number) {
  const { stdout } = await ffmpegCommand([
    '-ss',
    String(seconds),
    '-i',
    path,
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
  return sharp(stdout)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}
function pixel(
  frame: { data: Buffer; info: { width: number; channels: number } },
  x: number,
  y: number,
) {
  const offset = (y * frame.info.width + x) * frame.info.channels;
  return [...frame.data.subarray(offset, offset + 3)];
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yassdem-editor-'));
  process.env.STORAGE_DIR = directory;
  isolated.client = new PrismaClient({
    adapter: new PrismaBetterSQLite3({
      url: `file:${join(directory, 'editor.db')}`,
    }),
  });
  const migration = await readFile(
    join(
      process.cwd(),
      'prisma/migrations/20261019000000_initial/migration.sql',
    ),
    'utf8',
  );
  for (const statement of migration
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean))
    await isolated.client.$executeRawUnsafe(statement);
  red = join(directory, 'red.mp4');
  blue = join(directory, 'blue.mp4');
  music = join(directory, 'licensed.wav');
  logo = join(directory, 'logo.png');
  await ffmpegCommand([
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=320x240:r=24:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=2',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    red,
  ]);
  await ffmpegCommand([
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
    blue,
  ]);
  await ffmpegCommand([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=48000:duration=0.4',
    '-c:a',
    'pcm_s16le',
    music,
  ]);
  await sharp({
    create: { width: 32, height: 32, channels: 4, background: '#00ff00' },
  })
    .png()
    .toFile(logo);
}, 30_000);
afterAll(async () => {
  await isolated.client?.$disconnect();
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('editor timeline validation', () => {
  it('normalizes a saved timeline without dropping clip order or output settings', () => {
    const timeline = parseEditorTimeline({
      clips: [
        { mediaId: 'second', startSeconds: 1, endSeconds: 3 },
        { mediaId: 'first', startSeconds: 0, endSeconds: 2 },
      ],
      transition: 'fade',
      format: '16:9',
      resolution: 2160,
      codec: 'h265',
    });
    expect(timeline.clips.map((clip) => clip.mediaId)).toEqual([
      'second',
      'first',
    ]);
    expect(timeline).toMatchObject({
      format: '16:9',
      resolution: 2160,
      codec: 'h265',
      musicVolume: 0.25,
      logoTiming: 'all',
      quality: 21,
    });
    expect(editorDuration(timeline)).toBe(3.65);
  });
  it('rejects unbounded work, filter injection and captions outside the final timeline', () => {
    const clip = { mediaId: 'source', startSeconds: 0, endSeconds: 1 };
    for (const quality of [17, 33, 21.5, NaN])
      expect(() => parseEditorTimeline({ clips: [clip], quality })).toThrow(
        'INVALID_QUALITY',
      );
    expect(() => parseEditorTimeline({ clips: Array(13).fill(clip) })).toThrow(
      'EDITOR_CLIP_LIMIT',
    );
    expect(() =>
      parseEditorTimeline({ clips: [{ ...clip, endSeconds: 121 }] }),
    ).toThrow('EDITOR_DURATION_LIMIT');
    expect(() =>
      parseEditorTimeline({ clips: [{ ...clip, startSeconds: NaN }] }),
    ).toThrow('INVALID_EDITOR_TIMING');
    expect(() =>
      parseEditorTimeline({
        clips: [clip],
        transition: 'fade;movie=/etc/passwd',
      }),
    ).toThrow('INVALID_EDITOR_TRANSITION');
    expect(() =>
      parseEditorTimeline({
        clips: [clip],
        logoTiming: "start';movie=/etc/passwd",
      }),
    ).toThrow('INVALID_LOGO_SETTINGS');
    expect(() =>
      parseEditorTimeline({
        clips: [clip],
        captions: [{ text: 'Texte', startSeconds: 0, endSeconds: 2 }],
      }),
    ).toThrow('INVALID_EDITOR_TIMING');
    expect(() =>
      parseEditorTimeline({
        clips: [clip],
        captions: [{ text: 'bad\u0000text', startSeconds: 0, endSeconds: 1 }],
      }),
    ).toThrow('INVALID_EDITOR_CAPTION');
  });
});

describe('persisted editor workflow', () => {
  it('preserves project settings, freezes queued timelines, deduplicates requests and persists video plus cover', async () => {
    const db = isolated.client!;
    const project = await db.project.create({
      data: {
        name: 'Montage',
        parameters: JSON.stringify({
          fashion: { hijab: true },
          custom: 'keep',
        }),
      },
    });
    const redMedia = await db.media.create({
      data: {
        name: 'red.mp4',
        path: 'red.mp4',
        mimeType: 'video/mp4',
        size: (await stat(red)).size,
        width: 320,
        height: 240,
        duration: 2,
        projectId: project.id,
      },
    });
    const blueMedia = await db.media.create({
      data: {
        name: 'blue.mp4',
        path: 'blue.mp4',
        mimeType: 'video/mp4',
        size: (await stat(blue)).size,
        width: 320,
        height: 240,
        duration: 2,
        projectId: project.id,
      },
    });
    const musicMedia = await db.media.create({
      data: {
        name: 'licensed.wav',
        path: 'licensed.wav',
        mimeType: 'audio/wav',
        size: (await stat(music)).size,
        duration: 0.4,
        projectId: project.id,
      },
    });
    const timeline = parseEditorTimeline({
      clips: [
        { mediaId: blueMedia.id, startSeconds: 0, endSeconds: 0.75 },
        { mediaId: redMedia.id, startSeconds: 0, endSeconds: 0.75 },
      ],
      musicMediaId: musicMedia.id,
      format: '1:1',
      resolution: 720,
      logoTiming: 'end',
      quality: 28,
    });
    expect(await saveEditorTimeline(project.id, timeline)).toEqual(timeline);
    expect(await getEditorTimeline(project.id)).toEqual(timeline);
    const parameters = JSON.parse(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .parameters,
    );
    expect(parameters).toMatchObject({
      fashion: { hijab: true },
      custom: 'keep',
      editor: timeline,
    });
    await expect(
      enqueueEditorJob(project.id, {
        idempotencyKey: 'licensed-editor-render',
      }),
    ).rejects.toMatchObject({ code: 'MUSIC_RIGHTS_REQUIRED' });
    const job = await enqueueEditorJob(project.id, {
      idempotencyKey: 'licensed-editor-render',
      musicRightsConfirmed: true,
    });
    expect(job).toMatchObject({
      kind: 'edit',
      provider: 'local',
      status: 'QUEUED',
      estimatedCostCents: 0,
      reservedCents: 0,
      actualCostCents: 0,
    });
    expect(
      (
        await enqueueEditorJob(project.id, {
          idempotencyKey: 'licensed-editor-render',
          musicRightsConfirmed: true,
        })
      ).id,
    ).toBe(job.id);
    expect(await db.job.count()).toBe(1);
    await saveEditorTimeline(project.id, {
      ...timeline,
      clips: [...timeline.clips].reverse(),
      logoTiming: 'start',
      quality: 18,
    });
    const untouched = await db.job.create({
      data: {
        projectId: project.id,
        sourceMediaId: redMedia.id,
        provider: 'local',
        kind: 'generation',
        budgetMonth: '2026-10',
        idempotencyKey: 'generation-should-wait',
      },
    });
    await processEditJobs();
    const finished = await db.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished).toMatchObject({
      status: 'SUCCEEDED',
      progress: 100,
      actualCostCents: 0,
    });
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: untouched.id } })).status,
    ).toBe('QUEUED');
    const output = await db.media.findUniqueOrThrow({
      where: { id: finished.outputMediaId! },
    });
    const metadata = JSON.parse(finished.parameters);
    expect(metadata.timeline.clips[0].mediaId).toBe(blueMedia.id);
    expect(metadata.timeline.logoTiming).toBe('end');
    expect(metadata.timeline.quality).toBe(28);
    const cover = await db.media.findUniqueOrThrow({
      where: { id: metadata.coverMediaId },
    });
    expect(output).toMatchObject({
      mimeType: 'video/mp4',
      role: 'EXPORT',
      width: 720,
      height: 720,
    });
    expect(cover).toMatchObject({
      mimeType: 'image/jpeg',
      role: 'COVER',
      width: 720,
      height: 720,
    });
    expect(
      pixel(await frame(join(directory, output.path), 0.3), 360, 360)[2],
    ).toBeGreaterThan(200);
    expect((await sharp(join(directory, cover.path)).metadata()).format).toBe(
      'jpeg',
    );
  }, 60_000);
});

describe('real FFmpeg editor', () => {
  it('renders the whole composition as a lightweight preview without changing final settings', async () => {
    const timeline = parseEditorTimeline({
      clips: [
        { mediaId: 'blue', startSeconds: 0.25, endSeconds: 1.25 },
        { mediaId: 'red', startSeconds: 0.5, endSeconds: 1.5 },
      ],
      transition: 'fade',
      captions: [
        {
          text: 'Aperçu été',
          startSeconds: 0.05,
          endSeconds: 0.5,
          position: 'bottom',
        },
      ],
      musicMediaId: 'licensed',
      musicVolume: 0.5,
      logoId: 'logo',
      logoSize: 10,
      logoOpacity: 1,
      logoPosition: 'top-left',
      format: '1:1',
      resolution: 2160,
      codec: 'h265',
      quality: 18,
    });
    const before = JSON.stringify(timeline);
    const outputPath = join(directory, 'whole-preview.mp4');
    const result = await renderEditorTimeline({
      timeline,
      clipPaths: [blue, red],
      musicPath: music,
      musicRightsConfirmed: true,
      logo: { path: logo },
      outputPath,
      coverPath: join(directory, 'whole-preview.jpg'),
      preview: true,
    });
    expect(result).toMatchObject({
      width: 360,
      height: 360,
      codec: 'h264',
      sourceKind: 'editor-preview',
      aiUpscaling: false,
    });
    expect(result.durationSeconds).toBeCloseTo(1.65, 1);
    expect(JSON.stringify(timeline)).toBe(before);
    const first = await frame(outputPath, 0.2),
      joinFrame = await frame(outputPath, 0.82),
      last = await frame(outputPath, 1.3);
    expect(pixel(first, 180, 180)[2]).toBeGreaterThan(200);
    expect(pixel(last, 180, 180)[0]).toBeGreaterThan(200);
    const transition = pixel(joinFrame, 180, 180);
    expect(transition[0]).toBeGreaterThan(70);
    expect(transition[2]).toBeGreaterThan(70);
    expect(pixel(first, 20, 20)[1]).toBeGreaterThan(200);
    let white = 0;
    for (let y = 320; y < 356; y++)
      for (let x = 0; x < 360; x++)
        if (pixel(first, x, y).every((value) => value > 180)) white++;
    expect(white).toBeGreaterThan(20);
    const audio = (
      await ffmpegCommand([
        '-ss',
        '0.6',
        '-i',
        outputPath,
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
    for (let i = 0; i < audio.length - 1; i += 2)
      sum += (audio.readInt16LE(i) / 32768) ** 2;
    expect(Math.sqrt(sum / (audio.length / 2))).toBeGreaterThan(0.01);
  }, 60000);

  it('queues preview and final jobs separately with authorization, immutable snapshots and idempotent previews', async () => {
    const db = isolated.client!;
    const project = await db.project.create({
      data: {
        name: 'Preview before export',
        parameters: '{"seo":{"keep":true}}',
      },
    });
    const source = await db.media.create({
      data: {
        name: 'preview-source.mp4',
        path: 'blue.mp4',
        mimeType: 'video/mp4',
        size: (await stat(blue)).size,
        width: 320,
        height: 240,
        duration: 2,
        projectId: project.id,
      },
    });
    const musicMedia = await db.media.create({
      data: {
        name: 'licensed.wav',
        path: 'licensed.wav',
        mimeType: 'audio/wav',
        size: (await stat(music)).size,
        duration: 0.4,
        projectId: project.id,
      },
    });
    const timeline = parseEditorTimeline({
      clips: [{ mediaId: source.id, startSeconds: 0, endSeconds: 1 }],
      musicMediaId: musicMedia.id,
      resolution: 2160,
      format: '1:1',
      codec: 'h265',
      quality: 18,
    });
    await saveEditorTimeline(project.id, timeline);
    await expect(
      enqueueEditorJob(project.id, {
        mode: 'preview',
        idempotencyKey: 'preview-needs-music-rights',
      }),
    ).rejects.toMatchObject({ code: 'MUSIC_RIGHTS_REQUIRED' });
    await expect(
      enqueueEditorJob(project.id, {
        mode: 'untrusted',
        idempotencyKey: 'preview-invalid-mode',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EDITOR_MODE' });
    const preview = await enqueueEditorJob(project.id, {
      mode: 'preview',
      idempotencyKey: 'whole-preview-once',
      musicRightsConfirmed: true,
    });
    expect(preview).toMatchObject({
      kind: 'edit-preview',
      provider: 'local',
      estimatedCostCents: 0,
      reservedCents: 0,
      actualCostCents: 0,
    });
    expect(
      (
        await enqueueEditorJob(project.id, {
          mode: 'preview',
          idempotencyKey: 'whole-preview-once',
          musicRightsConfirmed: true,
        })
      ).id,
    ).toBe(preview.id);
    await expect(
      enqueueEditorJob(project.id, {
        mode: 'export',
        idempotencyKey: 'whole-preview-once',
        musicRightsConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const final = await enqueueEditorJob(project.id, {
      idempotencyKey: 'final-remains-independent',
      musicRightsConfirmed: true,
    });
    expect(final.kind).toBe('edit');
    await processEditJobs();
    const finished = await db.job.findUniqueOrThrow({
      where: { id: preview.id },
    });
    expect(finished.status).toBe('SUCCEEDED');
    expect(
      (await db.job.findUniqueOrThrow({ where: { id: final.id } })).status,
    ).toBe('QUEUED');
    const params = JSON.parse(finished.parameters);
    expect(params).toMatchObject({
      preview: true,
      sourceKind: 'editor-preview',
      codec: 'h264',
      timeline: { resolution: 2160, codec: 'h265', quality: 18 },
    });
    const media = await db.media.findUniqueOrThrow({
      where: { id: finished.outputMediaId! },
    });
    expect(media).toMatchObject({
      role: 'PREVIEW',
      width: 360,
      height: 360,
      mimeType: 'video/mp4',
    });
    expect(
      (await db.media.findUniqueOrThrow({ where: { id: params.coverMediaId } }))
        .role,
    ).toBe('PREVIEW_COVER');
    expect(
      await db.media.count({
        where: { projectId: project.id, role: 'EXPORT' },
      }),
    ).toBe(0);
    expect(await getEditorTimeline(project.id)).toEqual(timeline);
    expect(
      JSON.parse(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .parameters,
      ).seo,
    ).toEqual({ keep: true });
    await db.job.update({
      where: { id: final.id },
      data: { status: 'CANCELLED' },
    });
  }, 60000);

  it('reduces real encoded file size at stronger compression in both renderers', async () => {
    const source = join(directory, 'detail.mp4');
    await ffmpegCommand([
      '-f',
      'lavfi',
      '-i',
      'testsrc2=s=320x240:r=24:d=1.5',
      '-c:v',
      'libx264',
      '-threads',
      '2',
      '-crf',
      '16',
      '-pix_fmt',
      'yuv420p',
      source,
    ]);
    for (const renderer of ['export', 'editor']) {
      const sizes: number[] = [];
      for (const quality of [18, 28]) {
        const outputPath = join(
          directory,
          `compression-${renderer}-${quality}.mp4`,
        );
        const result =
          renderer === 'export'
            ? await exportVideo({
                inputPath: source,
                outputPath,
                durationSeconds: 1.5,
                format: '1:1',
                resolution: 720,
                quality,
              })
            : await renderEditorTimeline({
                timeline: parseEditorTimeline({
                  clips: [
                    { mediaId: 'detail', startSeconds: 0, endSeconds: 1.5 },
                  ],
                  format: '1:1',
                  resolution: 720,
                  quality,
                }),
                clipPaths: [source],
                outputPath,
                coverPath: join(directory, `compression-${quality}.jpg`),
              });
        expect(result.durationSeconds).toBeCloseTo(1.5, 1);
        expect(result).toMatchObject({ width: 720, height: 720 });
        sizes.push(result.bytes);
      }
      expect(sizes[1]).toBeLessThan(sizes[0] * 0.85);
    }
  }, 60_000);

  it.each(['start', 'end'] as const)(
    'shows a fading logo only at the %s in both renderers',
    async (timing) => {
      const still = join(directory, `timed-${timing}.png`);
      await sharp({
        create: { width: 320, height: 240, channels: 3, background: '#0000ff' },
      })
        .png()
        .toFile(still);
      const timeline = parseEditorTimeline({
        clips: [
          { mediaId: 'blue', startSeconds: 0, endSeconds: 2 },
          { mediaId: 'blue', startSeconds: 0, endSeconds: 2 },
        ],
        format: '1:1',
        resolution: 720,
        logoId: 'logo',
        logoSize: 10,
        logoOpacity: 1,
        logoPosition: 'top-left',
        logoTiming: timing,
        logoFade: true,
      });
      const animation = join(directory, `animation-logo-${timing}.mp4`);
      await createLocalAnimation({
        imagePath: still,
        outputPath: animation,
        durationSeconds: 4,
        format: '1:1',
        resolution: 720,
        logo: {
          path: logo,
          sizePercent: 10,
          opacity: 1,
          position: 'top-left',
          timing,
          fade: true,
        },
      });
      const edit = join(directory, `editor-logo-${timing}.mp4`);
      await renderEditorTimeline({
        timeline,
        clipPaths: [blue, blue],
        logo: { path: logo },
        outputPath: edit,
        coverPath: join(directory, `editor-logo-${timing}.jpg`),
      });
      for (const path of [animation, edit]) {
        const visible = pixel(
          await frame(path, timing === 'start' ? 0.8 : 3.2),
          50,
          50,
        );
        const absent = pixel(
          await frame(path, timing === 'start' ? 3.2 : 0.8),
          50,
          50,
        );
        const faded = pixel(
          await frame(path, timing === 'start' ? 0.04 : 3.9),
          50,
          50,
        );
        expect(visible[1]).toBeGreaterThan(220);
        expect(visible[2]).toBeLessThan(25);
        expect(absent[1]).toBeLessThan(20);
        expect(absent[2]).toBeGreaterThan(220);
        expect(faded[1]).toBeLessThan(120);
        expect(faded[2]).toBeGreaterThan(100);
      }
    },
    60_000,
  );

  it('places an end logo against the actual video end when the requested export is longer', async () => {
    const outputPath = join(directory, 'short-video-end-logo.mp4');
    const result = await exportVideo({
      inputPath: blue,
      outputPath,
      durationSeconds: 5,
      format: '1:1',
      resolution: 720,
      logo: {
        path: logo,
        sizePercent: 10,
        opacity: 1,
        position: 'top-left',
        timing: 'end',
      },
    });
    expect(result.durationSeconds).toBeCloseTo(2, 1);
    expect(pixel(await frame(outputPath, 0.8), 50, 50)[1]).toBeGreaterThan(220);
  }, 30_000);

  it('trims and reorders clips, draws UTF-8 captions/logo, loops licensed music and extracts a cover', async () => {
    const timeline = parseEditorTimeline({
      clips: [
        { mediaId: 'blue', startSeconds: 0.5, endSeconds: 1.5 },
        { mediaId: 'red', startSeconds: 0.25, endSeconds: 1.25 },
      ],
      captions: [
        {
          text: "Été : l'élégance 100% [x]; \\ o",
          startSeconds: 0.05,
          endSeconds: 0.45,
          position: 'bottom',
        },
      ],
      format: '1:1',
      resolution: 720,
      musicMediaId: 'licensed',
      musicVolume: 0.5,
      logoId: 'logo',
      logoSize: 10,
      logoOpacity: 1,
      logoPosition: 'top-left',
    });
    const outputPath = join(directory, 'cut.mp4'),
      coverPath = join(directory, 'cover.jpg');
    const result = await renderEditorTimeline({
      timeline,
      clipPaths: [blue, red],
      musicPath: music,
      musicRightsConfirmed: true,
      logo: { path: logo },
      outputPath,
      coverPath,
    });
    expect(result).toMatchObject({
      width: 720,
      height: 720,
      codec: 'h264',
      upscaled: true,
      aiUpscaling: false,
    });
    expect(result.durationSeconds).toBeCloseTo(2, 1);
    expect(result.bytes).toBeGreaterThan(10000);
    expect((await sharp(coverPath).metadata()).format).toBe('jpeg');
    expect((await stat(coverPath)).size).toBe(result.coverBytes);
    const first = await frame(outputPath, 0.7),
      second = await frame(outputPath, 1.5);
    expect(pixel(first, 360, 360)[2]).toBeGreaterThan(200);
    expect(pixel(first, 360, 360)[0]).toBeLessThan(20);
    expect(pixel(second, 360, 360)[0]).toBeGreaterThan(200);
    expect(pixel(second, 360, 360)[2]).toBeLessThan(20);
    expect(pixel(first, 50, 50)[1]).toBeGreaterThan(200);
    const caption = await frame(outputPath, 0.2);
    let whitePixels = 0;
    for (let y = 620; y < 705; y++)
      for (let x = 0; x < 720; x++) {
        const rgb = pixel(caption, x, y);
        if (rgb.every((channel) => channel > 180)) whitePixels++;
      }
    expect(whitePixels).toBeGreaterThan(200);
    expect((await probeEditorInput(outputPath)).audio).toBe(true);
    const audio = (
      await ffmpegCommand([
        '-ss',
        '0.6',
        '-i',
        outputPath,
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
    let sumSquares = 0;
    for (let i = 0; i < audio.length - 1; i += 2)
      sumSquares += (audio.readInt16LE(i) / 32768) ** 2;
    expect(Math.sqrt(sumSquares / (audio.length / 2))).toBeGreaterThan(0.01);
    expect(
      (await readdir(directory)).filter((name) => name.startsWith('.editor-')),
    ).toEqual([]);
  }, 60_000);
  it('cross-fades video and audio at a real clip join', async () => {
    const timeline = parseEditorTimeline({
      clips: [
        { mediaId: 'red', startSeconds: 0.25, endSeconds: 1.25 },
        { mediaId: 'blue', startSeconds: 0.5, endSeconds: 1.5 },
      ],
      transition: 'fade',
      format: '1:1',
      resolution: 720,
    });
    const outputPath = join(directory, 'fade.mp4');
    const result = await renderEditorTimeline({
      timeline,
      clipPaths: [red, blue],
      outputPath,
      coverPath: join(directory, 'fade-cover.jpg'),
    });
    expect(result.durationSeconds).toBeCloseTo(1.65, 1);
    const mixed = pixel(await frame(outputPath, 0.82), 360, 360);
    expect(mixed[0]).toBeGreaterThan(70);
    expect(mixed[2]).toBeGreaterThan(70);
    expect(mixed[1]).toBeLessThan(20);
    expect(pixel(await frame(outputPath, 1.3), 360, 360)[2]).toBeGreaterThan(
      200,
    );
  }, 60_000);
  it('requires music authorization and rejects trims beyond actual source duration', async () => {
    const timeline = {
      ...defaultEditorTimeline(),
      clips: [{ mediaId: 'red', startSeconds: 0, endSeconds: 1 }],
      musicMediaId: 'licensed',
    };
    const options = {
      timeline,
      clipPaths: [red],
      musicPath: music,
      outputPath: join(directory, 'rejected.mp4'),
      coverPath: join(directory, 'rejected.jpg'),
    };
    await expect(renderEditorTimeline(options)).rejects.toMatchObject({
      code: 'MUSIC_RIGHTS_REQUIRED',
    });
    await expect(
      renderEditorTimeline({
        ...options,
        musicRightsConfirmed: true,
        timeline: {
          ...timeline,
          clips: [{ mediaId: 'red', startSeconds: 0, endSeconds: 2.5 }],
        },
      }),
    ).rejects.toMatchObject({ code: 'EDITOR_TRIM_OUT_OF_RANGE' });
    expect(
      (await readdir(directory)).filter((name) => name.startsWith('rejected')),
    ).toEqual([]);
  });
});
