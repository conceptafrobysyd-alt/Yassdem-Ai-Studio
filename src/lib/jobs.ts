import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job, Prisma } from '@prisma/client';
import { db } from './db';
import { resolveMediaPath, storageRoot } from './media';
import {
  checkExportSupport,
  createLocalAnimation,
  exportVideo,
  getExportDimensions,
  probeMedia,
} from './export';
import type {
  ExportLogo,
  LogoPosition,
  VideoCodec,
  VideoFormat,
  VideoResolution,
} from './export';
import {
  downloadRunwayVideo,
  estimateRunwayCost,
  ProviderError,
  RUNWAY_MODEL,
  RunwayProvider,
} from './providers/runway';
import type { RunwayDuration, RunwayRatio } from './providers/runway';

export class JobError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
    this.name = 'JobError';
  }
}

export interface EnqueueInput {
  projectId: string;
  sourceMediaId: string;
  provider: 'local' | 'runway';
  kind?: 'generation' | 'export';
  prompt?: string;
  durationSeconds: RunwayDuration | 15;
  format: VideoFormat;
  resolution: VideoResolution;
  codec?: VideoCodec;
  logoId?: string | null;
  logoSize?: number;
  logoOpacity?: number;
  logoPosition?: LogoPosition;
  logoFade?: boolean;
  confirmedPaid?: boolean;
  expectedCostCents?: number;
  idempotencyKey: string;
}

interface Parameters {
  durationSeconds: RunwayDuration | 15;
  format: VideoFormat;
  resolution: VideoResolution;
  codec: VideoCodec;
  logoId: string | null;
  logoSize: number;
  logoOpacity: number;
  logoPosition: LogoPosition;
  logoFade: boolean;
  expectedCostCents: number;
  usdToEur: number;
  model: string;
  sourceKind: 'local-animation' | 'runway' | 'export';
  nativeMediaId?: string;
  nativeWidth?: number;
  nativeHeight?: number;
  exportWidth?: number;
  exportHeight?: number;
  upscaled?: boolean;
  aiUpscaling?: boolean;
}

export const ACTIVE_JOB_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'SUBMITTING',
  'RUNNING',
  'EXPORTING',
];
const terminalStatuses = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'];
const monthNow = () => new Date().toISOString().slice(0, 7);
type Transaction = Prisma.TransactionClient;

async function totals(tx: Transaction, month: string) {
  const sums = await tx.job.aggregate({
    where: { budgetMonth: month },
    _sum: { reservedCents: true, actualCostCents: true },
  });
  const reservedCents = sums._sum.reservedCents ?? 0;
  const actualCostCents = sums._sum.actualCostCents ?? 0;
  return {
    reservedCents,
    actualCostCents,
    committedCents: reservedCents + actualCostCents,
  };
}

export async function getBudget() {
  return db.$transaction(async (tx) => {
    const settings = await tx.settings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
    const month = monthNow();
    const result = await totals(tx, month);
    return {
      month,
      monthlyBudgetCents: settings.monthlyBudgetCents,
      ...result,
      remainingCents: Math.max(
        0,
        settings.monthlyBudgetCents - result.committedCents,
      ),
      usdToEur: settings.usdToEur,
    };
  });
}

