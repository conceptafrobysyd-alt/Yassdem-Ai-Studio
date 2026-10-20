import { spawn } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, extname } from 'node:path';

export type VideoFormat = '9:16' | '4:5' | '1:1' | '16:9';
export type VideoResolution = 720 | 1080 | 1440 | 2160;
export type VideoCodec = 'h264' | 'h265';
export type LogoPosition =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type LogoTiming = 'all' | 'start' | 'end';
export interface ExportLogo {
  path: string;
  position?: LogoPosition;
  sizePercent?: number;
  opacity?: number;
  fade?: boolean;
  timing?: LogoTiming;
}
export interface ExportOptions {
  outputPath: string;
  durationSeconds?: number;
  format: VideoFormat;
  resolution: VideoResolution;
  codec?: VideoCodec;
  quality?: number;
  logo?: ExportLogo;
}

export class ExportError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = 'ExportError';
  }
}

/** Timed logos are overlays on the existing video, never extra title cards. */
export function getLogoTimingWindow(
  duration: number,
  timing: LogoTiming = 'all',
  preferredFadeSeconds = 0.5,
) {
  if (!['all', 'start', 'end'].includes(timing))
    throw new ExportError('INVALID_LOGO_SETTINGS');
  if (!Number.isFinite(duration) || duration <= 0)
    throw new ExportError('INVALID_DURATION');
  const span = timing === 'all' ? duration : Math.min(2, duration);
  const start = timing === 'end' ? duration - span : 0;
  return {
    start,
    end: start + span,
    fadeSeconds: Math.min(preferredFadeSeconds, span / 2),
  };
}

export function getExportDimensions(
  format: VideoFormat,
  resolution: VideoResolution,
) {
  if (![720, 1080, 1440, 2160].includes(resolution))
    throw new ExportError('INVALID_RESOLUTION');
  const ratios: Record<VideoFormat, [number, number]> = {
    '9:16': [9, 16],
    '4:5': [4, 5],
    '1:1': [1, 1],
    '16:9': [16, 9],
  };
  if (!Object.hasOwn(ratios, format)) throw new ExportError('INVALID_FORMAT');
  const ratio = ratios[format];
  // The named resolution is the short edge: 1080 -> 1080x1920 vertical.
  const scale = resolution / Math.min(...ratio);
  return {
    width: Math.round((ratio[0] * scale) / 2) * 2,
    height: Math.round((ratio[1] * scale) / 2) * 2,
  };
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
function ffprobePath() {
  return (
    process.env.FFPROBE_PATH ||
    (isAbsolute(ffmpegPath())
      ? join(dirname(ffmpegPath()), 'ffprobe')
      : 'ffprobe')
  );
}

function runProcess(
  binary: string,
  args: string[],
  timeout = 180_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 64 * 1024) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new ExportError('FFMPEG_UNAVAILABLE', 503));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (expired) return reject(new ExportError('EXPORT_TIMEOUT', 503));
      if (code !== 0) {
        const missingEncoder =
          /Unknown encoder|not found.*encoder|Encoder.*not found/i.test(stderr);
        return reject(
          new ExportError(
            missingEncoder ? 'CODEC_UNAVAILABLE' : 'EXPORT_FAILED',
            503,
          ),
        );
      }
      resolve(stdout);
    });
  });
}

export async function checkExportSupport(codec: VideoCodec = 'h264') {
  const output = await runProcess(
    ffmpegPath(),
    ['-hide_banner', '-encoders'],
    15_000,
  );
  if (!output.includes(codec === 'h265' ? 'libx265' : 'libx264'))
    throw new ExportError('CODEC_UNAVAILABLE', 503);
}

async function requireLocalFile(path: string, extensions: string[]) {
  if (!isAbsolute(path) || !extensions.includes(extname(path).toLowerCase()))
    throw new ExportError('INVALID_LOCAL_MEDIA');
  const info = await stat(path).catch(() => null);
  if (!info?.isFile() || info.size > 256 * 1024 * 1024 || info.size === 0)
    throw new ExportError('INVALID_LOCAL_MEDIA');
}

export async function probeMedia(path: string) {
  await requireLocalFile(path, ['.mp4', '.png', '.jpg', '.jpeg', '.webp']);
  const result = await runProcess(
    ffprobePath(),
    [
      '-v',
      'error',
      '-max_alloc',
      '268435456',
      '-protocol_whitelist',
      'file,pipe',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      path,
    ],
    15_000,
  );
  try {
    const data = JSON.parse(result) as {
      streams?: { width: number; height: number }[];
      format?: { duration?: string };
    };
    const stream = data.streams?.[0];
    if (
      !stream ||
      !Number.isInteger(stream.width) ||
      !Number.isInteger(stream.height) ||
      stream.width < 1 ||
      stream.height < 1 ||
      stream.width > 16384 ||
      stream.height > 16384
    )
      throw new Error();
    const duration = Number(data.format?.duration);
    return {
      width: stream.width,
      height: stream.height,
      durationSeconds: Number.isFinite(duration) ? duration : undefined,
    };
  } catch {
    throw new ExportError('INVALID_LOCAL_MEDIA');
  }
}

/** An estimate only, dependent on motion and CRF; this is not a storage guarantee. */
export function estimateExportSize(
  options: Pick<ExportOptions, 'format' | 'resolution' | 'codec'> & {
    durationSeconds: number;
  },
) {
  const dimensions = getExportDimensions(options.format, options.resolution);
  return Math.ceil(
    dimensions.width *
      dimensions.height *
      options.durationSeconds *
      (options.codec === 'h265' ? 0.055 : 0.08),
  );
}

