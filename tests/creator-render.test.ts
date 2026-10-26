import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  renderCreatorVideo,
  validateCreatorRenderOptions,
  type CreatorRenderOptions,
  type CreatorRenderScene,
} from '@/lib/creator-render';

const execute = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
let directory = '';
let red = '',
  video = '',
  voice = '',
  longerVoice = '',
  logo = '';
const scene = (
  id: string,
  patch: Partial<CreatorRenderScene> = {},
): CreatorRenderScene => ({
  id,
  narration: '',
  onScreenText: '',
  durationSeconds: 2,
  sourcePath: null,
  sourceMimeType: null,
  ...patch,
});
const options = (
  prefix: string,
  patch: Partial<CreatorRenderOptions> = {},
): CreatorRenderOptions => ({
  scenes: [scene('first')],
  language: 'fr',
  format: '16:9',
  resolution: 360,
  outputPath: join(directory, `${prefix}.mp4`),
  coverPath: join(directory, `${prefix}.jpg`),
  subtitlesPath: join(directory, `${prefix}.srt`),
  ...patch,
});
async function command(args: string[], raw = false) {
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
    {
      encoding: raw ? 'buffer' : 'utf8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
}
async function frame(path: string, seconds: number) {
  const { stdout } = await command(
    [
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
    ],
    true,
  );
  return sharp(stdout as Buffer)
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
  directory = await mkdtemp(join(tmpdir(), 'yassdem-creator-render-'));
  red = join(directory, 'red.png');
  video = join(directory, 'blue.mp4');
  voice = join(directory, 'voice.wav');
  longerVoice = join(directory, 'longer-voice.wav');
  logo = join(directory, 'logo.png');
  await sharp({
    create: { width: 320, height: 180, channels: 3, background: '#ed1515' },
  })
    .png()
    .toFile(red);
  await sharp({
    create: { width: 80, height: 80, channels: 3, background: '#00ff00' },
  })
    .png()
    .toFile(logo);
  await command([
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=320x180:r=24',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=48000',
    '-t',
    '1',
    '-c:v',
    'libx264',
    '-threads',
    '2',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    video,
  ]);
  await command([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-t',
    '1.2',
    voice,
  ]);
  await command([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=330:sample_rate=48000',
    '-t',
    '5',
    longerVoice,
  ]);
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('creator multiscene local rendering', () => {
  it('bounds 10-minute plans and rejects unsafe paths, incompatible audio and unpaid-rights inputs', () => {
    expect(() =>
      validateCreatorRenderOptions(
        options('long', {
          scenes: Array.from({ length: 10 }, (_, i) =>
            scene(`s${i}`, { durationSeconds: 60 }),
          ),
        }),
      ),
    ).not.toThrow();
    for (const invalid of [
      { scenes: [] },
      { scenes: [scene('same'), scene('same')] },
      {
        scenes: Array.from({ length: 11 }, (_, i) =>
          scene(`s${i}`, { durationSeconds: 60 }),
        ),
      },
      {
        scenes: [
          scene('remote', {
            sourcePath: 'https://example.com/image.png',
            sourceMimeType: 'image/png',
          }),
        ],
      },
      { scenes: [scene('bad', { narration: 'x\u0000y' })] },
      { scenes: [scene('bad', { durationSeconds: 1 })] },
      { scenes: [scene('bad', { onScreenText: 'a'.repeat(501) })] },
      {
        scenes: [
          scene('bad', { sourcePath: red, sourceMimeType: 'text/html' }),
        ],
      },
      {
        scenes: [scene('bad', { voicePath: voice })],
        narrationPath: longerVoice,
      },
      { musicPath: voice },
      { musicVolume: -1 },
      { format: 'abc' },
      { logo: { path: logo, opacity: 2 } },
      { subtitlesPath: join(directory, 'x.html') },
    ])
      expect(() =>
        validateCreatorRenderOptions(
          options('invalid', invalid as Partial<CreatorRenderOptions>),
        ),
      ).toThrow();
    expect(() =>
      validateCreatorRenderOptions(options('collision', { outputPath: red })),
    ).toThrow();
  });

  it('really renders a still and a looping clip with literal UTF-8 text, audible mixed audio, logo, cover and script SRT', async () => {
    const before = await Promise.all(
      [red, video, voice, logo].map((path) => readFile(path)),
    );
    const progress: number[] = [];
    const output = options('composed', {
      scenes: [
        scene('product', {
          sourcePath: red,
          sourceMimeType: 'image/png',
          voicePath: voice,
          onScreenText: "Offre : 50% d'été ${USER}",
          narration: "L'été : 50% d'idées, sans commande exécutée.",
        }),
        scene('detail', {
          sourcePath: video,
          sourceMimeType: 'video/mp4',
          onScreenText: 'Publicité · lien affilié.',
          narration: 'Deuxième scène avec un clip répété.',
        }),
      ],
      musicPath: voice,
      musicRightsConfirmed: true,
      musicVolume: 0.2,
      disclosure: 'Publicité · lien affilié.',
      logo: {
        path: logo,
        position: 'bottom-right',
        sizePercent: 20,
        opacity: 1,
      },
      onProgress(value) {
        progress.push(value);
      },
    });
    const result = await renderCreatorVideo(output);
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
    expect(result.durationSeconds).toBeCloseTo(4, 1);
    expect(result.sceneTimings).toEqual([
      { id: 'product', startSeconds: 0, endSeconds: 2 },
      { id: 'detail', startSeconds: 2, endSeconds: 4 },
    ]);
    expect(result.srt.replace(/\n/g, ' ')).toContain("L'été : 50% d'idées,");
    expect(result.srt).toContain('Publicité · lien affilié.');
    expect(result.srt).toContain('00:00:02,100');
    expect(await readFile(output.subtitlesPath, 'utf8')).toBe(result.srt);
    expect((await sharp(output.coverPath).metadata()).width).toBe(640);
    const first = await frame(output.outputPath, 0.8),
      second = await frame(output.outputPath, 2.8);
    expect(pixel(first, 200, 160)[0]).toBeGreaterThan(180);
    expect(pixel(second, 200, 160)[2]).toBeGreaterThan(180);
    expect(pixel(first, 580, 300)[1]).toBeGreaterThan(200);
    // A separate canonical disclosure remains on every scene, even if its title omits it.
    expect(pixel(first, 10, 10).every((channel) => channel < 100)).toBe(true);
    expect(pixel(second, 10, 10).every((channel) => channel < 100)).toBe(true);
    let white = 0;
    for (let y = 10; y < 90; y++)
      for (let x = 100; x < 540; x++) {
        const p = pixel(first, x, y);
        if (p.every((channel) => channel > 190)) white++;
      }
    expect(white).toBeGreaterThan(100);
    const volume = await execute(
      ffmpeg,
      [
        '-hide_banner',
        '-i',
        output.outputPath,
        '-af',
        'volumedetect',
        '-vn',
        '-f',
        'null',
        '-',
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    const match = /mean_volume: (-?[\d.]+) dB/.exec(volume.stderr);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThan(-50);
    expect(progress[0]).toBe(5);
    expect(progress.at(-1)).toBe(100);
    expect(
      progress.every((value, index) => !index || value >= progress[index - 1]),
    ).toBe(true);
    const after = await Promise.all(
      [red, video, voice, logo].map((path) => readFile(path)),
    );
    expect(after).toEqual(before);
  }, 60000);

  it('uses original text cards and a real imported global narration, extending scene timings without inventing transcription', async () => {
    const output = options('cards', {
      format: '9:16',
      narrationPath: longerVoice,
      scenes: [
        scene('opening', {
          onScreenText: 'Une histoire originale',
          narration: 'La porte était ouverte.',
        }),
        scene('ending', {
          onScreenText: 'W'.repeat(500),
          narration: 'Qui attendait derrière ?',
        }),
      ],
    });
    const result = await renderCreatorVideo(output);
    expect(result.width).toBe(360);
    expect(result.height).toBe(640);
    expect(result.durationSeconds).toBeCloseTo(5.25, 1);
    expect(result.sceneTimings[0].endSeconds).toBe(2.625);
    expect(result.sceneTimings[1].startSeconds).toBe(2.625);
    expect(result.srt.replace(/\n/g, ' ')).toContain('La porte était ouverte.');
    expect(result.srt.replace(/\n/g, ' ')).toContain(
      'Qui attendait derrière ?',
    );
    expect(result.bytes).toBeGreaterThan(1000);
  }, 60000);

  it('preserves pre-existing outputs and cleans private render directories on failures', async () => {
    const existing = options('already');
    await writeFile(existing.outputPath, 'keep-this-content');
    await expect(renderCreatorVideo(existing)).rejects.toMatchObject({
      code: 'EXPORT_ALREADY_EXISTS',
    });
    expect(await readFile(existing.outputPath, 'utf8')).toBe(
      'keep-this-content',
    );
    const previous = process.env.FFMPEG_FONT_PATH;
    process.env.FFMPEG_FONT_PATH = join(directory, 'not-installed.ttf');
    try {
      await expect(
        renderCreatorVideo(options('font-failure')),
      ).rejects.toMatchObject({ code: 'CAPTION_FONT_UNAVAILABLE' });
    } finally {
      if (previous === undefined) delete process.env.FFMPEG_FONT_PATH;
      else process.env.FFMPEG_FONT_PATH = previous;
    }
    const files = await readdir(directory);
    expect(files.some((file) => file.startsWith('.creator-render-'))).toBe(
      false,
    );
    expect(files).not.toContain('font-failure.mp4');
    expect(files).not.toContain('font-failure.jpg');
    expect(files).not.toContain('font-failure.srt');
  });
});
