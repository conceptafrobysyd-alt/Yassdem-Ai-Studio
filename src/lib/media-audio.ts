import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiError } from './http';
const exec = promisify(execFile);
export const AUDIO_LIMIT = 50 * 1024 * 1024;
export function sniffAudio(
  bytes: Buffer,
  declaredName = '',
): { mimeType: string; extension: string } | null {
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WAVE'
  )
    return { mimeType: 'audio/wav', extension: 'wav' };
  if (
    bytes.length >= 3 &&
    (bytes.toString('ascii', 0, 3) === 'ID3' ||
      (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0))
  )
    return { mimeType: 'audio/mpeg', extension: 'mp3' };
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 4, 8) === 'ftyp' &&
    (['M4A ', 'M4B '].includes(bytes.toString('ascii', 8, 12)) ||
      /\.m4a$/i.test(declaredName))
  )
    return { mimeType: 'audio/mp4', extension: 'm4a' };
  return null;
}
/** Inspect decoded streams; MIME names and signatures alone are insufficient. */
export async function validateAudioFile(filePath: string) {
  let data: {
    streams?: {
      codec_type?: string;
      codec_name?: string;
      disposition?: { attached_pic?: number };
    }[];
    format?: { duration?: string };
  };
  try {
    const result = await exec(
      process.env.FFPROBE_PATH || 'ffprobe',
      [
        '-v',
        'error',
        '-max_alloc',
        '268435456',
        '-protocol_whitelist',
        'file,pipe',
        '-show_entries',
        'stream=codec_type,codec_name:stream_disposition=attached_pic:format=duration',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 15000, maxBuffer: 65536 },
    );
    data = JSON.parse(result.stdout);
  } catch {
    throw new ApiError(400, 'INVALID_AUDIO');
  }
  const streams = data.streams || [];
  const duration = Number(data.format?.duration);
  if (
    !streams.some((stream) => stream.codec_type === 'audio') ||
    streams.some(
      (stream) =>
        stream.codec_type === 'video' && !stream.disposition?.attached_pic,
    ) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 1800
  )
    throw new ApiError(400, 'INVALID_AUDIO');
  return { duration };
}
