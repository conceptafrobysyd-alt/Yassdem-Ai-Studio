import { constants } from 'node:fs';
import { mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { db } from './db';
import { ApiError } from './http';
import {
  publicMedia,
  resolveMediaPath,
  sniffImage,
  storageRoot,
} from './media';

export type ImageExportFormat = 'png' | 'jpeg' | 'webp';
export type ImageExportRatio = 'original' | '9:16' | '4:5' | '1:1' | '16:9';
export type ImageLogoPosition =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type ImageExportOptions = {
  format: ImageExportFormat;
  resolution: 'native' | '4k';
  ratio: ImageExportRatio;
  quality: number;
  logoId: string | null;
  logoSize: number;
  logoOpacity: number;
  logoPosition: ImageLogoPosition;
  projectId: string | null;
};
export type ImageExportMetadata = {
  nativeWidth: number;
  nativeHeight: number;
  width: number;
  height: number;
  upscaled: boolean;
  aiUpscaling: false;
  sourceKind: 'raster-export';
  costCents: 0;
};
const PIXEL_LIMIT = 40_000_000;
const INPUT_LIMIT = 20 * 1024 * 1024;
const OUTPUT_LIMIT = 50 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const formats = ['png', 'jpeg', 'webp'];
const ratios = ['original', '9:16', '4:5', '1:1', '16:9'];
const positions = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
];
function identifier(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !ID.test(value))
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_OPTIONS');
  return value;
}
export function parseImageExportOptions(
  input: Record<string, unknown>,
): ImageExportOptions {
  const allowed = [
    'format',
    'resolution',
    'ratio',
    'quality',
    'logoId',
    'logoSize',
    'logoOpacity',
    'logoPosition',
    'projectId',
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_OPTIONS');
  const result = {
    format: input.format ?? 'png',
    resolution: input.resolution ?? 'native',
    ratio: input.ratio ?? 'original',
    quality: input.quality ?? 90,
    logoId: identifier(input.logoId),
    logoSize: input.logoSize ?? 15,
    logoOpacity: input.logoOpacity ?? 0.8,
    logoPosition: input.logoPosition ?? 'bottom-right',
    projectId: identifier(input.projectId),
  };
  if (
    !formats.includes(result.format as string) ||
    !['native', '4k'].includes(result.resolution as string) ||
    !ratios.includes(result.ratio as string) ||
    !positions.includes(result.logoPosition as string) ||
    typeof result.quality !== 'number' ||
    !Number.isInteger(result.quality) ||
    result.quality < 1 ||
    result.quality > 100 ||
    typeof result.logoSize !== 'number' ||
    !Number.isFinite(result.logoSize) ||
    result.logoSize < 3 ||
    result.logoSize > 50 ||
    typeof result.logoOpacity !== 'number' ||
    !Number.isFinite(result.logoOpacity) ||
    result.logoOpacity < 0 ||
    result.logoOpacity > 1
  ) {
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_OPTIONS');
  }
  return result as ImageExportOptions;
}

/** 4K uses a 3840px long edge, including portrait and square images. Native
 * exports crop at source density, without silently enlarging small originals. */
export function imageExportDimensions(
  nativeWidth: number,
  nativeHeight: number,
  resolution: 'native' | '4k',
  ratio: ImageExportRatio,
) {
  if (
    !Number.isSafeInteger(nativeWidth) ||
    !Number.isSafeInteger(nativeHeight) ||
    nativeWidth < 1 ||
    nativeHeight < 1 ||
    nativeWidth * nativeHeight > PIXEL_LIMIT
  )
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
  if (resolution === 'native' && ratio === 'original')
    return { width: nativeWidth, height: nativeHeight };
  const desiredRatio =
    ratio === 'original'
      ? nativeWidth / nativeHeight
      : Number(ratio.split(':')[0]) / Number(ratio.split(':')[1]);
  let width: number, height: number;
  if (resolution === '4k') {
    width =
      desiredRatio >= 1 ? 3840 : Math.max(1, Math.round(3840 * desiredRatio));
    height =
      desiredRatio >= 1 ? Math.max(1, Math.round(3840 / desiredRatio)) : 3840;
  } else if (nativeWidth / nativeHeight >= desiredRatio) {
    height = nativeHeight;
    width = Math.max(1, Math.floor(height * desiredRatio));
  } else {
    width = nativeWidth;
    height = Math.max(1, Math.floor(width / desiredRatio));
  }
  if (width * height > PIXEL_LIMIT)
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
  return { width, height };
}

async function readRaster(filePath: string, limit = INPUT_LIMIT) {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > limit)
      throw new ApiError(413, 'IMAGE_EXPORT_IMAGE_TOO_LARGE');
    const bytes = await handle.readFile();
    if (bytes.length > limit || !sniffImage(bytes))
      throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
    return bytes;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
  } finally {
    await handle?.close();
  }
}

