import { mkdir, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job, Prisma, Settings } from '@prisma/client';
import { db } from './db';
import { resolveMediaPath, storageRoot } from './media';
import {
  downloadReplicateArtifact,
  readReplicateConfiguration,
  REPLICATE_ESTIMATE_ASSUMPTION,
  ReplicateError,
  ReplicateProvider,
} from './providers/replicate';
import type { ReplicateConfiguration } from './providers/replicate';

interface ReplicateParameters extends ReplicateConfiguration {
  sourceKind: 'replicate';
  pricingAssumption: string;
  createdMediaIds?: string[];
  providerOutputCount?: number;
  outputSelection?: 'first';
  nativeWidth?: number;
  nativeHeight?: number;
  aiUpscaling?: false;
  upscaled?: false;
}
export interface EnqueueReplicateInput {
  projectId: string;
  sourceMediaId?: string;
  prompt: string;
  confirmedPaid: boolean;
  expectedCostCents: number;
  expectedModelVersion: string;
  idempotencyKey: string;
}
const monthNow = () => new Date().toISOString().slice(0, 7);
const terminal = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'];
const enabled = (settings: Settings) => settings.replicateEnabled;
const codeFor = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  'code' in error &&
  typeof error.code === 'string' &&
  /^[A-Z][A-Z0-9_]{1,79}$/.test(error.code)
    ? error.code
    : 'REPLICATE_JOB_FAILED';

async function committed(tx: Prisma.TransactionClient, month: string) {
  const total = await tx.job.aggregate({
    where: { budgetMonth: month },
    _sum: { reservedCents: true, actualCostCents: true },
  });
  return (total._sum.reservedCents ?? 0) + (total._sum.actualCostCents ?? 0);
}
function parameters(job: Job): ReplicateParameters {
  try {
    const value: unknown = JSON.parse(job.parameters);
    if (
      !value ||
      typeof value !== 'object' ||
      !('version' in value) ||
      !('estimateCents' in value) ||
      !('outputKind' in value)
    )
      throw new Error();
    const input = value as ReplicateParameters;
    readReplicateConfiguration({
      version: input.version,
      outputKind: input.outputKind,
      estimateCents: input.estimateCents,
    });
    return input;
  } catch {
    throw new ReplicateError('INVALID_JOB_PARAMETERS', 400);
  }
}

/** Reserves a disclosed manual estimate across the same ledger as every other provider.
 * Queueing never sends a paid request. A zero monthly ceiling always blocks it.
 */
export async function enqueueReplicateJob(input: EnqueueReplicateInput) {
  if (
    !input ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 6000
  )
    throw new ReplicateError('INVALID_PROMPT', 400);
  for (const value of [
    input.projectId,
    input.idempotencyKey,
    ...(input.sourceMediaId !== undefined ? [input.sourceMediaId] : []),
  ])
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
      throw new ReplicateError('INVALID_INPUT', 400);
  if (
    typeof input.expectedModelVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.expectedModelVersion)
  )
    throw new ReplicateError('MODEL_VERSION_REQUIRED', 400);
  return db.$transaction(async (tx) => {
    const existing = await tx.job.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        existing.kind !== 'replicate' ||
        existing.provider !== 'replicate' ||
        existing.projectId !== input.projectId ||
        existing.sourceMediaId !== (input.sourceMediaId ?? '') ||
        existing.prompt !== input.prompt.trim() ||
        parameters(existing).version !== input.expectedModelVersion
      )
        throw new ReplicateError('IDEMPOTENCY_CONFLICT', 409);
      return existing;
    }
    // A retry retrieves the original reservation even after configuration or
    // credentials change. Only new requests must match the currently shown model.
    const config = readReplicateConfiguration();
    if (!new ReplicateProvider().configured)
      throw new ReplicateError('REPLICATE_NOT_CONFIGURED', 400);
    if (input.expectedModelVersion !== config.version)
      throw new ReplicateError('MODEL_CHANGED', 409);
    const settings = await tx.settings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
    if (!enabled(settings)) throw new ReplicateError('REPLICATE_DISABLED', 400);
    if (input.confirmedPaid !== true)
      throw new ReplicateError('PAID_CONFIRMATION_REQUIRED', 400);
    if (input.expectedCostCents !== config.estimateCents)
      throw new ReplicateError('PRICE_CHANGED', 409);
    if (!(await tx.project.findUnique({ where: { id: input.projectId } })))
      throw new ReplicateError('PROJECT_NOT_FOUND', 404);
    if (input.sourceMediaId) {
      const media = await tx.media.findUnique({
        where: { id: input.sourceMediaId },
      });
      if (
        !media ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType)
      )
        throw new ReplicateError('INVALID_SOURCE_IMAGE', 400);
      if (media.size > 5 * 1024 * 1024)
        throw new ReplicateError('IMAGE_TOO_LARGE', 400);
    }
    const month = monthNow();
    if (
      settings.monthlyBudgetCents <= 0 ||
      (await committed(tx, month)) + config.estimateCents >
        settings.monthlyBudgetCents
    )
      throw new ReplicateError('BUDGET_EXCEEDED', 400);
    const params: ReplicateParameters = {
      ...config,
      sourceKind: 'replicate',
      pricingAssumption: REPLICATE_ESTIMATE_ASSUMPTION,
    };
    return tx.job.create({
      data: {
        projectId: input.projectId,
        sourceMediaId: input.sourceMediaId ?? '',
        kind: 'replicate',
        provider: 'replicate',
        prompt: input.prompt.trim(),
        parameters: JSON.stringify(params),
        budgetMonth: month,
        estimatedCostCents: config.estimateCents,
        reservedCents: config.estimateCents,
        idempotencyKey: input.idempotencyKey,
      },
    });
  });
}

