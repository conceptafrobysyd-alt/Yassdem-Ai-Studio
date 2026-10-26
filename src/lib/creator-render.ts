import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, isAbsolute, join } from 'node:path';
import sharp from 'sharp';
import {
  checkExportSupport,
  getExportDimensions,
  getLogoTimingWindow,
  type ExportLogo,
  type LogoPosition,
  type VideoFormat,
} from './export';

export type CreatorRenderScene = {
  id: string;
  narration: string;
  onScreenText: string;
  durationSeconds: number;
  /** Worker-resolved local files only. Incoming requests supply database IDs. */
  sourcePath: string | null;
  sourceMimeType: string | null;
  voicePath?: string | null;
};
export type CreatorSceneTiming = {
  id: string;
  startSeconds: number;
  endSeconds: number;
};
export type CreatorRenderOptions = {
  scenes: CreatorRenderScene[];
  language: 'fr' | 'en';
  format: VideoFormat;
  resolution: 360 | 720 | 1080;
  outputPath: string;
  coverPath: string;
  subtitlesPath: string;
  logo?: ExportLogo;
  narrationPath?: string | null;
  musicPath?: string | null;
  musicRightsConfirmed?: boolean;
  musicVolume?: number;
  /** Canonical advertising disclosure supplied by the approved plan. */
  disclosure?: string;
  onProgress?: (progress: number) => Promise<void> | void;
};
export class CreatorRenderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = 'CreatorRenderError';
  }
}

const INPUT_LIMIT = 100 * 1024 * 1024;
const OUTPUT_LIMIT = 512 * 1024 * 1024;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const FPS = 24;
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();
function validText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= max &&
    !/[\x00-\x08\x0b-\x1f\x7f]/.test(value)
  );
}
/** Synchronous bounds are also useful before a long task is queued. */
export function validateCreatorRenderOptions(options: CreatorRenderOptions) {
  if (
    !options ||
    !Array.isArray(options.scenes) ||
    !options.scenes.length ||
    options.scenes.length > 24 ||
    !['fr', 'en'].includes(options.language) ||
    !['9:16', '16:9', '1:1', '4:5'].includes(options.format) ||
    ![360, 720, 1080].includes(options.resolution)
  )
    throw new CreatorRenderError('CREATOR_RENDER_INVALID_OPTIONS');
  const ids = new Set<string>();
  for (const scene of options.scenes) {
    if (
      !scene ||
      typeof scene.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(scene.id) ||
      ids.has(scene.id) ||
      !validText(scene.narration, 2000) ||
      !validText(scene.onScreenText, 500) ||
      !number(scene.durationSeconds, 2, 60) ||
      (scene.sourcePath !== null &&
        (typeof scene.sourcePath !== 'string' ||
          !isAbsolute(scene.sourcePath))) ||
      (scene.sourcePath === null
        ? scene.sourceMimeType !== null
        : ![...IMAGE_MIMES, 'video/mp4'].includes(
            scene.sourceMimeType ?? '',
          )) ||
      (scene.voicePath != null &&
        (typeof scene.voicePath !== 'string' || !isAbsolute(scene.voicePath)))
    )
      throw new CreatorRenderError('CREATOR_RENDER_INVALID_SCENE');
    ids.add(scene.id);
  }
  if (
    options.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) > 600
  )
    throw new CreatorRenderError('CREATOR_DURATION_LIMIT');
  if (options.narrationPath && options.scenes.some((scene) => scene.voicePath))
    throw new CreatorRenderError('CREATOR_NARRATION_CONFLICT');
  if (options.musicPath && options.musicRightsConfirmed !== true)
    throw new CreatorRenderError('MUSIC_RIGHTS_REQUIRED');
  if (options.musicVolume !== undefined && !number(options.musicVolume, 0, 1))
    throw new CreatorRenderError('CREATOR_RENDER_INVALID_OPTIONS');
  if (options.disclosure !== undefined && !validText(options.disclosure, 160))
    throw new CreatorRenderError('CREATOR_RENDER_INVALID_OPTIONS');
  if (options.logo) {
    const logo = options.logo;
    if (
      ![
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
        'center',
      ].includes(logo.position ?? 'bottom-right') ||
      !number(logo.sizePercent ?? 15, 3, 50) ||
      !number(logo.opacity ?? 0.8, 0, 1) ||
      (logo.fade !== undefined && typeof logo.fade !== 'boolean') ||
      !['all', 'start', 'end'].includes(logo.timing ?? 'all')
    )
      throw new CreatorRenderError('INVALID_LOGO_SETTINGS');
  }
  const outputs = [
    options.outputPath,
    options.coverPath,
    options.subtitlesPath,
  ];
  const extensions = ['.mp4', '.jpg', '.srt'];
  const inputs = options.scenes
    .flatMap((scene) => [scene.sourcePath, scene.voicePath])
    .concat([options.narrationPath, options.musicPath, options.logo?.path]);
  if (
    new Set(outputs).size !== outputs.length ||
    outputs.some(
      (file, index) =>
        typeof file !== 'string' ||
        !isAbsolute(file) ||
        extname(file).toLowerCase() !== extensions[index] ||
        inputs.includes(file),
    )
  )
    throw new CreatorRenderError('INVALID_EXPORT_PATH');
}