async function performExport(
  inputPath: string,
  options: ExportOptions,
  localAnimation: boolean,
) {
  await requireLocalFile(
    inputPath,
    localAnimation ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.mp4'],
  );
  if (
    !isAbsolute(options.outputPath) ||
    extname(options.outputPath).toLowerCase() !== '.mp4' ||
    options.outputPath === inputPath
  ) {
    throw new ExportError('INVALID_EXPORT_PATH');
  }
  if (await stat(options.outputPath).catch(() => null))
    throw new ExportError('EXPORT_ALREADY_EXISTS');
  const { width, height } = getExportDimensions(
    options.format,
    options.resolution,
  );
  const native = await probeMedia(inputPath);
  const duration =
    options.durationSeconds ?? Math.min(native.durationSeconds ?? 5, 15);
  if (!Number.isFinite(duration) || duration < 1 || duration > 15)
    throw new ExportError('INVALID_DURATION');
  const codec = options.codec ?? 'h264';
  if (!['h264', 'h265'].includes(codec)) throw new ExportError('INVALID_CODEC');
  const quality = options.quality ?? 21;
  if (!Number.isInteger(quality) || quality < 18 || quality > 32)
    throw new ExportError('INVALID_QUALITY');
  const args = [
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
    '-protocol_whitelist',
    'file,pipe',
    '-i',
    inputPath,
  ];
  let filter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
  if (localAnimation)
    filter += `,zoompan=z='min(zoom+0.0005,1.08)':d=${Math.ceil(duration * 24)}:s=${width}x${height}:fps=24`;
  filter += '[base]';
  let outputLabel = 'base';
  if (options.logo) {
    await requireLocalFile(options.logo.path, [
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
    ]);
    const percent = options.logo.sizePercent ?? 18;
    const opacity = options.logo.opacity ?? 0.8;
    const position = options.logo.position ?? 'bottom-right';
    const timing = getLogoTimingWindow(
      localAnimation
        ? duration
        : Math.min(duration, native.durationSeconds ?? duration),
      options.logo.timing,
    );
    if (
      !Number.isFinite(percent) ||
      percent < 3 ||
      percent > 50 ||
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1
    ) {
      throw new ExportError('INVALID_LOGO_SETTINGS');
    }
    const positions: Record<LogoPosition, string> = {
      'top-left': '24:24',
      'top-right': 'W-w-24:24',
      'bottom-left': '24:H-h-24',
      'bottom-right': 'W-w-24:H-h-24',
      center: '(W-w)/2:(H-h)/2',
    };
    if (!positions[position]) throw new ExportError('INVALID_LOGO_SETTINGS');
    // A looped local bitmap supplies the overlay for the entire clip, including fades.
    args.push(
      '-loop',
      '1',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      options.logo.path,
    );
    filter += `;[1:v]scale=${Math.round((width * percent) / 100 / 2) * 2}:-2,format=rgba,colorchannelmixer=aa=${opacity}`;
    if (options.logo.fade)
      filter += `,fade=t=in:st=${timing.start}:d=${timing.fadeSeconds}:alpha=1,fade=t=out:st=${timing.end - timing.fadeSeconds}:d=${timing.fadeSeconds}:alpha=1`;
    filter += `[logo];[base][logo]overlay=${positions[position]}:shortest=1:enable='between(t,${timing.start},${timing.end})'[out]`;
    outputLabel = 'out';
  }
  args.push(
    '-filter_complex',
    filter,
    '-map',
    `[${outputLabel}]`,
    '-t',
    String(duration),
    '-r',
    '24',
    '-c:v',
    codec === 'h265' ? 'libx265' : 'libx264',
    '-threads',
    '2',
    '-preset',
    'veryfast',
    '-crf',
    String(quality),
    '-pix_fmt',
    'yuv420p',
  );
  if (localAnimation) args.push('-an');
  else args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '192k');
  if (codec === 'h265')
    args.push(
      '-tag:v',
      'hvc1',
      '-x265-params',
      'pools=2:frame-threads=2:log-level=error',
    );
  args.push(
    '-movflags',
    '+faststart',
    '-fs',
    String(256 * 1024 * 1024),
    '-f',
    'mp4',
    options.outputPath,
  );
  try {
    await runProcess(
      ffmpegPath(),
      args,
      options.resolution === 2160 ? 300_000 : 180_000,
    );
  } catch (error) {
    await unlink(options.outputPath).catch(() => undefined);
    throw error;
  }
  let output: Awaited<ReturnType<typeof probeMedia>>;
  let size: number;
  try {
    output = await probeMedia(options.outputPath);
    size = (await stat(options.outputPath)).size;
    if (size > 256 * 1024 * 1024)
      throw new ExportError('EXPORT_TOO_LARGE', 503);
    if (
      !output.durationSeconds ||
      output.durationSeconds <
        Math.min(duration, native.durationSeconds ?? duration) - 0.15
    ) {
      throw new ExportError('EXPORT_INCOMPLETE', 503);
    }
  } catch (error) {
    await unlink(options.outputPath).catch(() => undefined);
    throw error;
  }
  return {
    width: output.width,
    height: output.height,
    durationSeconds: output.durationSeconds ?? duration,
    codec,
    nativeWidth: native.width,
    nativeHeight: native.height,
    upscaled: width > native.width || height > native.height,
    aiUpscaling: false as const,
    bytes: size,
    estimatedSizeBytes: estimateExportSize({
      ...options,
      durationSeconds: duration,
    }),
    sourceKind: localAnimation
      ? ('local-animation' as const)
      : ('video-export' as const),
  };
}

export function exportVideo(options: ExportOptions & { inputPath: string }) {
  return performExport(options.inputPath, options, false);
}

/** Explicit local pan/zoom animation of a still; never labelled as AI generation. */
export function createLocalAnimation(
  options: ExportOptions & { imagePath: string },
) {
  return performExport(options.imagePath, options, true);
}