export async function cancelReplicateJob(id: string) {
  const job = await db.job.findUnique({ where: { id } });
  if (!job || job.kind !== 'replicate' || job.provider !== 'replicate')
    throw new ReplicateError('JOB_NOT_FOUND', 404);
  if (terminal.includes(job.status)) return job;
  if (job.providerRequested && !job.providerTaskId)
    throw new ReplicateError('JOB_SUBMITTING', 409);
  if (job.providerTaskId)
    await new ReplicateProvider().cancelTask(job.providerTaskId);
  const result = await db.job.updateMany({
    where: { id, status: job.status, providerRequested: job.providerRequested },
    data: {
      status: 'CANCELLED',
      errorCode: null,
      reservedCents: job.providerRequested ? job.reservedCents : 0,
    },
  });
  if (!result.count) throw new ReplicateError('JOB_STATE_CHANGED', 409);
  return db.job.findUniqueOrThrow({ where: { id } });
}

async function submit(job: Job) {
  const p = parameters(job);
  const config = readReplicateConfiguration();
  if (
    p.version !== config.version ||
    p.outputKind !== config.outputKind ||
    p.estimateCents !== config.estimateCents
  )
    throw new ReplicateError('REPLICATE_CONFIGURATION_CHANGED', 409);
  const provider = new ReplicateProvider();
  if (!provider.configured)
    throw new ReplicateError('REPLICATE_NOT_CONFIGURED', 400);
  let imageDataUri: string | undefined;
  if (job.sourceMediaId) {
    const source = await db.media.findUnique({
      where: { id: job.sourceMediaId },
    });
    if (
      !source ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(source.mimeType)
    )
      throw new ReplicateError('SOURCE_NOT_FOUND', 400);
    const bytes = await readFile(resolveMediaPath(source.path));
    if (bytes.length > 5 * 1024 * 1024)
      throw new ReplicateError('IMAGE_TOO_LARGE', 400);
    imageDataUri = `data:${source.mimeType};base64,${bytes.toString('base64')}`;
  }
  // Commit the single submission claim before sending POST. A crash after this
  // point cannot cause automatic resubmission or release an uncertain charge.
  await db.$transaction(async (tx) => {
    const settings = await tx.settings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    if (!enabled(settings)) throw new ReplicateError('REPLICATE_DISABLED', 400);
    const month = monthNow();
    const extra = job.budgetMonth === month ? 0 : job.reservedCents;
    if (
      settings.monthlyBudgetCents <= 0 ||
      (await committed(tx, month)) + extra > settings.monthlyBudgetCents
    )
      throw new ReplicateError('BUDGET_EXCEEDED', 400);
    const claimed = await tx.job.updateMany({
      where: {
        id: job.id,
        provider: 'replicate',
        kind: 'replicate',
        status: 'PROCESSING',
        providerRequested: false,
      },
      data: {
        status: 'SUBMITTING',
        providerRequested: true,
        budgetMonth: month,
        progress: 10,
      },
    });
    if (!claimed.count) throw new ReplicateError('JOB_STATE_CHANGED', 409);
  });
  try {
    const task = await provider.createPrediction({
      version: p.version,
      prompt: job.prompt,
      imageDataUri,
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

async function poll(job: Job) {
  if (!job.providerTaskId || Date.now() - job.updatedAt.getTime() < 5_000)
    return;
  const lease = await db.job.updateMany({
    where: { id: job.id, status: 'RUNNING', updatedAt: job.updatedAt },
    data: { progress: job.progress },
  });
  if (!lease.count) return;
  let task;
  try {
    task = await new ReplicateProvider().getTask(job.providerTaskId);
  } catch (error) {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: { errorCode: codeFor(error) },
    });
    return;
  }
  if (['failed', 'canceled', 'aborted'].includes(task.status)) {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        status: task.status === 'canceled' ? 'CANCELLED' : 'FAILED',
        errorCode: task.failureCode ?? null,
        // No documented billing field is present: retain the estimate for reconciliation.
      },
    });
    return;
  }
  if (task.status !== 'succeeded') {
    await db.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: { progress: 40, errorCode: null },
    });
    return;
  }
  if (!task.output?.[0]) throw new ReplicateError('REPLICATE_MISSING_OUTPUT');
  const claim = await db.job.updateMany({
    where: { id: job.id, status: 'RUNNING' },
    data: { status: 'EXPORTING', progress: 75 },
  });
  if (!claim.count) return;
  const p = parameters(job);
  await mkdir(join(storageRoot(), 'media'), { recursive: true, mode: 0o700 });
  let relativePath = `media/${job.id}-replicate-output.${p.outputKind === 'video' ? 'mp4' : 'png'}`;
  let destination = resolveMediaPath(relativePath);
  if (!(await db.media.findFirst({ where: { path: relativePath } })))
    await unlink(destination).catch(() => undefined);
  try {
    const output = await downloadReplicateArtifact(
      task.output[0],
      destination,
      p.outputKind,
    );
    const finalPath = `media/${job.id}-replicate-output.${output.extension}`;
    if (finalPath !== relativePath) {
      const finalDestination = resolveMediaPath(finalPath);
      if (await db.media.findFirst({ where: { path: finalPath } }))
        throw new ReplicateError('JOB_OUTPUT_EXISTS', 409);
      await unlink(finalDestination).catch(() => undefined);
      await rename(destination, finalDestination);
      destination = finalDestination;
      relativePath = finalPath;
    }
    await db.$transaction(async (tx) => {
      const current = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
      if (current.status !== 'EXPORTING')
        throw new ReplicateError('JOB_STATE_CHANGED', 409);
      const media = await tx.media.create({
        data: {
          projectId: job.projectId,
          name: `replicate-${job.id}.${output.extension}`,
          path: relativePath,
          mimeType: output.mimeType,
          size: output.bytes,
          width: output.width,
          height: output.height,
          duration: output.duration,
          role: 'GENERATED',
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
            createdMediaIds: [media.id],
            providerOutputCount: task.output!.length,
            outputSelection: 'first',
            nativeWidth: output.width,
            nativeHeight: output.height,
            aiUpscaling: false,
            upscaled: false,
          }),
        },
      });
    });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
}

