import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job, Prisma } from '@prisma/client';
import { db } from './db';
import { resolveMediaPath, storageRoot } from './media';
import { checkExportSupport } from './export';
import {
  defaultEditorTimeline,
  editorDuration,
  EditorError,
  parseEditorTimeline,
  renderEditorTimeline,
  type EditorTimeline,
} from './editor';

type Transaction = Prisma.TransactionClient;
function projectParameters(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value))
      return value;
  } catch {
    /* A missing old configuration can start with a fresh editor timeline. */
  }
  return {};
}
function storedTimeline(parameters: string) {
  const saved = projectParameters(parameters).editor;
  return saved === undefined
    ? defaultEditorTimeline()
    : parseEditorTimeline(saved);
}
async function validateMedia(tx: Transaction, timeline: EditorTimeline) {
  const ids = [
    ...new Set([
      ...timeline.clips.map((clip) => clip.mediaId),
      ...(timeline.musicMediaId ? [timeline.musicMediaId] : []),
      ...(timeline.logoId ? [timeline.logoId] : []),
    ]),
  ];
  const items = await tx.media.findMany({ where: { id: { in: ids } } });
  const media = new Map(items.map((item) => [item.id, item]));
  for (const clip of timeline.clips) {
    const source = media.get(clip.mediaId);
    if (!source || source.mimeType !== 'video/mp4')
      throw new EditorError('EDITOR_VIDEO_NOT_FOUND');
    if (!source.duration || clip.endSeconds > source.duration + 0.05)
      throw new EditorError('EDITOR_TRIM_OUT_OF_RANGE');
  }
  if (timeline.musicMediaId) {
    const music = media.get(timeline.musicMediaId);
    if (
      !music ||
      !(music.mimeType.startsWith('audio/') || music.mimeType === 'video/mp4')
    )
      throw new EditorError('MUSIC_NOT_FOUND');
  }
  if (timeline.logoId) {
    const logo = media.get(timeline.logoId);
    if (
      !logo ||
      logo.role !== 'LOGO' ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType)
    )
      throw new EditorError('LOGO_NOT_FOUND');
  }
  return media;
}
export async function getEditorTimeline(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new EditorError('PROJECT_NOT_FOUND', 404);
  return storedTimeline(project.parameters);
}
export async function saveEditorTimeline(projectId: string, value: unknown) {
  const timeline = parseEditorTimeline(value);
  await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new EditorError('PROJECT_NOT_FOUND', 404);
    await validateMedia(tx, timeline);
    await tx.project.update({
      where: { id: projectId },
      data: {
        parameters: JSON.stringify({
          ...projectParameters(project.parameters),
          editor: timeline,
        }),
      },
    });
  });
  return timeline;
}
export async function enqueueEditorJob(
  projectId: string,
  input: Record<string, unknown>,
) {
  if (
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)
  )
    throw new EditorError('INVALID_IDEMPOTENCY_KEY');
  const idempotencyKey = input.idempotencyKey;
  return db.$transaction(async (tx) => {
    const existing = await tx.job.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.projectId !== projectId || existing.kind !== 'edit')
        throw new EditorError('IDEMPOTENCY_CONFLICT', 409);
      return existing;
    }
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new EditorError('PROJECT_NOT_FOUND', 404);
    const timeline = storedTimeline(project.parameters);
    if (!timeline.clips.length) throw new EditorError('EDITOR_CLIPS_REQUIRED');
    if (timeline.musicMediaId && input.musicRightsConfirmed !== true)
      throw new EditorError('MUSIC_RIGHTS_REQUIRED');
    await validateMedia(tx, timeline);
    const pending = await tx.job.count({
      where: {
        status: {
          in: ['QUEUED', 'PROCESSING', 'EXPORTING', 'RUNNING', 'SUBMITTING'],
        },
      },
    });
    if (pending >= 20) throw new EditorError('JOB_QUEUE_FULL', 409);
    return tx.job.create({
      data: {
        projectId,
        sourceMediaId: timeline.clips[0].mediaId,
        provider: 'local',
        kind: 'edit',
        status: 'QUEUED',
        budgetMonth: new Date().toISOString().slice(0, 7),
        estimatedCostCents: 0,
        actualCostCents: 0,
        reservedCents: 0,
        idempotencyKey,
        parameters: JSON.stringify({
          timeline,
          durationSeconds: editorDuration(timeline),
          musicRightsConfirmed: Boolean(
            timeline.musicMediaId && input.musicRightsConfirmed === true,
          ),
          sourceKind: 'editor',
        }),
      },
    });
  });
}
function jobParameters(job: Job): {
  timeline: EditorTimeline;
  musicRightsConfirmed: boolean;
} {
  try {
    const input = JSON.parse(job.parameters);
    return {
      timeline: parseEditorTimeline(input.timeline),
      musicRightsConfirmed: input.musicRightsConfirmed === true,
    };
  } catch (error) {
    if (error instanceof EditorError) throw error;
    throw new EditorError('INVALID_JOB_PARAMETERS');
  }
}
async function finishEditorJob(job: Job) {
  const parameters = jobParameters(job);
  const timeline = parameters.timeline;
  const media = await db.$transaction((tx) => validateMedia(tx, timeline));
  await checkExportSupport(timeline.codec);
  await mkdir(join(storageRoot(), 'media'), { recursive: true, mode: 0o700 });
  if (!/^[A-Za-z0-9_-]+$/.test(job.id)) throw new EditorError('INVALID_JOB_ID');
  const videoRelative = `media/${job.id}-edit.mp4`;
  const coverRelative = `media/${job.id}-cover.jpg`;
  const outputPath = resolveMediaPath(videoRelative);
  const coverPath = resolveMediaPath(coverRelative);
  // A worker restart may leave disposable files from an uncommitted render.
  for (const [relative, path] of [
    [videoRelative, outputPath],
    [coverRelative, coverPath],
  ]) {
    if (await db.media.findFirst({ where: { path: relative } }))
      throw new EditorError('EDITOR_OUTPUT_ALREADY_EXISTS', 409);
    await unlink(path).catch(() => undefined);
  }
  const result = await renderEditorTimeline({
    timeline,
    clipPaths: timeline.clips.map((clip) =>
      resolveMediaPath(media.get(clip.mediaId)!.path),
    ),
    ...(timeline.musicMediaId
      ? { musicPath: resolveMediaPath(media.get(timeline.musicMediaId)!.path) }
      : {}),
    musicRightsConfirmed: parameters.musicRightsConfirmed,
    ...(timeline.logoId
      ? { logo: { path: resolveMediaPath(media.get(timeline.logoId)!.path) } }
      : {}),
    outputPath,
    coverPath,
  });
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
      if (current.status !== 'PROCESSING')
        throw new EditorError('JOB_STATE_CHANGED', 409);
      const output = await tx.media.create({
        data: {
          name: `montage-${job.id}.mp4`,
          path: videoRelative,
          mimeType: 'video/mp4',
          size: result.bytes,
          width: result.width,
          height: result.height,
          duration: result.durationSeconds,
          role: 'EXPORT',
          projectId: job.projectId,
        },
      });
      const cover = await tx.media.create({
        data: {
          name: `couverture-${job.id}.jpg`,
          path: coverRelative,
          mimeType: 'image/jpeg',
          size: result.coverBytes,
          width: result.width,
          height: result.height,
          role: 'COVER',
          projectId: job.projectId,
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          progress: 100,
          outputMediaId: output.id,
          actualCostCents: 0,
          reservedCents: 0,
          errorCode: null,
          parameters: JSON.stringify({
            ...parameters,
            sourceKind: 'editor',
            durationSeconds: result.durationSeconds,
            exportWidth: result.width,
            exportHeight: result.height,
            codec: result.codec,
            aiUpscaling: false,
            upscaled: result.upscaled,
            coverMediaId: cover.id,
          }),
        },
      });
    });
  } catch (error) {
    await Promise.all(
      [outputPath, coverPath].map((path) =>
        unlink(path).catch(() => undefined),
      ),
    );
    throw error;
  }
}
let processing = false;
let recovered = false;
/** Called sequentially by the same exclusive worker as generation/export jobs. */
export async function processEditJobs() {
  if (processing) return;
  processing = true;
  try {
    if (!recovered) {
      await db.job.updateMany({
        where: { kind: 'edit', status: 'PROCESSING', providerRequested: false },
        data: { status: 'QUEUED', progress: 0 },
      });
      recovered = true;
    }
    const job = await db.job.findFirst({
      where: { kind: 'edit', status: 'QUEUED', provider: 'local' },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return;
    const claimed = await db.job.updateMany({
      where: {
        id: job.id,
        kind: 'edit',
        status: 'QUEUED',
        providerRequested: false,
      },
      data: { status: 'PROCESSING', progress: 10 },
    });
    if (!claimed.count) return;
    try {
      await finishEditorJob(job);
    } catch (error) {
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
          ? error.code
          : 'EDITOR_RENDER_FAILED';
      await db.job.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          errorCode: code,
          reservedCents: 0,
          actualCostCents: 0,
        },
      });
    }
  } finally {
    processing = false;
  }
}