/** Decodes actual raster pixels. SVG, remote URLs and metadata-only formats are
 * excluded; PNG/WebP retain transparency and JPEG flattens onto white. */
export async function renderImageExport(
  source: Buffer,
  options: ImageExportOptions,
  logo?: Buffer,
) {
  if (source.length > INPUT_LIMIT || !sniffImage(source))
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
  if (options.logoId && !logo)
    throw new ApiError(400, 'IMAGE_EXPORT_LOGO_NOT_FOUND');
  try {
    const meta = await sharp(source, {
      limitInputPixels: PIXEL_LIMIT,
      animated: false,
    }).metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1)
      throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
    const rotated =
      meta.orientation !== undefined &&
      meta.orientation >= 5 &&
      meta.orientation <= 8;
    const nativeWidth = rotated ? meta.height : meta.width,
      nativeHeight = rotated ? meta.width : meta.height;
    const { width, height } = imageExportDimensions(
      nativeWidth,
      nativeHeight,
      options.resolution,
      options.ratio,
    );
    let pipeline = sharp(source, {
      limitInputPixels: PIXEL_LIMIT,
      animated: false,
    })
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .timeout({ seconds: 30 });
    if (logo) {
      if (logo.length > 5 * 1024 * 1024 || !sniffImage(logo))
        throw new ApiError(400, 'IMAGE_EXPORT_INVALID_LOGO');
      const margin = Math.max(0, Math.round(Math.min(width, height) * 0.025));
      const logoWidth = Math.max(
        1,
        Math.min(
          width - margin * 2,
          Math.round((width * options.logoSize) / 100),
        ),
      );
      const logoHeight = Math.max(1, height - margin * 2);
      const resized = await sharp(logo, {
        limitInputPixels: PIXEL_LIMIT,
        animated: false,
      })
        .rotate()
        .resize(logoWidth, logoHeight, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .timeout({ seconds: 15 })
        .toBuffer({ resolveWithObject: true });
      for (let index = 3; index < resized.data.length; index += 4)
        resized.data[index] = Math.round(
          resized.data[index] * options.logoOpacity,
        );
      const { width: lw, height: lh } = resized.info;
      const left =
        options.logoPosition === 'center'
          ? Math.floor((width - lw) / 2)
          : options.logoPosition.endsWith('left')
            ? margin
            : width - margin - lw;
      const top =
        options.logoPosition === 'center'
          ? Math.floor((height - lh) / 2)
          : options.logoPosition.startsWith('top')
            ? margin
            : height - margin - lh;
      pipeline = pipeline.composite([
        {
          input: resized.data,
          raw: { width: lw, height: lh, channels: 4 },
          left,
          top,
        },
      ]);
    }
    if (options.format === 'jpeg')
      pipeline = pipeline
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: options.quality, mozjpeg: false });
    else if (options.format === 'webp')
      pipeline = pipeline.webp({ quality: options.quality });
    else pipeline = pipeline.png({ compressionLevel: 9 });
    const output = await pipeline.toBuffer();
    if (output.length > OUTPUT_LIMIT)
      throw new ApiError(413, 'IMAGE_EXPORT_OUTPUT_TOO_LARGE');
    const metadata: ImageExportMetadata = {
      nativeWidth,
      nativeHeight,
      width,
      height,
      upscaled: width > nativeWidth || height > nativeHeight,
      aiUpscaling: false,
      sourceKind: 'raster-export',
      costCents: 0,
    };
    return { bytes: output, metadata };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
  }
}