let processing = false;
let recovered = false;
/** Called by the shared worker; only this adapter's jobs are read or recovered. */
export async function processReplicateJobs() {
  if (processing) return;
  processing = true;
  try {
    if (!recovered) {
      const own = { provider: 'replicate', kind: 'replicate' };
      await db.job.updateMany({
        where: {
          ...own,
          providerRequested: true,
          providerTaskId: null,
          status: { in: ['PROCESSING', 'SUBMITTING'] },
        },
        data: { status: 'UNKNOWN', errorCode: 'REPLICATE_SUBMISSION_UNKNOWN' },
      });
      await db.job.updateMany({
        where: { ...own, providerRequested: false, status: 'PROCESSING' },
        data: { status: 'QUEUED', progress: 0 },
      });
      await db.job.updateMany({
        where: { ...own, providerTaskId: { not: null }, status: 'EXPORTING' },
        data: { status: 'RUNNING' },
      });
      recovered = true;
    }
    const jobs = await db.job.findMany({
      where: {
        provider: 'replicate',
        kind: 'replicate',
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const job of jobs) {
      try {
        if (job.status === 'RUNNING') {
          await poll(job);
          continue;
        }
        const claim = await db.job.updateMany({
          where: { id: job.id, status: 'QUEUED', providerRequested: false },
          data: { status: 'PROCESSING', progress: 5 },
        });
        if (claim.count) await submit(job);
      } catch (error) {
        const current = await db.job.findUnique({ where: { id: job.id } });
        if (current && !terminal.includes(current.status))
          await db.job.updateMany({
            where: { id: job.id, status: current.status },
            data: {
              status:
                current.providerRequested && !current.providerTaskId
                  ? 'UNKNOWN'
                  : 'FAILED',
              errorCode: codeFor(error),
              ...(!current.providerRequested ? { reservedCents: 0 } : {}),
            },
          });
      }
    }
  } finally {
    processing = false;
  }
}
