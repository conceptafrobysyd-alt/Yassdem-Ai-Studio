import { mkdir, mkdtemp, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Job } from '@prisma/client';
import { db } from './db';
import { ApiError } from './http';
import {
  parseCreatorDocument,
  validateCreatorMedia,
  type CreatorDocument,
} from './creator';
import {
  getCreatorVoiceCapabilities,
  synthesizeCreatorVoice,
} from './creator-voice';
import { renderCreatorVideo, type CreatorRenderScene } from './creator-render';
import { resolveMediaPath, storageRoot } from './media';
import { checkExportSupport } from './export';
import { validateAudioFile } from './media-audio';

const KINDS = ['creator', 'creator-preview'];
const ACTIVE = ['QUEUED', 'PROCESSING', 'EXPORTING', 'RUNNING', 'SUBMITTING'];
type Snapshot = {
  version: 1;
  document: CreatorDocument;
  mode: 'preview' | 'export';
  musicRightsConfirmed: boolean;
};
function parameters(job: Job): Snapshot {
  try {
    const value = JSON.parse(job.parameters).creator as Snapshot;
    if (
      value?.version !== 1 ||
      !['preview', 'export'].includes(value.mode) ||
      typeof value.musicRightsConfirmed !== 'boolean'
    )
      throw new Error();
    return { ...value, document: parseCreatorDocument(value.document) };
  } catch {
    throw new ApiError(409, 'CREATOR_INVALID_JOB');
  }
}
function fromProject(raw: string) {
  try {
    return parseCreatorDocument(JSON.parse(raw).creator);
  } catch {
    throw new ApiError(409, 'CREATOR_DOCUMENT_NOT_FOUND');
  }
}

/** Approval, input references and settings are frozen before this free local job is acknowledged. */
export async function enqueueCreatorJob(
  projectId: string,
  input: Record<string, unknown>,
) {
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'expectedRevision',
          'idempotencyKey',
          'mode',
          'musicRightsConfirmed',
        ].includes(key),
    ) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    (input.expectedRevision as number) < 1 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey) ||
    !['preview', 'export'].includes(input.mode as string) ||
    (input.musicRightsConfirmed !== undefined &&
      typeof input.musicRightsConfirmed !== 'boolean')
  )
    throw new ApiError(400, 'CREATOR_INVALID_RENDER_REQUEST');
  const key = input.idempotencyKey;
  const kind = input.mode === 'preview' ? 'creator-preview' : 'creator';
  function acknowledged(job: Job) {
    if (job.projectId !== projectId || job.kind !== kind)
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    const saved = parameters(job);
    if (
      job.projectId !== projectId ||
      job.kind !== kind ||
      saved.document.revision !== input.expectedRevision
    )
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return job;
  }
  const existing = await db.job.findUnique({ where: { idempotencyKey: key } });
  if (existing) return acknowledged(existing);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  const candidate = fromProject(project.parameters);
  if (candidate.revision !== input.expectedRevision)
    throw new ApiError(409, 'CREATOR_REVISION_CONFLICT');
  if (candidate.approvedRevision !== candidate.revision)
    throw new ApiError(409, 'CREATOR_APPROVAL_REQUIRED');
  if (
    candidate.render.voice === 'system' &&
    !(await getCreatorVoiceCapabilities())[candidate.plan.language].available
  )
    throw new ApiError(503, 'CREATOR_VOICE_UNAVAILABLE');
  await checkExportSupport('h264');
  return db.$transaction(async (tx) => {
    const duplicate = await tx.job.findUnique({
      where: { idempotencyKey: key },
    });
    if (duplicate) return acknowledged(duplicate);
    const current = await tx.project.findUnique({ where: { id: projectId } });
    if (!current) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    const document = fromProject(current.parameters);
    if (document.revision !== input.expectedRevision)
      throw new ApiError(409, 'CREATOR_REVISION_CONFLICT');
    if (document.approvedRevision !== document.revision)
      throw new ApiError(409, 'CREATOR_APPROVAL_REQUIRED');
    if (document.render.musicMediaId && input.musicRightsConfirmed !== true)
      throw new ApiError(400, 'MUSIC_RIGHTS_REQUIRED');
    await validateCreatorMedia(tx, document);
    if (
      await tx.job.findFirst({
        where: { projectId, kind: { in: KINDS }, status: { in: ACTIVE } },
      })
    )
      throw new ApiError(409, 'CREATOR_RENDER_ACTIVE');
    const snapshot: Snapshot = {
      version: 1,
      document,
      mode: input.mode as Snapshot['mode'],
      musicRightsConfirmed: input.musicRightsConfirmed === true,
    };
    return tx.job.create({
      data: {
        projectId,
        sourceMediaId:
          document.plan.scenes.find((scene) => scene.mediaId)?.mediaId ??
          `creator_${projectId}`,
        provider: 'local',
        kind,
        idempotencyKey: key,
        parameters: JSON.stringify({ creator: snapshot }),
        budgetMonth: new Date().toISOString().slice(0, 7),
        estimatedCostCents: 0,
        actualCostCents: 0,
        reservedCents: 0,
      },
    });
  });
}