let exporting = false;
export async function exportImage(
  sourceMediaId: string,
  input: Record<string, unknown>,
) {
  if (!ID.test(sourceMediaId))
    throw new ApiError(400, 'IMAGE_EXPORT_INVALID_OPTIONS');
  const options = parseImageExportOptions(input);
  if (exporting) throw new ApiError(429, 'IMAGE_EXPORT_BUSY');
  exporting = true;
  let outputPath: string | undefined;
  try {
    const source = await db.media.findUnique({ where: { id: sourceMediaId } });
    if (
      !source ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType)
    )
      throw new ApiError(400, 'IMAGE_EXPORT_INVALID_IMAGE');
    const projectId = options.projectId ?? source.projectId;
    if (
      projectId &&
      !(await db.project.findUnique({ where: { id: projectId } }))
    )
      throw new ApiError(404, 'PROJECT_NOT_FOUND');
    const logo = options.logoId
      ? await db.media.findUnique({ where: { id: options.logoId } })
      : null;
    if (
      options.logoId &&
      (!logo ||
        logo.role !== 'LOGO' ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType))
    )
      throw new ApiError(400, 'IMAGE_EXPORT_LOGO_NOT_FOUND');
    const rendered = await renderImageExport(
      await readRaster(resolveMediaPath(source.path)),
      options,
      logo
        ? await readRaster(resolveMediaPath(logo.path), 5 * 1024 * 1024)
        : undefined,
    );
    const extension = options.format === 'jpeg' ? 'jpg' : options.format;
    const relativePath = `media/${randomUUID()}-image.${extension}`;
    await mkdir(path.join(storageRoot(), 'media'), {
      recursive: true,
      mode: 0o700,
    });
    outputPath = resolveMediaPath(relativePath);
    await writeFile(outputPath, rendered.bytes, { flag: 'wx', mode: 0o600 });
    const output = await db.$transaction(async (tx) => {
      // Validate references again before committing; source, logo or project may
      // have been removed during the bounded Sharp operation.
      if (
        !(await tx.media.findUnique({ where: { id: sourceMediaId } })) ||
        (logo && !(await tx.media.findUnique({ where: { id: logo.id } })))
      )
        throw new ApiError(409, 'MEDIA_NOT_FOUND');
      const media = await tx.media.create({
        data: {
          name: `${source.name.replace(/\.[^.]+$/, '').slice(0, 150)}-export.${extension}`,
          path: relativePath,
          mimeType: `image/${options.format}`,
          size: rendered.bytes.length,
          width: rendered.metadata.width,
          height: rendered.metadata.height,
          role: 'EXPORT',
          projectId,
        },
      });
      if (projectId) {
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
        });
        let parameters: Record<string, unknown>;
        try {
          const stored = JSON.parse(project.parameters);
          if (!stored || typeof stored !== 'object' || Array.isArray(stored))
            throw new Error();
          parameters = stored;
        } catch {
          throw new ApiError(400, 'IMAGE_EXPORT_INVALID_PROJECT');
        }
        const history = Array.isArray(parameters.imageExports)
          ? parameters.imageExports
          : [];
        if (history.length >= 50)
          throw new ApiError(400, 'IMAGE_EXPORT_PROJECT_TOO_LARGE');
        const merged = JSON.stringify({
          ...parameters,
          imageExports: [
            ...history,
            {
              sourceMediaId,
              outputMediaId: media.id,
              logoId: logo?.id ?? null,
              options,
              ...rendered.metadata,
              createdAt: new Date().toISOString(),
            },
          ],
        });
        if (merged.length > 20000)
          throw new ApiError(400, 'IMAGE_EXPORT_PROJECT_TOO_LARGE');
        await tx.project.update({
          where: { id: projectId },
          data: { parameters: merged },
        });
      }
      return media;
    });
    outputPath = undefined;
    return { media: publicMedia(output), metadata: rendered.metadata };
  } finally {
    if (outputPath) await unlink(outputPath).catch(() => {});
    exporting = false;
  }
}
