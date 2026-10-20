import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdtemp,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, isAbsolute, join } from 'node:path';
import {
  checkExportSupport,
  getExportDimensions,
  getLogoTimingWindow,
  probeMedia,
  type ExportLogo,
  type LogoPosition,
  type LogoTiming,
  type VideoCodec,
  type VideoFormat,
  type VideoResolution,
} from './export';

export const MAX_EDITOR_CLIPS = 12;
export const MAX_EDITOR_DURATION = 120;
export const EDITOR_FADE_SECONDS = 0.35;
export interface EditorClip {
  mediaId: string;
  startSeconds: number;
  endSeconds: number;
}
export interface EditorCaption {
  text: string;
  startSeconds: number;
  endSeconds: number;
  position: 'top' | 'center' | 'bottom';
}
export interface EditorTimeline {
  version: 1;
  clips: EditorClip[];
  captions: EditorCaption[];
  transition: 'cut' | 'fade';
  musicMediaId: string | null;
  musicVolume: number;
  format: VideoFormat;
  resolution: VideoResolution;
  codec: VideoCodec;
  quality: number;
  logoId: string | null;
  logoSize: number;
  logoOpacity: number;
  logoPosition: LogoPosition;
  logoFade: boolean;
  logoTiming: LogoTiming;
}
export class EditorError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = 'EditorError';
  }
}
export function defaultEditorTimeline(): EditorTimeline {
  return {
    version: 1,
    clips: [],
    captions: [],
    transition: 'cut',
    musicMediaId: null,
    musicVolume: 0.25,
    format: '9:16',
    resolution: 1080,
    codec: 'h264',
    quality: 21,
    logoId: null,
    logoSize: 15,
    logoOpacity: 0.8,
    logoPosition: 'bottom-right',
    logoFade: false,
    logoTiming: 'all',
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EditorError('INVALID_EDITOR_TIMELINE');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new EditorError('INVALID_MEDIA_ID');
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new EditorError('INVALID_EDITOR_TIMING');
  return Math.round(value * 1000) / 1000;
}
export function editorDuration(
  timeline: Pick<EditorTimeline, 'clips' | 'transition'>,
) {
  return (
    Math.round(
      (timeline.clips.reduce(
        (sum, clip) => sum + clip.endSeconds - clip.startSeconds,
        0,
      ) -
        (timeline.transition === 'fade'
          ? Math.max(0, timeline.clips.length - 1) * EDITOR_FADE_SECONDS
          : 0)) *
        1000,
    ) / 1000
  );
}
/** Reconstruct every field; request data never becomes an FFmpeg argument or filter. */
export function parseEditorTimeline(value: unknown): EditorTimeline {
  const input = object(value);
  const defaults = defaultEditorTimeline();
  if ('version' in input && input.version !== 1)
    throw new EditorError('UNSUPPORTED_EDITOR_VERSION');
  if (!Array.isArray(input.clips) || input.clips.length > MAX_EDITOR_CLIPS)
    throw new EditorError('EDITOR_CLIP_LIMIT');
  const clips = input.clips.map((value): EditorClip => {
    const clip = object(value);
    const startSeconds = number(clip.startSeconds, 0, 86400);
    const endSeconds = number(clip.endSeconds, 0, 86400);
    if (endSeconds - startSeconds < 0.5)
      throw new EditorError('EDITOR_CLIP_TOO_SHORT');
    return { mediaId: identifier(clip.mediaId), startSeconds, endSeconds };
  });
  const transition = input.transition ?? defaults.transition;
  if (transition !== 'cut' && transition !== 'fade')
    throw new EditorError('INVALID_EDITOR_TRANSITION');
  const duration = editorDuration({ clips, transition });
  // Bound source duration as well as final duration: cross-fades still decode both clips.
  if (
    clips.reduce((sum, clip) => sum + clip.endSeconds - clip.startSeconds, 0) >
    MAX_EDITOR_DURATION
  )
    throw new EditorError('EDITOR_DURATION_LIMIT');
  const rawCaptions = input.captions ?? [];
  if (!Array.isArray(rawCaptions) || rawCaptions.length > 40)
    throw new EditorError('EDITOR_CAPTION_LIMIT');
  const captions = rawCaptions.map((value): EditorCaption => {
    const caption = object(value);
    if (
      typeof caption.text !== 'string' ||
      !caption.text.trim() ||
      caption.text.length > 500 ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(caption.text) ||
      caption.text.split('\n').length > 4
    )
      throw new EditorError('INVALID_EDITOR_CAPTION');
    const startSeconds = number(caption.startSeconds, 0, duration);
    const endSeconds = number(caption.endSeconds, 0, duration);
    if (endSeconds <= startSeconds)
      throw new EditorError('INVALID_EDITOR_CAPTION');
    const position = caption.position ?? 'bottom';
    if (!['top', 'center', 'bottom'].includes(position as string))
      throw new EditorError('INVALID_EDITOR_CAPTION');
    return {
      text: caption.text,
      startSeconds,
      endSeconds,
      position: position as EditorCaption['position'],
    };
  });
  const format = input.format ?? defaults.format;
  const resolution = input.resolution ?? defaults.resolution;
  getExportDimensions(format as VideoFormat, resolution as VideoResolution);
  const codec = input.codec ?? defaults.codec;
  if (!['h264', 'h265'].includes(codec as string))
    throw new EditorError('INVALID_CODEC');
  const quality = input.quality ?? defaults.quality;
  if (
    typeof quality !== 'number' ||
    !Number.isInteger(quality) ||
    quality < 18 ||
    quality > 32
  )
    throw new EditorError('INVALID_QUALITY');
  const logoPosition = input.logoPosition ?? defaults.logoPosition;
  if (
    ![
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'center',
    ].includes(logoPosition as string)
  )
    throw new EditorError('INVALID_LOGO_SETTINGS');
  if ('logoFade' in input && typeof input.logoFade !== 'boolean')
    throw new EditorError('INVALID_LOGO_SETTINGS');
  const logoTiming = input.logoTiming ?? defaults.logoTiming;
  if (!['all', 'start', 'end'].includes(logoTiming as string))
    throw new EditorError('INVALID_LOGO_SETTINGS');
  return {
    version: 1,
    clips,
    captions,
    transition,
    musicMediaId:
      input.musicMediaId == null ? null : identifier(input.musicMediaId),
    musicVolume: number(input.musicVolume ?? defaults.musicVolume, 0, 1),
    format: format as VideoFormat,
    resolution: resolution as VideoResolution,
    codec: codec as VideoCodec,
    quality,
    logoId: input.logoId == null ? null : identifier(input.logoId),
    logoSize: number(input.logoSize ?? defaults.logoSize, 3, 50),
    logoOpacity: number(input.logoOpacity ?? defaults.logoOpacity, 0, 1),
    logoPosition: logoPosition as LogoPosition,
    logoFade: input.logoFade === true,
    logoTiming: logoTiming as LogoTiming,
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
function run(
  binary: string,
  args: string[],
  cwd?: string,
  timeout = 30_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill('SIGKILL');
    }, timeout);
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 64 * 1024) child.kill('SIGKILL');
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = (stderr + data.toString()).slice(-4096);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new EditorError('FFMPEG_UNAVAILABLE', 503));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (expired) return reject(new EditorError('EDITOR_RENDER_TIMEOUT', 503));
      if (code !== 0)
        return reject(
          new EditorError(
            /No such filter.*drawtext/.test(stderr)
              ? 'CAPTION_FILTER_UNAVAILABLE'
              : 'EDITOR_RENDER_FAILED',
            503,
          ),
        );
      resolve(stdout);
    });
  });
}
async function localFile(path: string, extensions: string[]) {
  const info = await stat(path).catch(() => null);
  if (
    !isAbsolute(path) ||
    !extensions.includes(extname(path).toLowerCase()) ||
    !info?.isFile() ||
    !info.size ||
    info.size > 256 * 1024 * 1024
  )
    throw new EditorError('INVALID_LOCAL_MEDIA');
}
export async function probeEditorInput(path: string) {
  await localFile(path, ['.mp4', '.mp3', '.wav', '.m4a']);
  const raw = await run(ffprobePath(), [
    '-v',
    'error',
    '-max_alloc',
    '268435456',
    '-protocol_whitelist',
    'file,pipe',
    '-show_entries',
    'stream=codec_type,width,height:format=duration',
    '-of',
    'json',
    path,
  ]);
  try {
    const data = JSON.parse(raw) as {
      streams?: { codec_type: string; width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const duration = Number(data.format?.duration);
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Array.isArray(data.streams)
    )
      throw new Error();
    const video = data.streams.find((stream) => stream.codec_type === 'video');
    if (
      video &&
      (!Number.isInteger(video.width) ||
        !Number.isInteger(video.height) ||
        (video.width ?? 0) < 1 ||
        (video.height ?? 0) < 1 ||
        (video.width ?? 0) > 16384 ||
        (video.height ?? 0) > 16384)
    )
      throw new Error();
    return {
      duration,
      video: Boolean(video),
      audio: data.streams.some((stream) => stream.codec_type === 'audio'),
      width: video?.width,
      height: video?.height,
    };
  } catch {
    throw new EditorError('INVALID_LOCAL_MEDIA');
  }
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
    const file = await stat(candidate).catch(() => null);
    if (file?.isFile() && file.size <= 50 * 1024 * 1024) {
      await copyFile(candidate, join(directory, 'caption-font.ttf'));
      return;
    }
  }
  throw new EditorError('CAPTION_FONT_UNAVAILABLE', 503);
}
export interface RenderEditorOptions {
  timeline: EditorTimeline;
  /** Local paths resolved by the worker from database IDs, never from request input. */
  clipPaths: string[];
  musicPath?: string;
  musicRightsConfirmed?: boolean;
  logo?: ExportLogo;
  outputPath: string;
  coverPath: string;
  /** Lightweight local composition; final timeline settings remain untouched. */
  preview?: boolean;
}
/** Render ordered, trimmed clips, their original audio, captions, music and a logo. */
export async function renderEditorTimeline(options: RenderEditorOptions) {
  const timeline = parseEditorTimeline(options.timeline);
  if (
    !timeline.clips.length ||
    timeline.clips.length !== options.clipPaths.length
  )
    throw new EditorError('EDITOR_CLIPS_REQUIRED');
  if (
    timeline.musicMediaId &&
    (!options.musicPath || options.musicRightsConfirmed !== true)
  )
    throw new EditorError('MUSIC_RIGHTS_REQUIRED');
  if (timeline.logoId && !options.logo) throw new EditorError('LOGO_NOT_FOUND');
  for (const [path, extension] of [
    [options.outputPath, '.mp4'],
    [options.coverPath, '.jpg'],
  ]) {
    if (
      !isAbsolute(path) ||
      extname(path).toLowerCase() !== extension ||
      options.clipPaths.includes(path)
    )
      throw new EditorError('INVALID_EXPORT_PATH');
    if (await stat(path).catch(() => null))
      throw new EditorError('EXPORT_ALREADY_EXISTS');
  }
  const outputCodec = options.preview ? 'h264' : timeline.codec;
  const outputQuality = options.preview ? 28 : timeline.quality;
  await checkExportSupport(outputCodec);
  const sources = await Promise.all(options.clipPaths.map(probeEditorInput));
  timeline.clips.forEach((clip, index) => {
    if (
      !sources[index].video ||
      clip.endSeconds > sources[index].duration + 0.05
    )
      throw new EditorError('EDITOR_TRIM_OUT_OF_RANGE');
  });
  if (
    timeline.musicMediaId &&
    !(await probeEditorInput(options.musicPath!)).audio
  )
    throw new EditorError('MUSIC_AUDIO_REQUIRED');
  if (options.logo)
    await localFile(options.logo.path, ['.png', '.jpg', '.jpeg', '.webp']);
  const directory = await mkdtemp(
    join(dirname(options.outputPath), '.editor-'),
  );
  try {
    const finalDimensions = getExportDimensions(
      timeline.format,
      timeline.resolution,
    );
    const previewScale = options.preview ? 360 / timeline.resolution : 1;
    const width = Math.round((finalDimensions.width * previewScale) / 2) * 2;
    const height = Math.round((finalDimensions.height * previewScale) / 2) * 2;
    const margin = 24 * previewScale;
    const duration = editorDuration(timeline);
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
    ];
    const filters: string[] = [];
    timeline.clips.forEach((clip, index) => {
      const length = clip.endSeconds - clip.startSeconds;
      args.push(
        '-ss',
        String(clip.startSeconds),
        '-t',
        String(length),
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        options.clipPaths[index],
      );
      filters.push(
        `[${index}:v]trim=duration=${length},setpts=PTS-STARTPTS,fps=24,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,format=yuv420p,settb=AVTB[v${index}]`,
      );
      filters.push(
        sources[index].audio
          ? `[${index}:a]atrim=duration=${length},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${length}[a${index}]`
          : `anullsrc=r=48000:cl=stereo,atrim=duration=${length},asetpts=PTS-STARTPTS[a${index}]`,
      );
    });
    let video = 'v0',
      audio = 'a0';
    if (timeline.clips.length > 1 && timeline.transition === 'cut') {
      filters.push(
        `${timeline.clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${timeline.clips.length}:v=1:a=1[assembled][assembled-audio]`,
      );
      video = 'assembled';
      audio = 'assembled-audio';
    } else if (timeline.clips.length > 1) {
      let elapsed =
        timeline.clips[0].endSeconds - timeline.clips[0].startSeconds;
      for (let i = 1; i < timeline.clips.length; i++) {
        const nextVideo = `fade${i}`,
          nextAudio = `audio-fade${i}`;
        filters.push(
          `[${video}][v${i}]xfade=transition=fade:duration=${EDITOR_FADE_SECONDS}:offset=${Math.round((elapsed - EDITOR_FADE_SECONDS) * 1000) / 1000}[${nextVideo}]`,
        );
        filters.push(
          `[${audio}][a${i}]acrossfade=d=${EDITOR_FADE_SECONDS}:c1=tri:c2=tri[${nextAudio}]`,
        );
        video = nextVideo;
        audio = nextAudio;
        elapsed +=
          timeline.clips[i].endSeconds -
          timeline.clips[i].startSeconds -
          EDITOR_FADE_SECONDS;
      }
    }
    let inputIndex = timeline.clips.length;
    if (timeline.musicMediaId) {
      args.push(
        '-stream_loop',
        '-1',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        options.musicPath!,
      );
      filters.push(
        `[${inputIndex}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${timeline.musicVolume}[music]`,
      );
      filters.push(
        `[${audio}][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[mixed-audio]`,
      );
      audio = 'mixed-audio';
      inputIndex++;
    }
    if (options.logo) {
      args.push(
        '-loop',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        options.logo.path,
      );
      const positions: Record<LogoPosition, string> = {
        'top-left': `${margin}:${margin}`,
        'top-right': `W-w-${margin}:${margin}`,
        'bottom-left': `${margin}:H-h-${margin}`,
        'bottom-right': `W-w-${margin}:H-h-${margin}`,
        center: '(W-w)/2:(H-h)/2',
      };
      const timing = getLogoTimingWindow(duration, timeline.logoTiming, 0.35);
      filters.push(
        `[${inputIndex}:v]scale=${Math.round((width * timeline.logoSize) / 100 / 2) * 2}:-2,format=rgba,colorchannelmixer=aa=${timeline.logoOpacity}${timeline.logoFade ? `,fade=t=in:st=${timing.start}:d=${timing.fadeSeconds}:alpha=1,fade=t=out:st=${timing.end - timing.fadeSeconds}:d=${timing.fadeSeconds}:alpha=1` : ''}[editor-logo]`,
      );
      filters.push(
        `[${video}][editor-logo]overlay=${positions[timeline.logoPosition]}:shortest=1:enable='between(t,${timing.start},${timing.end})'[branded]`,
      );
      video = 'branded';
    }
    if (timeline.captions.length) await prepareFont(directory);
    for (let i = 0; i < timeline.captions.length; i++) {
      const caption = timeline.captions[i];
      // Text stays UTF-8 data, including apostrophes, colons and percent signs.
      await writeFile(join(directory, `caption-${i}.txt`), caption.text, {
        mode: 0o600,
        flag: 'wx',
      });
      const y =
        caption.position === 'top'
          ? String(margin)
          : caption.position === 'center'
            ? '(h-text_h)/2'
            : `h-text_h-${margin}`;
      const fontSize = Math.max(
        1,
        Math.max(
          24,
          Math.min(120, Math.round(finalDimensions.height * 0.035)),
        ) * previewScale,
      );
      filters.push(
        `[${video}]drawtext=fontfile=caption-font.ttf:textfile=caption-${i}.txt:expansion=none:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=${12 * previewScale}:x=(w-text_w)/2:y=${y}:enable='between(t,${caption.startSeconds},${caption.endSeconds})'[caption${i}]`,
      );
      video = `caption${i}`;
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
      '24',
      '-c:v',
      outputCodec === 'h265' ? 'libx265' : 'libx264',
      '-threads',
      '2',
      '-preset',
      'veryfast',
      '-crf',
      String(outputQuality),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
    );
    if (outputCodec === 'h265')
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
    await run(
      ffmpegPath(),
      args,
      directory,
      options.preview
        ? 180_000
        : timeline.resolution === 2160
          ? 900_000
          : 600_000,
    );
    const output = await probeMedia(options.outputPath);
    const bytes = (await stat(options.outputPath)).size;
    if (
      !output.durationSeconds ||
      Math.abs(output.durationSeconds - duration) > 0.2 ||
      bytes >= 256 * 1024 * 1024
    )
      throw new EditorError('EDITOR_RENDER_INCOMPLETE', 503);
    await run(
      ffmpegPath(),
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-n',
        '-threads',
        '2',
        '-protocol_whitelist',
        'file,pipe',
        '-ss',
        String(Math.min(0.5, duration / 2)),
        '-i',
        options.outputPath,
        '-frames:v',
        '1',
        '-threads',
        '2',
        '-q:v',
        '2',
        options.coverPath,
      ],
      directory,
    );
    const coverBytes = (await stat(options.coverPath)).size;
    return {
      width: output.width,
      height: output.height,
      durationSeconds: output.durationSeconds,
      bytes,
      coverBytes,
      codec: outputCodec,
      aiUpscaling: false as const,
      upscaled: sources.some(
        (source) =>
          width > (source.width ?? width) || height > (source.height ?? height),
      ),
      sourceKind: options.preview
        ? ('editor-preview' as const)
        : ('editor' as const),
    };
  } catch (error) {
    await Promise.all(
      [options.outputPath, options.coverPath].map((path) =>
        unlink(path).catch(() => undefined),
      ),
    );
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