function validateInput(input: EnqueueInput) {
  if (
    !input ||
    !['local', 'runway'].includes(input.provider) ||
    ![undefined, 'generation', 'export'].includes(input.kind)
  )
    throw new JobError('INVALID_PROVIDER');
  for (const key of ['projectId', 'sourceMediaId', 'idempotencyKey'] as const) {
    if (
      typeof input[key] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(input[key])
    )
      throw new JobError('INVALID_INPUT');
  }
  if (
    !(input.provider === 'runway' ? [5, 10] : [5, 10, 15]).includes(
      input.durationSeconds,
    )
  )
    throw new JobError('INVALID_DURATION');
  getExportDimensions(input.format, input.resolution);
  if (input.codec !== undefined && !['h264', 'h265'].includes(input.codec))
    throw new JobError('INVALID_CODEC');
  if (
    input.prompt !== undefined &&
    (typeof input.prompt !== 'string' || input.prompt.length > 1000)
  )
    throw new JobError('INVALID_PROMPT');
  if (input.provider === 'runway' && !input.prompt?.trim())
    throw new JobError('INVALID_PROMPT');
  if (
    input.logoSize !== undefined &&
    (!Number.isFinite(input.logoSize) ||
      input.logoSize < 3 ||
      input.logoSize > 50)
  )
    throw new JobError('INVALID_LOGO_SETTINGS');
  if (
    input.logoOpacity !== undefined &&
    (!Number.isFinite(input.logoOpacity) ||
      input.logoOpacity < 0 ||
      input.logoOpacity > 1)
  )
    throw new JobError('INVALID_LOGO_SETTINGS');
  if (
    input.logoPosition !== undefined &&
    ![
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'center',
    ].includes(input.logoPosition)
  )
    throw new JobError('INVALID_LOGO_SETTINGS');
  if (input.logoFade !== undefined && typeof input.logoFade !== 'boolean')
    throw new JobError('INVALID_LOGO_SETTINGS');
  if (
    input.logoId !== undefined &&
    input.logoId !== null &&
    (typeof input.logoId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.logoId))
  )
    throw new JobError('INVALID_LOGO');
  if (input.kind === 'export' && input.provider !== 'local')
    throw new JobError('INVALID_PROVIDER');
}