function ffmpeg() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
function ffprobe() {
  return (
    process.env.FFPROBE_PATH ||
    (isAbsolute(ffmpeg())
      ? join(
          dirname(ffmpeg()),
          process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
        )
      : 'ffprobe')
  );
}
function execute(
  binary: string,
  args: string[],
  cwd?: string,
  timeout = 30_000,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      expired = false,
      excessive = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (bytes: Buffer) => {
      stdout += bytes.toString();
      if (stdout.length > 128 * 1024) {
        excessive = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', (bytes: Buffer) => {
      stderr = (stderr + bytes.toString()).slice(-8192);
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(new CreatorRenderError('FFMPEG_UNAVAILABLE', 503));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (expired)
        return reject(new CreatorRenderError('CREATOR_RENDER_TIMEOUT', 503));
      if (excessive || code !== 0)
        return reject(
          new CreatorRenderError(
            /No such filter.*drawtext/.test(stderr)
              ? 'CAPTION_FILTER_UNAVAILABLE'
              : 'CREATOR_RENDER_FAILED',
            503,
          ),
        );
      resolve(stdout);
    });
  });
}
async function localFile(file: string, extensions: string[]) {
  const info =
    typeof file === 'string' && isAbsolute(file)
      ? await stat(file).catch(() => null)
      : null;
  if (
    !info?.isFile() ||
    !info.size ||
    info.size > INPUT_LIMIT ||
    !extensions.includes(extname(file).toLowerCase())
  )
    throw new CreatorRenderError('CREATOR_INVALID_LOCAL_MEDIA');
}
async function probe(file: string) {
  const raw = await execute(ffprobe(), [
    '-v',
    'error',
    '-max_alloc',
    '268435456',
    '-protocol_whitelist',
    'file,pipe',
    '-show_entries',
    'stream=codec_type,codec_name,width,height:format=duration',
    '-of',
    'json',
    file,
  ]);
  try {
    const data = JSON.parse(raw) as {
      streams?: {
        codec_type: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }[];
      format?: { duration?: string };
    };
    if (!Array.isArray(data.streams)) throw new Error();
    const video = data.streams.find((stream) => stream.codec_type === 'video');
    if (
      video &&
      (!number(video.width, 1, 16384) || !number(video.height, 1, 16384))
    )
      throw new Error();
    const duration = Number(data.format?.duration);
    return {
      video,
      audio: data.streams.some((stream) => stream.codec_type === 'audio'),
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    };
  } catch {
    throw new CreatorRenderError('CREATOR_INVALID_LOCAL_MEDIA');
  }
}
async function audioFile(file: string) {
  await localFile(file, ['.wav', '.mp3', '.m4a', '.mp4']);
  const result = await probe(file);
  if (!result.audio || !result.duration || result.duration > 1800)
    throw new CreatorRenderError('CREATOR_NARRATION_INVALID');
  return result;
}
async function prepareFont(directory: string) {
  const candidates = process.env.FFMPEG_FONT_PATH
    ? [process.env.FFMPEG_FONT_PATH]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf'),
      ];
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile() && info.size < 50 * 1024 * 1024) {
      await copyFile(candidate, join(directory, 'caption-font.ttf'));
      return;
    }
  }
  throw new CreatorRenderError('CAPTION_FONT_UNAVAILABLE', 503);
}
function wrap(text: string, maximum: number) {
  const words = cleanText(text)
    .split(' ')
    .flatMap((word) => {
      const result: string[] = [];
      const points = Array.from(word);
      for (let i = 0; i < points.length; i += maximum)
        result.push(points.slice(i, i + maximum).join(''));
      return result;
    });
  const lines: string[] = [];
  for (const word of words) {
    const previous = lines.at(-1);
    if (previous && previous.length + word.length + 1 <= maximum)
      lines[lines.length - 1] = `${previous} ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
}
type Cue = { text: string; start: number; end: number };
function cuesFor(text: string, duration: number, lineWidth: number): Cue[] {
  const normalized = cleanText(text);
  if (!normalized) return [];
  const lines = wrap(normalized, lineWidth).split('\n');
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 2)
    chunks.push(lines.slice(i, i + 2).join('\n'));
  const weights = chunks.map((chunk) => chunk.length);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const available = Math.max(0.1, duration - 0.2);
  let elapsed = 0.1;
  return chunks.map((chunk, index) => {
    const cue = {
      text: chunk,
      start: elapsed,
      end: Math.min(
        duration - 0.1,
        elapsed + (available * weights[index]) / total,
      ),
    };
    elapsed = cue.end;
    return cue;
  });
}
function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
const baseArgs = () => [
  '-nostdin',
  '-hide_banner',
  '-loglevel',
  'error',
  '-n',
  '-max_alloc',
  '268435456',
  '-threads',
  '2',
  '-filter_threads',
  '2',
  '-filter_complex_threads',
  '2',
];

/** Local editing only. Null sources produce text cards, never generated people. */
export async function renderCreatorVideo(options: CreatorRenderOptions) {
  validateCreatorRenderOptions(options);
  for (const path of [
    options.outputPath,
    options.coverPath,
    options.subtitlesPath,
  ])
    if (await stat(path).catch(() => null))
      throw new CreatorRenderError('EXPORT_ALREADY_EXISTS');
  await checkExportSupport('h264');
  const music = options.musicPath ? await audioFile(options.musicPath) : null;
  const narration = options.narrationPath
    ? await audioFile(options.narrationPath)
    : null;
  if (options.logo)
    await localFile(options.logo.path, ['.png', '.jpg', '.jpeg', '.webp']);
  const sources = await Promise.all(
    options.scenes.map(async (scene) => {
      if (!scene.sourcePath) return null;
      await localFile(
        scene.sourcePath,
        scene.sourceMimeType === 'video/mp4'
          ? ['.mp4']
          : ['.png', '.jpg', '.jpeg', '.webp'],
      );
      const source = await probe(scene.sourcePath);
      if (
        !source.video ||
        (scene.sourceMimeType === 'video/mp4' && !source.duration)
      )
        throw new CreatorRenderError('CREATOR_INVALID_LOCAL_MEDIA');
      return source;
    }),
  );
  const voices = await Promise.all(
    options.scenes.map((scene) =>
      scene.voicePath ? audioFile(scene.voicePath) : null,
    ),
  );
  const minimumDurations = options.scenes.map((scene, index) =>
    Math.max(scene.durationSeconds, voices[index]?.duration ?? 0),
  );
  const minimumTotal = minimumDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  if (minimumTotal > 600 || (narration?.duration ?? 0) > 600)
    throw new CreatorRenderError('CREATOR_DURATION_LIMIT');
  let durations = options.scenes.map((scene, index) =>
    Math.max(
      scene.durationSeconds,
      voices[index] ? voices[index]!.duration + 0.25 : 0,
    ),
  );
  // A brief pause follows speech when room allows; never reject a fitting
  // ten-minute narration merely because this optional padding exceeds the cap.
  const paddedTotal = durations.reduce((sum, duration) => sum + duration, 0);
  if (paddedTotal > 600) {
    const fraction = (600 - minimumTotal) / (paddedTotal - minimumTotal);
    durations = durations.map(
      (duration, index) =>
        minimumDurations[index] +
        (duration - minimumDurations[index]) * fraction,
    );
  }
  const target = durations.reduce((sum, duration) => sum + duration, 0);
  const narrationTarget = narration
    ? Math.min(600, narration.duration + 0.25)
    : 0;
  if (narration && narrationTarget > target)
    durations = durations.map(
      (duration) => (duration * narrationTarget) / target,
    );
  let requestedElapsed = 0,
    previousFrames = 0;
  durations = durations.map((duration) => {
    requestedElapsed += duration;
    const frames = Math.round(requestedElapsed * FPS);
    const rounded = (frames - previousFrames) / FPS;
    previousFrames = frames;
    return rounded;
  });
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  if (totalDuration > 600)
    throw new CreatorRenderError('CREATOR_DURATION_LIMIT');
  const base = getExportDimensions(
    options.format,
    options.resolution === 360 ? 720 : options.resolution,
  );
  const width = options.resolution === 360 ? base.width / 2 : base.width;
  const height = options.resolution === 360 ? base.height / 2 : base.height;
  const fontSize = Math.max(
    16,
    Math.round(width * (options.format === '16:9' ? 0.022 : 0.038)),
  );
  const margin = Math.max(12, Math.round(width * 0.035));
  // Keep even wide capital glyphs inside the frame, including narrow previews.
  const lineWidth = Math.max(
    12,
    Math.floor((width - 2 * margin) / (fontSize * 1.05)),
  );
  const disclosure = cleanText(options.disclosure ?? '');
  const disclosureFont = Math.max(12, Math.round(fontSize * 0.75));
  const disclosureText = wrap(
    disclosure,
    Math.max(12, Math.floor((width - 2 * margin) / (disclosureFont * 1.05))),
  );
  const disclosureHeight = disclosure
    ? disclosureText.split('\n').length * Math.ceil(disclosureFont * 1.2) +
      2 * margin
    : 0;
  await mkdir(dirname(options.outputPath), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(
    join(dirname(options.outputPath), '.creator-render-'),
  );
  const published: string[] = [];
  try {
    await prepareFont(directory);
    if (disclosure)
      await writeFile(join(directory, 'disclosure.txt'), disclosureText, {
        mode: 0o600,
      });
    await options.onProgress?.(5);
    const sceneTimings: CreatorSceneTiming[] = [];
    const allCues: Cue[] = [];
    let elapsed = 0;
    for (const [index, scene] of options.scenes.entries()) {
      const duration = durations[index];
      sceneTimings.push({
        id: scene.id,
        startSeconds: elapsed,
        endSeconds: elapsed + duration,
      });
      const cues = cuesFor(scene.narration, duration, lineWidth);
      allCues.push(
        ...cues.map((cue) => ({
          ...cue,
          start: cue.start + elapsed,
          end: cue.end + elapsed,
        })),
      );
      let sourcePath = scene.sourcePath;
      if (!sourcePath) {
        sourcePath = join(directory, `card-${index}.png`);
        await sharp({
          create: { width, height, channels: 3, background: '#252c3d' },
        })
          .png()
          .toFile(sourcePath);
      }
      const args = baseArgs();
      if (scene.sourceMimeType === 'video/mp4') args.push('-stream_loop', '-1');
      else args.push('-loop', '1', '-framerate', String(FPS));
      args.push('-protocol_whitelist', 'file,pipe', '-i', sourcePath);
      const filters: string[] = [
        `[0:v]fps=${FPS},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x252c3d,setsar=1,format=yuv420p,settb=AVTB,trim=duration=${duration},setpts=PTS-STARTPTS[v0]`,
      ];
      let video = 'v0';
      if (disclosure) {
        filters.push(
          `[${video}]drawbox=x=0:y=0:w=iw:h=${disclosureHeight}:color=black@0.72:t=fill,drawtext=fontfile=caption-font.ttf:textfile=disclosure.txt:expansion=none:fontsize=${disclosureFont}:fontcolor=white:line_spacing=${Math.round(disclosureFont * 0.2)}:x=(w-text_w)/2:y=${margin}[disclosed]`,
        );
        video = 'disclosed';
      }
      if (cleanText(scene.onScreenText)) {
        const lines = wrap(scene.onScreenText, lineWidth).split('\n');
        const pages: string[] = [];
        for (let line = 0; line < lines.length; line += 4)
          pages.push(lines.slice(line, line + 4).join('\n'));
        for (const [pageIndex, page] of pages.entries()) {
          const titleName = `title-${index}-${pageIndex}.txt`;
          await writeFile(join(directory, titleName), page, { mode: 0o600 });
          const label = `title${pageIndex}`;
          filters.push(
            `[${video}]drawtext=fontfile=caption-font.ttf:textfile=${titleName}:expansion=none:fontsize=${fontSize}:fontcolor=white:line_spacing=${Math.round(fontSize * 0.2)}:box=1:boxcolor=black@0.62:boxborderw=${margin / 2}:x=(w-text_w)/2:y=${disclosureHeight + margin}:enable='gte(t,${(duration * pageIndex) / pages.length})*lt(t,${(duration * (pageIndex + 1)) / pages.length})'[${label}]`,
          );
          video = label;
        }
      }
      for (const [cueIndex, cue] of cues.entries()) {
        const name = `subtitle-${index}-${cueIndex}.txt`;
        await writeFile(join(directory, name), cue.text, { mode: 0o600 });
        const label = `caption${cueIndex}`;
        filters.push(
          `[${video}]drawtext=fontfile=caption-font.ttf:textfile=${name}:expansion=none:fontsize=${fontSize}:fontcolor=white:line_spacing=${Math.round(fontSize * 0.2)}:box=1:boxcolor=black@0.65:boxborderw=${margin / 2}:x=(w-text_w)/2:y=h-text_h-${margin}:enable='gte(t,${cue.start})*lt(t,${cue.end})'[${label}]`,
        );
        video = label;
      }
      const hasOriginalAudio =
        scene.sourceMimeType === 'video/mp4' && sources[index]?.audio;
      filters.push(
        hasOriginalAudio
          ? `[0:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration},volume=${scene.voicePath ? 0.15 : 1}[original]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[original]`,
      );
      let audio = 'original';
      if (scene.voicePath) {
        args.push('-protocol_whitelist', 'file,pipe', '-i', scene.voicePath);
        filters.push(
          `[1:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration}[voice]`,
        );
        filters.push(
          '[original][voice]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mixed]',
        );
        audio = 'mixed';
      }
      args.push(
        '-filter_complex',
        filters.join(';'),
        '-map',
        `[${video}]`,
        '-map',
        `[${audio}]`,
        '-t',
        String(duration),
        '-r',
        String(FPS),
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-preset',
        'veryfast',
        '-crf',
        options.resolution === 360 ? '28' : '21',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-fs',
        String(OUTPUT_LIMIT),
        '-movflags',
        '+faststart',
        `scene-${index}.mp4`,
      );
      await execute(
        ffmpeg(),
        args,
        directory,
        Math.min(900_000, Math.max(120_000, duration * 6000)),
      );
      const result = await probe(join(directory, `scene-${index}.mp4`));
      if (Math.abs(result.duration - duration) > 0.2)
        throw new CreatorRenderError('CREATOR_RENDER_INCOMPLETE', 503);
      elapsed += duration;
      await options.onProgress?.(
        Math.round(5 + ((index + 1) / options.scenes.length) * 65),
      );
    }
    await writeFile(
      join(directory, 'scenes.ffconcat'),
      `ffconcat version 1.0\n${options.scenes.map((_, index) => `file 'scene-${index}.mp4'`).join('\n')}\n`,
      { mode: 0o600 },
    );
    const args = baseArgs();
    args.push(
      '-protocol_whitelist',
      'file,pipe',
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      'scenes.ffconcat',
    );
    const filters: string[] = [];
    let audio = '0:a',
      video = '0:v',
      inputIndex = 1;
    if (options.narrationPath && narration) {
      args.push(
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        options.narrationPath,
      );
      filters.push(
        `[0:a]volume=0.15[source-audio]`,
        `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${totalDuration}[narration]`,
        '[source-audio][narration]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[narrated]',
      );
      audio = 'narrated';
      inputIndex++;
    }
    if (options.musicPath && music) {
      args.push(
        '-stream_loop',
        '-1',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        options.musicPath,
      );
      filters.push(
        `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${totalDuration},volume=${options.musicVolume ?? 0.18}[music]`,
        `[${audio}][music]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[music-mix]`,
      );
      audio = 'music-mix';
      inputIndex++;
    }
    if (options.logo) {
      const logo = options.logo;
      args.push(
        '-loop',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        logo.path,
      );
      const position: Record<LogoPosition, string> = {
        'top-left': `${margin}:${margin + disclosureHeight}`,
        'top-right': `W-w-${margin}:${margin + disclosureHeight}`,
        'bottom-left': `${margin}:H-h-${margin}`,
        'bottom-right': `W-w-${margin}:H-h-${margin}`,
        center: '(W-w)/2:(H-h)/2',
      };
      const timing = getLogoTimingWindow(totalDuration, logo.timing, 0.35);
      filters.push(
        `[${inputIndex}:v]scale=${Math.max(2, Math.round((width * (logo.sizePercent ?? 15)) / 200) * 2)}:-2,format=rgba,colorchannelmixer=aa=${logo.opacity ?? 0.8}${logo.fade ? `,fade=t=in:st=${timing.start}:d=${timing.fadeSeconds}:alpha=1,fade=t=out:st=${timing.end - timing.fadeSeconds}:d=${timing.fadeSeconds}:alpha=1` : ''}[logo]`,
        `[0:v][logo]overlay=${position[logo.position ?? 'bottom-right']}:shortest=1:enable='between(t,${timing.start},${timing.end})'[branded]`,
      );
      video = 'branded';
    }
    if (filters.length) args.push('-filter_complex', filters.join(';'));
    args.push(
      '-map',
      video.includes(':') ? video : `[${video}]`,
      '-map',
      audio.includes(':') ? audio : `[${audio}]`,
      '-t',
      String(totalDuration),
    );
    if (video === '0:v') args.push('-c:v', 'copy');
    else
      args.push(
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-preset',
        'veryfast',
        '-crf',
        options.resolution === 360 ? '28' : '21',
        '-pix_fmt',
        'yuv420p',
      );
    args.push('-c:a', audio === '0:a' ? 'copy' : 'aac');
    if (audio !== '0:a') args.push('-b:a', '160k', '-ar', '48000', '-ac', '2');
    args.push(
      '-movflags',
      '+faststart',
      '-fs',
      String(OUTPUT_LIMIT),
      'final.mp4',
    );
    await execute(ffmpeg(), args, directory, 900_000);
    await options.onProgress?.(90);
    const final = await probe(join(directory, 'final.mp4'));
    const bytes = (await stat(join(directory, 'final.mp4'))).size;
    if (
      !final.video ||
      !final.audio ||
      Math.abs(final.duration - totalDuration) > 0.25 ||
      final.video.width !== width ||
      final.video.height !== height ||
      bytes >= OUTPUT_LIMIT
    )
      throw new CreatorRenderError('CREATOR_RENDER_INCOMPLETE', 503);
    await execute(
      ffmpeg(),
      [
        ...baseArgs(),
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(Math.min(0.5, totalDuration / 2)),
        '-i',
        'final.mp4',
        '-frames:v',
        '1',
        '-q:v',
        '2',
        'cover.jpg',
      ],
      directory,
    );
    if (disclosure) {
      if (allCues[0]) allCues[0].text = `${disclosure}\n${allCues[0].text}`;
      else allCues.push({ text: disclosure, start: 0, end: totalDuration });
    }
    const srt = allCues
      .map(
        (cue, index) =>
          `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`,
      )
      .join('\n');
    await writeFile(join(directory, 'subtitles.srt'), srt, { mode: 0o600 });
    await options.onProgress?.(95);
    for (const [source, destination] of [
      ['final.mp4', options.outputPath],
      ['cover.jpg', options.coverPath],
      ['subtitles.srt', options.subtitlesPath],
    ]) {
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await copyFile(
        join(directory, source),
        destination,
        constants.COPYFILE_EXCL,
      );
      published.push(destination);
      await chmod(destination, 0o600);
    }
    const coverBytes = (await stat(options.coverPath)).size;
    await options.onProgress?.(100);
    return {
      durationSeconds: final.duration,
      width,
      height,
      bytes,
      coverBytes,
      sceneTimings,
      srt,
    };
  } catch (error) {
    await Promise.all(
      published.map((file) => unlink(file).catch(() => undefined)),
    );
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
