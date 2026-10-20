import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Media } from '@prisma/client';
import { AUDIO_LIMIT, sniffAudio, validateAudioFile } from './media-audio';
import { rasterizeSvgLogo } from './svg-logo';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/http';
import { probeMedia } from '@/lib/export';

export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const VIDEO_LIMIT = 100 * 1024 * 1024;
export function storageRoot() {
  return path.resolve(
    process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'),
  );
}
export function resolveMediaPath(relativePath: string) {
  const root = storageRoot();
  const resolved = path.resolve(root, relativePath);
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    !resolved.startsWith(root + path.sep)
  )
    throw new ApiError(400, 'INVALID_MEDIA_PATH');
  return resolved;
}
export function publicMedia(media: Media) {
  const { path: _path, ...safe } = media;
  return { ...safe, url: `/api/media/${media.id}` };
}
export async function listMedia() {
  return (await db.media.findMany({ orderBy: { createdAt: 'desc' } })).map(
    publicMedia,
  );
}

export function sniffImage(bytes: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png';
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'jpeg';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

async function parseMultipart(request: Request) {
  const max = VIDEO_LIMIT + 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > max)
    throw new ApiError(413, 'FILE_TOO_LARGE');
  const contentType = request.headers.get('content-type');
  if (!contentType?.startsWith('multipart/form-data;') || !request.body)
    throw new ApiError(400, 'INVALID_UPLOAD');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(413, 'FILE_TOO_LARGE');
      }
      chunks.push(next.value);
    }
    return await new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_UPLOAD');
  }
}

export async function uploadMedia(request: Request) {
  const form = await parseMultipart(request);
  const file = form.get('file');
  const role = form.get('role') || 'SOURCE';
  const projectId = form.get('projectId') || null;
  if (!(file instanceof File) || !file.size)
    throw new ApiError(400, 'FILE_REQUIRED');
  if (role !== 'SOURCE' && role !== 'LOGO')
    throw new ApiError(400, 'INVALID_MEDIA_ROLE');
  if (
    projectId !== null &&
    (typeof projectId !== 'string' ||
      !(await db.project.findUnique({ where: { id: projectId } })))
  )
    throw new ApiError(400, 'PROJECT_NOT_FOUND');
  if (file.size > VIDEO_LIMIT) throw new ApiError(413, 'FILE_TOO_LARGE');
  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  const svgDeclared =
    file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (svgDeclared) {
    if (role !== 'LOGO') throw new ApiError(400, 'SVG_LOGO_ONLY');
    bytes = await rasterizeSvgLogo(bytes);
  }
  const imageFormat = sniffImage(bytes);
  const audioFormat = sniffAudio(bytes, file.name);
  let mimeType: string;
  let extension: string;
  let width: number | undefined;
  let height: number | undefined;
  if (imageFormat) {
    if (file.size > IMAGE_LIMIT)
      throw new ApiError(
        413,
        'IMAGE_TOO_LARGE',
        'Une image ne doit pas dépasser 5 Mo.',
      );
    try {
      const image = sharp(bytes, {
        limitInputPixels: 40_000_000,
        animated: false,
      }).rotate();
      const output = await image.toBuffer({ resolveWithObject: true });
      width = output.info.width;
      height = output.info.height;
      bytes = output.data;
      if (bytes.length > IMAGE_LIMIT)
        throw new ApiError(413, 'IMAGE_TOO_LARGE');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        400,
        'INVALID_IMAGE',
        'Le fichier image est endommagé ou trop volumineux.',
      );
    }
    mimeType = `image/${imageFormat}`;
    extension = imageFormat === 'jpeg' ? 'jpg' : imageFormat;
  } else if (audioFormat) {
    if (role === 'LOGO') throw new ApiError(400, 'LOGO_IMAGE_REQUIRED');
    if (file.size > AUDIO_LIMIT) throw new ApiError(413, 'AUDIO_TOO_LARGE');
    mimeType = audioFormat.mimeType;
    extension = audioFormat.extension;
  } else if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    if (role === 'LOGO') throw new ApiError(400, 'LOGO_IMAGE_REQUIRED');
    // ISO Base Media File Format; the exact codec and duration are probed before use by FFmpeg.
    const brand = bytes.toString('ascii', 8, 12);
    if (
      ![
        'isom',
        'iso2',
        'mp41',
        'mp42',
        'avc1',
        'M4V ',
        'qt  ',
        'MSNV',
        'dash',
      ].includes(brand)
    )
      throw new ApiError(400, 'UNSUPPORTED_MEDIA');
    mimeType = 'video/mp4';
    extension = 'mp4';
  } else {
    throw new ApiError(
      400,
      'UNSUPPORTED_MEDIA',
      'Formats acceptés : PNG, JPG, WebP, MP4, MP3, WAV et M4A.',
    );
  }
  const relativePath = `media/${randomUUID()}.${extension}`;
  await mkdir(path.join(storageRoot(), 'media'), {
    recursive: true,
    mode: 0o700,
  });
  const filePath = resolveMediaPath(relativePath);
  await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
  try {
    let duration: number | undefined;
    if (mimeType.startsWith('audio/')) {
      duration = (await validateAudioFile(filePath)).duration;
    } else if (mimeType === 'video/mp4') {
      try {
        const details = await probeMedia(filePath);
        width = details.width;
        height = details.height;
        duration = details.durationSeconds;
        if (!duration || duration <= 0) throw new Error('Invalid duration');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'FFMPEG_UNAVAILABLE'
        )
          throw error;
        throw new ApiError(400, 'INVALID_VIDEO');
      }
    }
    const media = await db.media.create({
      data: {
        name:
          (svgDeclared ? file.name.replace(/\.svg$/i, '') + '.png' : file.name)
            .replace(/[\x00-\x1f\x7f]/g, '')
            .slice(0, 200) || `media.${extension}`,
        path: relativePath,
        mimeType,
        size: bytes.length,
        width,
        height,
        duration,
        role,
        projectId,
      },
    });
    return publicMedia(media);
  } catch (error) {
    await unlink(filePath).catch(() => {});
    throw error;
  }
}

