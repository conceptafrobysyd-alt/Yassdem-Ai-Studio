import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { Project } from '@prisma/client';
import { db } from './db';
import { ApiError } from './http';
import { resolveMediaPath } from './media';
import { enqueueJob } from './jobs';
import type { EnqueueInput } from './jobs';
import { enqueueFashionJob } from './fashion-jobs';
import { DEFAULT_LOOK, DEFAULT_MANNEQUIN } from './fashion';
import { publicProject } from './projects';
import { publicJob } from './jobs-public';
import { ComfyUIProvider, prepareComfyWorkflow } from './providers/comfyui';

type Action = 'video' | 'model';
type Input = {
  sourceMediaId: string;
  action: Action;
  idempotencyKey: string;
  locale: 'fr' | 'en';
};
type Binding = {
  version: 1;
  sourceMediaId: string;
  action: Action;
  video: Omit<EnqueueInput, 'projectId' | 'idempotencyKey'> | null;
};
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const rasterTypes = ['image/png', 'image/jpeg', 'image/webp'];
function parseInput(input: Record<string, unknown>): Input {
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        !['sourceMediaId', 'action', 'idempotencyKey', 'locale'].includes(key),
    ) ||
    !identifier(input.sourceMediaId) ||
    !identifier(input.idempotencyKey) ||
    !['video', 'model'].includes(input.action as string) ||
    (input.locale !== undefined &&
      !['fr', 'en'].includes(input.locale as string))
  )
    throw new ApiError(400, 'QUICK_CREATE_INVALID_INPUT');
  return { ...input, locale: input.locale ?? 'fr' } as Input;
}
function idsFor(key: string) {
  const digest = createHash('sha256')
    .update(`quick-create-v1:${key}`)
    .digest('hex');
  return {
    projectId: `quick_${digest}`,
    lookId: `quick_look_${digest}`,
    mannequinId: `quick_model_${digest}`,
    jobKey: `quick_job_${digest}`,
  };
}
function bindingFor(project: Project, input: Input): Binding {
  let binding: Binding | undefined;
  try {
    binding = JSON.parse(project.parameters)._quickCreate as Binding;
  } catch {
    // A changed or historical project cannot be silently reused as this request.
  }
  if (
    binding?.version !== 1 ||
    binding.action !== input.action ||
    binding.sourceMediaId !== input.sourceMediaId ||
    project.type !== (input.action === 'video' ? 'product' : 'fashion') ||
    (input.action === 'video' && !binding.video)
  )
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
  return binding;
}
function safeCode(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^COMFYUI_[A-Z0-9_]+$/.test(error.code)
    ? error.code
    : 'COMFYUI_UNREACHABLE';
}

/** No inference, upload or paid API is performed while checking capabilities. */
export async function quickCreateCapabilities() {
  try {
    const provider = new ComfyUIProvider();
    const workflow = await provider.loadWorkflow('fashion-image');
    // A one-photo shortcut cannot supply a second garment or a portrait.
    prepareComfyWorkflow(workflow, {
      prompt:
        'Create an editorial image of a model with the reference garment.',
      seed: 1,
      width: 1024,
      height: 1536,
      garmentImages: ['garment-1.png'],
      mannequinParameters: { ...DEFAULT_MANNEQUIN },
    });
    const connection = await provider.checkConnection();
    return {
      model: {
        available: connection.ok,
        ...(connection.code ? { code: connection.code } : {}),
      },
    };
  } catch (error) {
    return { model: { available: false, code: safeCode(error) } };
  }
}