async function finish(job: Job) {
  const saved = parameters(job);
  const { document } = saved;
  const { render, plan } = document;
  const directory = join(storageRoot(), 'media');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const relativeVideo = `media/${job.id}.mp4`;
  const relativeCover = `media/${job.id}-cover.jpg`;
  const relativeSrt = `media/${job.id}.srt`;
  const outputPath = resolveMediaPath(relativeVideo);
  const coverPath = resolveMediaPath(relativeCover);
  const subtitlesPath = resolveMediaPath(relativeSrt);
  const outputs = [outputPath, coverPath, subtitlesPath];
  const scratch = await mkdtemp(join(directory, '.creator-'));
  let committed = false;
  try {
    // A recovered local task may have left incomplete files, never committed media.
    for (const path of outputs) await unlink(path).catch(() => undefined);
    const references = [
      ...new Set([
        ...plan.scenes.flatMap((scene) =>
          scene.mediaId ? [scene.mediaId] : [],
        ),
        ...[render.narrationMediaId, render.musicMediaId, render.logoId].filter(
          (id): id is string => Boolean(id),
        ),
      ]),
    ];
    const items = await db.media.findMany({
      where: { id: { in: references } },
    });
    const media = new Map(items.map((item) => [item.id, item]));
    function localFile(id: string | null) {
      if (!id) return null;
      const item = media.get(id);
      if (!item) throw new ApiError(409, 'CREATOR_MEDIA_MISSING');
      return resolveMediaPath(item.path);
    }
    const scenes: CreatorRenderScene[] = [];
    const voiceEngines = new Set<string>();
    let actualSceneDuration = 0;
    for (const [index, scene] of plan.scenes.entries()) {
      const current = await db.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (current?.status !== 'PROCESSING')
        throw new ApiError(409, 'CREATOR_JOB_CANCELLED');
      let voicePath: string | null = null;
      if (render.voice === 'system' && scene.narration.trim()) {
        voicePath = join(scratch, `voice-${index}.wav`);
        const voice = await synthesizeCreatorVoice({
          text: scene.narration,
          language: plan.language,
          outputPath: voicePath,
        });
        voiceEngines.add(voice.engine);
        actualSceneDuration += Math.max(
          scene.durationSeconds,
          voice.durationSeconds + 0.25,
        );
      } else {
        actualSceneDuration += scene.durationSeconds;
      }
      scenes.push({
        id: scene.id,
        narration: scene.narration,
        onScreenText: scene.onScreenText,
        durationSeconds: scene.durationSeconds,
        sourcePath: localFile(scene.mediaId),
        sourceMimeType: scene.mediaId
          ? media.get(scene.mediaId)!.mimeType
          : null,
        voicePath,
      });
      await db.job.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          progress: Math.round(5 + ((index + 1) / plan.scenes.length) * 15),
        },
      });
    }
    const logo = render.logoId ? localFile(render.logoId) : null;
    const durationLimit = plan.mode === 'youtube' ? 600 : 120;
    if (actualSceneDuration > durationLimit)
      throw new ApiError(400, 'CREATOR_DURATION_LIMIT');
    if (
      render.voice === 'imported' &&
      (await validateAudioFile(localFile(render.narrationMediaId)!)).duration +
        0.25 >
        durationLimit
    )
      throw new ApiError(400, 'CREATOR_DURATION_LIMIT');
    const result = await renderCreatorVideo({
      scenes,
      language: plan.language,
      format: render.format,
      resolution: saved.mode === 'preview' ? 360 : render.resolution,
      outputPath,
      coverPath,
      subtitlesPath,
      disclosure: [
        plan.mode === 'story'
          ? `${plan.language === 'fr' ? 'Fiction · Épisode' : 'Fiction · Episode'} ${plan.episode}`
          : '',
        plan.adDisclosure,
      ]
        .filter(Boolean)
        .join(' · '),
      narrationPath:
        render.voice === 'imported' ? localFile(render.narrationMediaId) : null,
      musicPath: localFile(render.musicMediaId),
      musicVolume: render.musicVolume,
      musicRightsConfirmed: saved.musicRightsConfirmed,
      logo: logo
        ? {
            path: logo,
            sizePercent: render.logoSize,
            opacity: render.logoOpacity,
            position: render.logoPosition,
            fade: render.logoFade,
            timing: 'all',
          }
        : undefined,
      onProgress: async (progress) => {
        const update = await db.job.updateMany({
          where: { id: job.id, status: 'PROCESSING' },
          data: {
            progress: Math.round(
              20 + Math.max(0, Math.min(100, progress)) * 0.75,
            ),
          },
        });
        if (!update.count) throw new ApiError(409, 'CREATOR_JOB_CANCELLED');
      },
    });
    await db.$transaction(async (tx) => {
      const current = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
      if (current.status !== 'PROCESSING')
        throw new ApiError(409, 'CREATOR_JOB_CANCELLED');
      const preview = saved.mode === 'preview';
      const video = await tx.media.create({
        data: {
          projectId: job.projectId,
          name: `${plan.title.slice(0, 100)}${preview ? '-apercu' : ''}.mp4`,
          path: relativeVideo,
          mimeType: 'video/mp4',
          size: result.bytes,
          width: result.width,
          height: result.height,
          duration: result.durationSeconds,
          role: preview ? 'PREVIEW' : 'EXPORT',
        },
      });
      const cover = await tx.media.create({
        data: {
          projectId: job.projectId,
          name: `${plan.title.slice(0, 100)}-couverture.jpg`,
          path: relativeCover,
          mimeType: 'image/jpeg',
          size: result.coverBytes,
          width: result.width,
          height: result.height,
          role: preview ? 'PREVIEW_COVER' : 'COVER',
        },
      });
      const subtitle = await tx.media.create({
        data: {
          projectId: job.projectId,
          name: `${plan.title.slice(0, 100)}-sous-titres.srt`,
          path: relativeSrt,
          mimeType: 'application/x-subrip',
          size: (await stat(subtitlesPath)).size,
          role: 'SUBTITLE',
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          progress: 100,
          outputMediaId: video.id,
          actualCostCents: 0,
          reservedCents: 0,
          parameters: JSON.stringify({
            ...JSON.parse(current.parameters),
            outputCoverMediaId: cover.id,
            outputSubtitleMediaId: subtitle.id,
            sceneTimings: result.sceneTimings,
            sourceKind: 'local-creator-montage',
            generatesNewAiVisuals: false,
            captionsSource: 'approved-script',
            voiceMode: render.voice,
            voiceEngines: [...voiceEngines],
          }),
        },
      });
    });
    committed = true;
  } finally {
    await rm(scratch, { recursive: true, force: true });
    if (!committed)
      for (const path of outputs) await unlink(path).catch(() => undefined);
  }
}
let processing = false;
let recovered = false;
export async function processCreatorJobs() {
  if (processing) return;
  processing = true;
  try {
    if (!recovered) {
      await db.job.updateMany({
        where: {
          provider: 'local',
          kind: { in: KINDS },
          status: 'PROCESSING',
          providerRequested: false,
        },
        data: { status: 'QUEUED', progress: 0 },
      });
      recovered = true;
    }
    const job = await db.job.findFirst({
      where: {
        provider: 'local',
        kind: { in: KINDS },
        status: 'QUEUED',
        providerRequested: false,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return;
    const claim = await db.job.updateMany({
      where: { id: job.id, status: 'QUEUED', providerRequested: false },
      data: { status: 'PROCESSING', progress: 2 },
    });
    if (!claim.count) return;
    try {
      await finish(job);
    } catch (error) {
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z][A-Z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : 'CREATOR_RENDER_FAILED';
      await db.job.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          errorCode: code,
          actualCostCents: 0,
          reservedCents: 0,
        },
      });
    }
  } finally {
    processing = false;
  }
}