/** Queueing reserves the entire estimate atomically. This function makes no paid request. */
export async function enqueueJob(input: EnqueueInput) {
  validateInput(input);
  return db.$transaction(async (tx) => {
    const existing = await tx.job.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    const settings = await tx.settings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
    if (!(await tx.project.findUnique({ where: { id: input.projectId } })))
      throw new JobError('PROJECT_NOT_FOUND', 404);
    const source = await tx.media.findUnique({
      where: { id: input.sourceMediaId },
    });
    if (
      !source ||
      (input.kind === 'export'
        ? source.mimeType !== 'video/mp4'
        : !['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType))
    ) {
      throw new JobError('INVALID_SOURCE_IMAGE');
    }
    if (
      input.logoId &&
      !(await tx.media.findFirst({
        where: {
          id: input.logoId,
          role: 'LOGO',
          mimeType: { startsWith: 'image/' },
        },
      }))
    )
      throw new JobError('INVALID_LOGO');
    const cost =
      input.provider === 'runway'
        ? estimateRunwayCost(
            input.durationSeconds as RunwayDuration,
            settings.usdToEur,
          ).eurCents
        : 0;
    const month = monthNow();
    if (input.provider === 'runway') {
      if (source.size > 5 * 1024 * 1024) throw new JobError('IMAGE_TOO_LARGE');
      if (!new RunwayProvider().configured)
        throw new JobError('RUNWAY_NOT_CONFIGURED');
      if (!settings.providerEnabled) throw new JobError('PROVIDER_DISABLED');
      if (input.confirmedPaid !== true)
        throw new JobError('PAID_CONFIRMATION_REQUIRED');
      if (input.expectedCostCents !== cost)
        throw new JobError('PRICE_CHANGED', 409);
      const budget = await totals(tx, month);
      if (
        settings.monthlyBudgetCents <= 0 ||
        budget.committedCents + cost > settings.monthlyBudgetCents
      )
        throw new JobError('BUDGET_EXCEEDED');
    }
    const parameters: Parameters = {
      durationSeconds: input.durationSeconds,
      format: input.format,
      resolution: input.resolution,
      codec: input.codec ?? 'h264',
      logoId: input.logoId ?? null,
      logoSize: input.logoSize ?? settings.logoSize,
      logoOpacity: input.logoOpacity ?? settings.logoOpacity,
      logoPosition:
        input.logoPosition ?? (settings.logoPosition as LogoPosition),
      logoFade: input.logoFade ?? false,
      expectedCostCents: cost,
      usdToEur: settings.usdToEur,
      model: input.provider === 'runway' ? RUNWAY_MODEL : 'ffmpeg',
      sourceKind:
        input.kind === 'export'
          ? 'export'
          : input.provider === 'runway'
            ? 'runway'
            : 'local-animation',
    };
    return tx.job.create({
      data: {
        projectId: input.projectId,
        sourceMediaId: input.sourceMediaId,
        provider: input.provider,
        kind: input.kind ?? 'generation',
        prompt: input.prompt?.trim() ?? '',
        parameters: JSON.stringify(parameters),
        budgetMonth: month,
        estimatedCostCents: cost,
        reservedCents: cost,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

/** Only use a cost verified from the provider's billing record, including a verified refund. */
export async function reconcileJobCost(id: string, actualCostCents: number) {
  if (
    !Number.isSafeInteger(actualCostCents) ||
    actualCostCents < 0 ||
    actualCostCents > 100_000_000
  )
    throw new JobError('INVALID_COST');
  const job = await db.job.findUnique({ where: { id } });
  if (!job || !job.providerRequested || !terminalStatuses.includes(job.status))
    throw new JobError('JOB_NOT_RECONCILABLE', 409);
  return db.job.update({
    where: { id },
    data: { actualCostCents, reservedCents: 0 },
  });
}

export async function cancelJob(id: string) {
  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new JobError('JOB_NOT_FOUND', 404);
  if (terminalStatuses.includes(job.status)) return job;
  if (job.providerRequested && !job.providerTaskId)
    throw new JobError('JOB_SUBMITTING', 409);
  if (job.providerTaskId)
    await new RunwayProvider().cancelTask(job.providerTaskId);
  const result = await db.job.updateMany({
    where: { id, status: job.status },
    data: {
      status: 'CANCELLED',
      errorCode: null,
      reservedCents: job.providerRequested ? job.reservedCents : 0,
    },
  });
  if (!result.count) throw new JobError('JOB_STATE_CHANGED', 409);
  return db.job.findUniqueOrThrow({ where: { id } });
}

function params(job: Job): Parameters {
  try {
    return JSON.parse(job.parameters) as Parameters;
  } catch {
    throw new JobError('INVALID_JOB_PARAMETERS');
  }
}

async function logoFor(
  parameters: Parameters,
): Promise<ExportLogo | undefined> {
  if (!parameters.logoId) return undefined;
  const media = await db.media.findUnique({ where: { id: parameters.logoId } });
  if (!media || media.role !== 'LOGO') throw new JobError('LOGO_NOT_FOUND');
  return {
    path: resolveMediaPath(media.path),
    sizePercent: parameters.logoSize,
    opacity: parameters.logoOpacity,
    position: parameters.logoPosition,
    fade: parameters.logoFade,
  };
}

function codeFor(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code
    : 'JOB_FAILED';
}

async function failed(job: Job, error: unknown) {
  await db.job.updateMany({
    where: { id: job.id, status: { notIn: ['CANCELLED', 'SUCCEEDED'] } },
    data: {
      status:
        job.providerRequested && !job.providerTaskId ? 'UNKNOWN' : 'FAILED',
      errorCode: codeFor(error),
      ...(job.providerRequested ? {} : { reservedCents: 0 }),
    },
  });
}

async function submit(job: Job) {
  const p = params(job);
  const source = await db.media.findUnique({
    where: { id: job.sourceMediaId },
  });
  if (
    !source ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType)
  )
    throw new JobError('SOURCE_NOT_FOUND');
  const bytes = await readFile(resolveMediaPath(source.path));
  if (bytes.length > 5 * 1024 * 1024) throw new JobError('IMAGE_TOO_LARGE');
  const logo = await logoFor(p);
  if (logo && !(await stat(logo.path).catch(() => null))?.isFile())
    throw new JobError('LOGO_NOT_FOUND');
  await checkExportSupport(p.codec);
  const provider = new RunwayProvider();
  if (!provider.configured) throw new JobError('RUNWAY_NOT_CONFIGURED');
  // This transaction commits before POST. Any unknown outcome is held for manual recovery.
  await db.$transaction(async (tx) => {
    const settings = await tx.settings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    if (!settings.providerEnabled) throw new JobError('PROVIDER_DISABLED');
    const cost = estimateRunwayCost(
      p.durationSeconds as RunwayDuration,
      settings.usdToEur,
    ).eurCents;
    if (p.expectedCostCents !== cost) throw new JobError('PRICE_CHANGED', 409);
    const month = monthNow();
    const budget = await totals(tx, month);
    const additional = job.budgetMonth === month ? 0 : job.reservedCents;
    if (
      settings.monthlyBudgetCents <= 0 ||
      budget.committedCents + additional > settings.monthlyBudgetCents
    )
      throw new JobError('BUDGET_EXCEEDED');
    const claimed = await tx.job.updateMany({
      where: { id: job.id, status: 'PROCESSING', providerRequested: false },
      data: {
        providerRequested: true,
        status: 'SUBMITTING',
        budgetMonth: month,
        progress: 10,
      },
    });
    if (!claimed.count) throw new JobError('JOB_STATE_CHANGED', 409);
  });
  try {
    const ratio: RunwayRatio =
      p.format === '16:9'
        ? '1280:720'
        : p.format === '1:1'
          ? '960:960'
          : '720:1280';
    const task = await provider.createVideo({
      imageDataUri: `data:${source.mimeType};base64,${bytes.toString('base64')}`,
      prompt: job.prompt,
      durationSeconds: p.durationSeconds as RunwayDuration,
      ratio,
    });
    await db.job.update({
      where: { id: job.id },
      data: {
        providerTaskId: task.id,
        status: 'RUNNING',
        progress: 15,
        errorCode: null,
      },
    });
  } catch (error) {
    await db.job.update({
      where: { id: job.id },
      data: { status: 'UNKNOWN', errorCode: codeFor(error) },
    });
  }
}

async function finishExport(job: Job, inputMediaId?: string) {
  const p = params(job);
  const source = await db.media.findUnique({
    where: { id: inputMediaId ?? job.sourceMediaId },
  });
  if (!source) throw new JobError('SOURCE_NOT_FOUND');
  await mkdir(join(storageRoot(), 'media'), { recursive: true, mode: 0o700 });
  const relativePath = `media/${job.id}-export.mp4`;
  const outputPath = resolveMediaPath(relativePath);
  // This name is reserved for this job. An interrupted uncommitted export is disposable.
  if (!(await db.media.findFirst({ where: { path: relativePath } })))
    await unlink(outputPath).catch(() => undefined);
  const options = {
    outputPath,
    durationSeconds: p.durationSeconds,
    format: p.format,
    resolution: p.resolution,
    codec: p.codec,
    logo: await logoFor(p),
  };
  const result =
    job.provider === 'local' && job.kind !== 'export'
      ? await createLocalAnimation({
          ...options,
          imagePath: resolveMediaPath(source.path),
        })
      : await exportVideo({
          ...options,
          inputPath: resolveMediaPath(source.path),
        });
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
      if (current.status === 'CANCELLED') throw new JobError('JOB_CANCELLED');
      const media = await tx.media.create({
        data: {
          name: `${job.provider === 'local' && job.kind !== 'export' ? 'local-animation' : 'export'}-${job.id}.mp4`,
          path: relativePath,
          mimeType: 'video/mp4',
          size: result.bytes,
          width: result.width,
          height: result.height,
          duration: result.durationSeconds,
          role:
            job.kind === 'export' || job.provider === 'runway'
              ? 'EXPORT'
              : 'GENERATED',
          projectId: job.projectId,
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          progress: 100,
          outputMediaId: media.id,
          errorCode: null,
          parameters: JSON.stringify({
            ...p,
            nativeWidth: p.nativeWidth ?? result.nativeWidth,
            nativeHeight: p.nativeHeight ?? result.nativeHeight,
            exportWidth: result.width,
            exportHeight: result.height,
            upscaled: result.upscaled,
            aiUpscaling: false,
          }),
        },
      });
    });
  } catch (error) {
    await unlink(outputPath).catch(() => undefined);
    throw error;
  }
}

async function poll(job: Job) {
  // The official API asks consumers to wait at least five seconds per task.
  if (Date.now() - job.updatedAt.getTime() < 5_000) return;
  const provider = new RunwayProvider();
  let task;
  try {
    task = await provider.getTask(job.providerTaskId!);
  } catch (error) {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: { errorCode: codeFor(error) },
    });
    return;
  }
  const p = params(job);
  const billed =
    task.costCredits === undefined ||
    !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(task.status)
      ? {}
      : {
          actualCostCents: Math.ceil(task.costCredits * (p.usdToEur ?? 1)),
          reservedCents: 0,
        };
  if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        status: task.status,
        errorCode: task.failureCode ?? null,
        ...billed,
      },
    });
    return;
  }
  if (task.status !== 'SUCCEEDED') {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        progress: Math.min(65, 15 + Math.round((task.progress ?? 0) * 50)),
        errorCode: null,
      },
    });
    return;
  }
  if (!task.output?.[0]) throw new ProviderError('RUNWAY_MISSING_OUTPUT');
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: 'RUNNING' },
    data: { status: 'EXPORTING', progress: 70, ...billed },
  });
  if (!claimed.count) return;
  let nativeId = p.nativeMediaId;
  if (!nativeId || !(await db.media.findUnique({ where: { id: nativeId } }))) {
    await mkdir(join(storageRoot(), 'media'), { recursive: true, mode: 0o700 });
    const relativePath = `media/${job.id}-native.mp4`;
    const destination = resolveMediaPath(relativePath);
    if (!(await db.media.findFirst({ where: { path: relativePath } })))
      await unlink(destination).catch(() => undefined);
    try {
      const artifact = await downloadRunwayVideo(task.output[0], destination);
      const native = await probeMedia(destination);
      const nativeMedia = await db.$transaction(async (tx) => {
        const media = await tx.media.create({
          data: {
            name: `runway-native-${job.id}.mp4`,
            path: relativePath,
            mimeType: 'video/mp4',
            size: artifact.bytes,
            width: native.width,
            height: native.height,
            duration: native.durationSeconds,
            role: 'GENERATED',
            projectId: job.projectId,
          },
        });
        await tx.job.update({
          where: { id: job.id },
          data: {
            parameters: JSON.stringify({
              ...p,
              nativeMediaId: media.id,
              nativeWidth: native.width,
              nativeHeight: native.height,
            }),
          },
        });
        return media;
      });
      nativeId = nativeMedia.id;
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }
  await finishExport(
    await db.job.findUniqueOrThrow({ where: { id: job.id } }),
    nativeId,
  );
}

let processing = false;
let recovered = false;

/** A separate worker calls this repeatedly; requests never start background timers. */
export async function processPendingJobs() {
  if (processing) return;
  processing = true;
  try {
    if (!recovered) {
      // Never repeat a POST after a crash: a missing task ID means an unknown charge.
      await db.job.updateMany({
        where: {
          providerRequested: true,
          providerTaskId: null,
          status: { in: ['PROCESSING', 'SUBMITTING'] },
        },
        data: { status: 'UNKNOWN', errorCode: 'RUNWAY_SUBMISSION_UNKNOWN' },
      });
      await db.job.updateMany({
        where: { providerRequested: false, status: 'PROCESSING' },
        data: { status: 'QUEUED', progress: 0 },
      });
      await db.job.updateMany({
        where: { providerTaskId: { not: null }, status: 'EXPORTING' },
        data: { status: 'RUNNING' },
      });
      recovered = true;
    }
    const jobs = await db.job.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING'] } },
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
        if (job.provider === 'runway') await submit(job);
        else await finishExport(job);
      } catch (error) {
        const current = await db.job.findUnique({ where: { id: job.id } });
        if (current) await failed(current, error);
      }
    }
  } finally {
    processing = false;
  }
}