/** Stable IDs bind retries to one project and one queue entry, including after a lost response. */
export async function quickCreate(raw: Record<string, unknown>) {
  const input = parseInput(raw);
  const ids = idsFor(input.idempotencyKey);
  let project = await db.project.findUnique({ where: { id: ids.projectId } });
  if (project) bindingFor(project, input);
  const priorJob = await db.job.findUnique({
    where: { idempotencyKey: ids.jobKey },
  });
  if (priorJob) {
    if (
      !project ||
      priorJob.projectId !== project.id ||
      priorJob.sourceMediaId !== input.sourceMediaId ||
      priorJob.provider !== (input.action === 'video' ? 'local' : 'comfyui') ||
      priorJob.kind !==
        (input.action === 'video' ? 'generation' : 'fashion_image')
    )
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    return {
      project: publicProject(project),
      job: publicJob(priorJob),
      ...(input.action === 'model' ? { lookId: ids.lookId } : {}),
    };
  }
  const source = await db.media.findUnique({
    where: { id: input.sourceMediaId },
  });
  if (
    !source ||
    source.role !== 'SOURCE' ||
    !rasterTypes.includes(source.mimeType)
  )
    throw new ApiError(400, 'QUICK_CREATE_SOURCE_REQUIRED');
  try {
    const file = await stat(resolveMediaPath(source.path));
    if (!file.isFile() || file.size <= 0 || file.size > 20 * 1024 * 1024)
      throw new Error();
  } catch {
    throw new ApiError(400, 'QUICK_CREATE_SOURCE_REQUIRED');
  }
  if (input.action === 'model') {
    const capability = await quickCreateCapabilities();
    if (!capability.model.available)
      throw new ApiError(503, capability.model.code ?? 'COMFYUI_UNREACHABLE');
  }

  // Keep preparation transactional; never reassign an existing source to the new project.
  // A transient queue failure leaves this resumable preparation bound to the same key.
  project = await db.$transaction(async (tx) => {
    const existing = await tx.project.findUnique({
      where: { id: ids.projectId },
    });
    if (existing) {
      bindingFor(existing, input);
      return existing;
    }
    const currentSource = await tx.media.findUnique({
      where: { id: input.sourceMediaId },
    });
    if (
      !currentSource ||
      currentSource.role !== 'SOURCE' ||
      !rasterTypes.includes(currentSource.mimeType)
    )
      throw new ApiError(400, 'QUICK_CREATE_SOURCE_REQUIRED');
    const settings = await tx.settings.upsert({
      where: { id: 'default' },
      create: {},
      update: {},
    });
    const logo = settings.activeLogoId
      ? await tx.media.findFirst({
          where: {
            id: settings.activeLogoId,
            role: 'LOGO',
            mimeType: { in: rasterTypes },
          },
        })
      : null;
    const video: Binding['video'] =
      input.action === 'video'
        ? {
            sourceMediaId: input.sourceMediaId,
            provider: 'local',
            durationSeconds: 5,
            format: '9:16',
            resolution: 720,
            codec: 'h264',
            quality: 21,
            logoId: logo?.id ?? null,
            logoSize: settings.logoSize,
            logoOpacity: settings.logoOpacity,
            logoPosition: settings.logoPosition as EnqueueInput['logoPosition'],
            logoFade: settings.logoFade,
            logoTiming: 'all',
          }
        : null;
    const binding: Binding = {
      version: 1,
      action: input.action,
      sourceMediaId: input.sourceMediaId,
      video,
    };
    const sourceName =
      currentSource.name
        .replace(/\.[^.]+$/, '')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
        .trim()
        .slice(0, 110) ||
      (input.locale === 'fr' ? 'Mon produit' : 'My product');
    const parameters =
      input.action === 'video'
        ? {
            sourceMediaId: input.sourceMediaId,
            provider: 'local',
            duration: 5,
            format: '9:16',
            resolution: 720,
            codec: 'h264',
            quality: 'balanced',
            prompt: '',
            preset: 'minimal',
            decor: 'cream',
            camera: 'zoom-in',
            logoMediaId: logo?.id ?? '',
            logoSize: settings.logoSize,
            logoOpacity: settings.logoOpacity,
            logoPosition: settings.logoPosition,
            logoAnimation: settings.logoFade ? 'fade' : 'none',
            logoTiming: 'all',
            stylePreferences: {},
            _quickCreate: binding,
          }
        : { _quickCreate: binding };
    const created = await tx.project.create({
      data: {
        id: ids.projectId,
        name: `${sourceName} — ${input.action === 'video' ? (input.locale === 'fr' ? 'vidéo' : 'video') : input.locale === 'fr' ? 'mannequin' : 'model'}`,
        type: input.action === 'video' ? 'product' : 'fashion',
        parameters: JSON.stringify(parameters),
      },
    });
    if (input.action === 'model') {
      let styles: string[] = [];
      try {
        const saved: unknown = JSON.parse(settings.preferredStyles);
        if (Array.isArray(saved))
          styles = [
            ...new Set(
              saved
                .filter(
                  (value): value is string =>
                    typeof value === 'string' &&
                    value.trim().length > 0 &&
                    value.length <= 100,
                )
                .map((value) => value.trim()),
            ),
          ].slice(0, 12);
      } catch {
        /* Defaults remain usable for older settings. */
      }
      await tx.mannequin.create({
        data: {
          id: ids.mannequinId,
          name:
            input.locale === 'fr' ? 'Mannequin automatique' : 'Automatic model',
          parameters: JSON.stringify({
            ...DEFAULT_MANNEQUIN,
            hijab: settings.hijab,
          }),
        },
      });
      await tx.look.create({
        data: {
          id: ids.lookId,
          projectId: created.id,
          mannequinId: ids.mannequinId,
          name: sourceName,
          garmentMediaIds: JSON.stringify([input.sourceMediaId]),
          parameters: JSON.stringify({
            ...DEFAULT_LOOK,
            styles,
            mood: 'editorial',
            decor: 'neutral studio background',
            prompt:
              'Create an editorial fashion photograph with the reference garment. Preserve its shape, colors, patterns and details.',
          }),
        },
      });
    }
    return created;
  });
  const binding = bindingFor(project, input);
  const job =
    input.action === 'video'
      ? await enqueueJob({
          ...binding.video!,
          projectId: project.id,
          idempotencyKey: ids.jobKey,
        })
      : await enqueueFashionJob({
          lookId: ids.lookId,
          mode: 'fashion-image',
          idempotencyKey: ids.jobKey,
        });
  return {
    project: publicProject(project),
    job: publicJob(job),
    ...(input.action === 'model' ? { lookId: ids.lookId } : {}),
  };
}