export async function deleteMedia(id: string) {
  const deletedPath = await db.$transaction(async (tx) => {
    const media = await tx.media.findUnique({ where: { id } });
    if (!media) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const referencedJob = await tx.job.findFirst({
      where: { OR: [{ sourceMediaId: id }, { outputMediaId: id }] },
    });
    if (referencedJob) throw new ApiError(409, 'MEDIA_IN_USE');
    if (await tx.brandPreset.findFirst({ where: { logoMediaId: id } }))
      throw new ApiError(409, 'MEDIA_IN_USE');
    if (await tx.mannequin.findFirst({ where: { referenceMediaId: id } }))
      throw new ApiError(409, 'MEDIA_IN_USE');
    const looks = await tx.look.findMany({
      where: {
        OR: [{ outputMediaId: id }, { garmentMediaIds: { contains: id } }],
      },
    });
    for (const look of looks) {
      if (
        look.outputMediaId === id ||
        (JSON.parse(look.garmentMediaIds) as string[]).includes(id)
      )
        throw new ApiError(409, 'MEDIA_IN_USE');
    }

    const jobCandidates = await tx.job.findMany({
      where: { parameters: { contains: id } },
      select: { parameters: true, status: true },
    });
    const projectCandidates = await tx.project.findMany({
      where: { parameters: { contains: id } },
      select: { parameters: true },
    });
    function references(value: unknown): boolean {
      if (value === id) return true;
      if (Array.isArray(value)) return value.some(references);
      return Boolean(
        value &&
        typeof value === 'object' &&
        Object.values(value).some(references),
      );
    }
    for (const job of [...jobCandidates, ...projectCandidates]) {
      try {
        if (references(JSON.parse(job.parameters)))
          throw new ApiError(409, 'MEDIA_IN_USE');
      } catch (error) {
        if (error instanceof ApiError) throw error;
      }
    }
    await tx.settings.updateMany({
      where: { activeLogoId: id },
      data: { activeLogoId: null },
    });
    await tx.media.delete({ where: { id } });
    return (await tx.media.count({ where: { path: media.path } }))
      ? null
      : media.path;
  });
  if (deletedPath) await unlink(resolveMediaPath(deletedPath)).catch(() => {});
}
