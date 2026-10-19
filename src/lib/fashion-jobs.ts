import { randomInt } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job } from '@prisma/client';
import sharp from 'sharp';
import { db } from './db';
import { ApiError } from './http';
import { resolveMediaPath, storageRoot } from './media';
import {
  composeLookCollage,
  DEFAULT_MANNEQUIN,
  getLookRenderContext,
  validateLookParameters,
  validateMannequinParameters,
} from './fashion';
import type { LookParameters, MannequinParameters } from './fashion';
import { ComfyUIProvider, prepareComfyWorkflow } from './providers/comfyui';
import type {
  ComfyMode,
  ComfyWorkflow,
  ComfyWorkflowInput,
} from './providers/comfyui';

export type FashionRenderMode = 'collage' | ComfyMode;
export const FASHION_JOB_KINDS = ['lookbook_sheet', 'fashion_image', 'try_on'];
const ACTIVE = ['QUEUED', 'PROCESSING', 'SUBMITTING', 'RUNNING', 'EXPORTING'];
const IMAGE_LIMIT = 20 * 1024 * 1024;
interface Parameters {
  lookId: string;
  mode: FashionRenderMode;
  garmentMediaIds: string[];
  portraitMediaId: string | null;
  mannequinId: string | null;
  mannequinName: string;
  mannequinDescription: string;
  mannequinParameters: MannequinParameters;
  lookParameters: LookParameters;
  seed: number;
  sourceKind: 'collage' | 'comfyui-fashion-image' | 'comfyui-try-on';
  aiGenerated: boolean;
  width: number;
  height: number;
}
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function errorCode(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : 'FASHION_JOB_FAILED';
}
function parametersFor(job: Job): Parameters {
  try {
    const value = JSON.parse(job.parameters) as Parameters;
    if (
      !identifier(value.lookId) ||
      !['collage', 'fashion-image', 'try-on'].includes(value.mode) ||
      !Array.isArray(value.garmentMediaIds) ||
      value.garmentMediaIds.length < 1 ||
      value.garmentMediaIds.length > 8 ||
      !value.garmentMediaIds.every(identifier) ||
      (value.portraitMediaId !== null && !identifier(value.portraitMediaId))
    )
      throw new Error();
    value.lookParameters = validateLookParameters(value.lookParameters);
    value.mannequinParameters = validateMannequinParameters(
      value.mannequinParameters,
    );
    return value;
  } catch {
    throw new ApiError(400, 'INVALID_JOB_PARAMETERS');
  }
}
function promptFor(p: Parameters) {
  return [
    'Create a fashion editorial photograph using the uploaded garment references. Preserve garment shape, patterns, details and colors.',
    `Look parameters: ${JSON.stringify(p.lookParameters)}`,
    `Model: ${p.mannequinName}. ${p.mannequinDescription}`,
    `Model parameters: ${JSON.stringify(p.mannequinParameters)}`,
    p.mannequinParameters.hijab
      ? 'The model wears a hijab with the requested coverage.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
function workflowInput(
  p: Parameters,
  garmentImages: string[],
  portraitImage?: string,
): ComfyWorkflowInput {
  return {
    prompt: promptFor(p),
    seed: p.seed,
    width: p.width,
    height: p.height,
    garmentImages,
    portraitImage,
    mannequinParameters: {
      ...p.mannequinParameters,
      name: p.mannequinName,
      description: p.mannequinDescription,
    },
  };
}

/** Enqueueing performs no inference. Local GPU generation never calls a paid API. */
export async function enqueueFashionJob(input: {
  lookId: string;
  mode: FashionRenderMode;
  idempotencyKey: string;
}) {
  if (
    !input ||
    !identifier(input.lookId) ||
    !identifier(input.idempotencyKey) ||
    !['collage', 'fashion-image', 'try-on'].includes(input.mode)
  )
    throw new ApiError(400, 'INVALID_INPUT');
  const existing = await db.job.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    const p = parametersFor(existing);
    if (p.lookId !== input.lookId || p.mode !== input.mode)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return existing;
  }
  const context = await getLookRenderContext(input.lookId);
  const parameters: Parameters = {
    lookId: input.lookId,
    mode: input.mode,
    garmentMediaIds: context.garments.map((m) => m.id),
    portraitMediaId: context.reference?.id ?? null,
    mannequinId: context.mannequin?.id ?? null,
    mannequinName: context.mannequin?.name ?? 'Fashion model',
    mannequinDescription: context.mannequin?.description ?? '',
    mannequinParameters: context.mannequinParameters ?? {
      ...DEFAULT_MANNEQUIN,
    },
    lookParameters: context.parameters,
    seed: randomInt(0, 2 ** 31),
    width: 1024,
    height: 1536,
    sourceKind:
      input.mode === 'collage'
        ? 'collage'
        : input.mode === 'try-on'
          ? 'comfyui-try-on'
          : 'comfyui-fashion-image',
    aiGenerated: input.mode !== 'collage',
  };
  if (!parameters.garmentMediaIds.length)
    throw new ApiError(400, 'INVALID_GARMENTS');
  if (input.mode !== 'collage') {
    const provider = new ComfyUIProvider();
    const workflow = await provider.loadWorkflow(input.mode);
    // Fail capabilities before uploading images or creating a job.
    prepareComfyWorkflow(
      workflow,
      workflowInput(
        parameters,
        context.garments.map((_, i) => `garment-${i + 1}.png`),
        context.reference ? 'portrait.png' : undefined,
      ),
    );
    const connection = await provider.checkConnection();
    if (!connection.ok)
      throw new ApiError(503, connection.code ?? 'COMFYUI_UNREACHABLE');
  }
  return db.$transaction(async (tx) => {
    const duplicate = await tx.job.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (duplicate) {
      const p = parametersFor(duplicate);
      if (p.lookId !== input.lookId || p.mode !== input.mode)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
      return duplicate;
    }
    const current = await tx.look.findUnique({ where: { id: input.lookId } });
    if (!current) throw new ApiError(404, 'LOOK_NOT_FOUND');
    if (current.updatedAt.getTime() !== context.look.updatedAt.getTime())
      throw new ApiError(409, 'LOOK_CHANGED');
    const active = await tx.job.findMany({
      where: {
        kind: { in: FASHION_JOB_KINDS },
        status: { in: ACTIVE },
        parameters: { contains: input.lookId },
      },
      select: { parameters: true },
    });
    if (
      active.some((job) => JSON.parse(job.parameters).lookId === input.lookId)
    )
      throw new ApiError(409, 'LOOK_RENDER_ACTIVE');
    return tx.job.create({
      data: {
        projectId: context.look.projectId,
        sourceMediaId: parameters.garmentMediaIds[0],
        provider: input.mode === 'collage' ? 'local' : 'comfyui',
        kind:
          input.mode === 'collage'
            ? 'lookbook_sheet'
            : input.mode === 'try-on'
              ? 'try_on'
              : 'fashion_image',
        prompt: promptFor(parameters),
        parameters: JSON.stringify(parameters),
        budgetMonth: new Date().toISOString().slice(0, 7),
        estimatedCostCents: 0,
        actualCostCents: 0,
        reservedCents: 0,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

async function sourceImage(id: string) {
  const media = await db.media.findUnique({ where: { id } });
  if (
    !media ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType)
  )
    throw new ApiError(409, 'LOOK_MEDIA_MISSING');
  const path = resolveMediaPath(media.path);
  const info = await stat(path);
  if (!info.isFile() || info.size > IMAGE_LIMIT)
    throw new ApiError(400, 'COMFYUI_INVALID_IMAGE');
  const bytes = await readFile(path);
  if (bytes.length > IMAGE_LIMIT)
    throw new ApiError(400, 'COMFYUI_INVALID_IMAGE');
  return { media, bytes };
}
function imageName(job: Job, index: string, mime: string) {
  return `${job.id}-${index}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'}`;
}
async function submit(job: Job) {
  const p = parametersFor(job);
  if (p.mode === 'collage') throw new ApiError(400, 'INVALID_JOB_PARAMETERS');
  const provider = new ComfyUIProvider();
  const workflow: ComfyWorkflow = await provider.loadWorkflow(p.mode);
  const garmentNames: string[] = [];
  // Validate all workflow mappings before the first upload.
  prepareComfyWorkflow(
    workflow,
    workflowInput(
      p,
      p.garmentMediaIds.map((_, i) => `garment-${i}.png`),
      p.portraitMediaId ? 'portrait.png' : undefined,
    ),
  );
  for (let index = 0; index < p.garmentMediaIds.length; index++) {
    const { media, bytes } = await sourceImage(p.garmentMediaIds[index]);
    garmentNames.push(
      await provider.uploadImage(
        bytes,
        media.mimeType,
        imageName(job, `garment-${index + 1}`, media.mimeType),
      ),
    );
  }
  let portrait: string | undefined;
  if (p.portraitMediaId) {
    const { media, bytes } = await sourceImage(p.portraitMediaId);
    portrait = await provider.uploadImage(
      bytes,
      media.mimeType,
      imageName(job, 'portrait', media.mimeType),
    );
  }
  const graph = prepareComfyWorkflow(
    workflow,
    workflowInput(p, garmentNames, portrait),
  );
  // Commit the submission marker before /prompt. A crash cannot resubmit inference.
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: 'PROCESSING', providerRequested: false },
    data: { status: 'SUBMITTING', providerRequested: true, progress: 15 },
  });
  if (!claimed.count) return;
  try {
    const task = await provider.createTask(graph, job.id);
    await db.job.update({
      where: { id: job.id },
      data: {
        providerTaskId: task.id,
        status: 'RUNNING',
        progress: 20,
        errorCode: null,
      },
    });
  } catch (error) {
    await db.job.updateMany({
      where: { id: job.id, status: 'SUBMITTING' },
      data: { status: 'UNKNOWN', errorCode: errorCode(error) },
    });
  }
}

async function saveResult(
  job: Job,
  p: Parameters,
  relativePath: string,
  result: { bytes: number; width: number; height: number },
) {
  return db.$transaction(async (tx) => {
    const current = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
    if (current.status === 'CANCELLED')
      throw new ApiError(409, 'JOB_CANCELLED');
    // A completed transaction is idempotent even if worker bookkeeping is interrupted.
    if (current.status === 'SUCCEEDED') return;
    const media = await tx.media.create({
      data: {
        name: `${p.mode === 'collage' ? 'lookbook-contact-sheet' : p.mode}-${job.id}.png`,
        path: relativePath,
        mimeType: 'image/png',
        size: result.bytes,
        width: result.width,
        height: result.height,
        role: 'GENERATED',
        projectId: job.projectId,
      },
    });
    await tx.look.update({
      where: { id: p.lookId },
      data: { outputMediaId: media.id },
    });
    const project = await tx.project.findUniqueOrThrow({
      where: { id: job.projectId },
    });
    let projectParameters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(project.parameters);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        projectParameters = parsed;
    } catch {
      /* Retain recoverability of older projects. */
    }
    const previous = Array.isArray(projectParameters.fashionResultMediaIds)
      ? projectParameters.fashionResultMediaIds.filter(
          (id): id is string => typeof id === 'string',
        )
      : [];
    const outputs =
      projectParameters.lookOutputMediaIds &&
      typeof projectParameters.lookOutputMediaIds === 'object' &&
      !Array.isArray(projectParameters.lookOutputMediaIds)
        ? projectParameters.lookOutputMediaIds
        : {};
    await tx.project.update({
      where: { id: job.projectId },
      data: {
        parameters: JSON.stringify({
          ...projectParameters,
          fashionResultMediaIds: [...new Set([...previous, media.id])],
          lookOutputMediaIds: { ...outputs, [p.lookId]: media.id },
        }),
      },
    });
    await tx.job.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        progress: 100,
        outputMediaId: media.id,
        errorCode: null,
        actualCostCents: 0,
        reservedCents: 0,
        parameters: JSON.stringify({
          ...p,
          outputWidth: result.width,
          outputHeight: result.height,
        }),
      },
    });
  });
}
async function outputDestination(job: Job) {
  await mkdir(join(storageRoot(), 'media'), { recursive: true, mode: 0o700 });
  const relativePath = `media/${job.id}-fashion.png`;
  const path = resolveMediaPath(relativePath);
  if (!(await db.media.findFirst({ where: { path: relativePath } })))
    await unlink(path).catch(() => undefined);
  return { relativePath, path };
}
async function collage(job: Job) {
  const p = parametersFor(job);
  const { relativePath, path } = await outputDestination(job);
  try {
    await saveResult(
      job,
      p,
      relativePath,
      await composeLookCollage(p.lookId, path),
    );
  } catch (error) {
    await unlink(path).catch(() => undefined);
    throw error;
  }
}
async function poll(job: Job) {
  if (Date.now() - job.updatedAt.getTime() < 2000) return;
  const provider = new ComfyUIProvider();
  let task;
  try {
    task = await provider.getTask(job.providerTaskId!);
  } catch (error) {
    if (
      [
        'COMFYUI_INVALID_OUTPUT',
        'COMFYUI_MISSING_OUTPUT',
        'COMFYUI_TOO_MANY_OUTPUTS',
      ].includes(errorCode(error))
    )
      throw error;
    // Transient service errors retain the task identifier and never resubmit.
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: { errorCode: errorCode(error) },
    });
    return;
  }
  if (task.status === 'FAILED')
    throw new ApiError(502, 'COMFYUI_GENERATION_FAILED');
  if (task.status !== 'SUCCEEDED') {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: { errorCode: null },
    });
    return;
  }
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: 'RUNNING' },
    data: { status: 'EXPORTING', progress: 80 },
  });
  if (!claimed.count) return;
  const p = parametersFor(job);
  const { relativePath, path } = await outputDestination(job);
  try {
    const bytes = await provider.downloadImage(task.images![0]);
    // Decode and re-encode actual provider bytes; reject corrupt images and decompression bombs.
    const image = await sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
    })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (image.data.length > IMAGE_LIMIT)
      throw new ApiError(502, 'COMFYUI_INVALID_OUTPUT');
    await writeFile(path, image.data, { flag: 'wx', mode: 0o600 });
    await saveResult(job, p, relativePath, {
      bytes: image.data.length,
      width: image.info.width,
      height: image.info.height,
    });
  } catch (error) {
    await unlink(path).catch(() => undefined);
    throw error;
  }
}
let processing = false;
let recovered = false;
/** Called sequentially by the existing worker; no timers run in web requests. */
export async function processFashionJobs() {
  if (processing) return;
  processing = true;
  try {
    if (!recovered) {
      await db.job.updateMany({
        where: {
          kind: { in: FASHION_JOB_KINDS },
          providerRequested: true,
          providerTaskId: null,
          status: { in: ['PROCESSING', 'SUBMITTING'] },
        },
        data: { status: 'UNKNOWN', errorCode: 'COMFYUI_SUBMISSION_UNKNOWN' },
      });
      await db.job.updateMany({
        where: {
          kind: { in: FASHION_JOB_KINDS },
          providerRequested: false,
          status: 'PROCESSING',
        },
        data: { status: 'QUEUED', progress: 0 },
      });
      await db.job.updateMany({
        where: {
          kind: { in: FASHION_JOB_KINDS },
          providerTaskId: { not: null },
          status: 'EXPORTING',
        },
        data: { status: 'RUNNING' },
      });
      recovered = true;
    }
    const jobs = await db.job.findMany({
      where: {
        kind: { in: FASHION_JOB_KINDS },
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const job of jobs) {
      try {
        if (job.status === 'RUNNING' && job.providerTaskId) {
          await poll(job);
          continue;
        }
        const claimed = await db.job.updateMany({
          where: { id: job.id, status: 'QUEUED', providerRequested: false },
          data: { status: 'PROCESSING', progress: 5 },
        });
        if (!claimed.count) continue;
        if (job.kind === 'lookbook_sheet') await collage(job);
        else await submit(job);
      } catch (error) {
        const current = await db.job.findUnique({ where: { id: job.id } });
        if (!current || ['SUCCEEDED', 'CANCELLED'].includes(current.status))
          continue;
        await db.job.update({
          where: { id: job.id },
          data: {
            status:
              current.providerRequested && !current.providerTaskId
                ? 'UNKNOWN'
                : 'FAILED',
            errorCode: errorCode(error),
            actualCostCents: 0,
            reservedCents: 0,
          },
        });
      }
    }
  } finally {
    processing = false;
  }
}
