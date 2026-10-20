import { copyFile, mkdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import archiver from 'archiver';
import { PassThrough, Readable } from 'node:stream';
import type { Project, Media, Job, Look, Mannequin } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError, boundedString } from '@/lib/http';
import { publicMedia, resolveMediaPath, storageRoot } from '@/lib/media';

export function publicProject(project: Project) {
  let parameters: unknown = {};
  try {
    parameters = JSON.parse(project.parameters);
  } catch {
    /* Old data defaults to an empty object. */
  }
  return { ...project, parameters };
}
export async function listProjects() {
  return (await db.project.findMany({ orderBy: { updatedAt: 'desc' } })).map(
    publicProject,
  );
}
function validateParameters(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(value).length > 20000
  )
    throw new ApiError(400, 'INVALID_PARAMETERS');
  return JSON.stringify(value);
}
function projectInput(input: Record<string, unknown>, creating: boolean) {
  const data: {
    name?: string;
    type?: string;
    description?: string;
    parameters?: string;
  } = {};
  if (creating || 'name' in input)
    data.name = boundedString(input.name, 'name', 150);
  if ('type' in input) {
    if (!['product', 'fashion', 'lookbook'].includes(input.type as string))
      throw new ApiError(400, 'INVALID_PROJECT_TYPE');
    data.type = input.type as string;
  }
  if ('description' in input)
    data.description = boundedString(
      input.description,
      'description',
      3000,
      true,
    );
  if ('parameters' in input)
    data.parameters = validateParameters(input.parameters);
  if (
    Object.keys(input).some(
      (key) => !['name', 'type', 'description', 'parameters'].includes(key),
    )
  )
    throw new ApiError(400, 'INVALID_INPUT');
  return data;
}
export async function createProject(input: Record<string, unknown>) {
  const data = projectInput(input, true);
  return publicProject(
    await db.project.create({ data: { ...data, name: data.name! } }),
  );
}
export async function updateProject(
  id: string,
  input: Record<string, unknown>,
) {
  return publicProject(
    await db.project.update({
      where: { id },
      data: projectInput(input, false),
    }),
  );
}
export async function getProject(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: { media: true, jobs: { orderBy: { createdAt: 'desc' } } },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  return {
    ...publicProject(project),
    media: project.media.map(publicMedia),
    jobs: project.jobs.map((job) => ({
      ...job,
      parameters: JSON.parse(job.parameters),
    })),
  };
}
async function includeReferencedMedia(
  project: Project & {
    media: Media[];
    jobs: Job[];
    looks?: (Look & { mannequin: Mannequin | null })[];
  },
) {
  const ids = new Set(project.media.map((media) => media.id));
  function collect(value: unknown) {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value))
      ids.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(collect);
  }
  try {
    collect(JSON.parse(project.parameters));
  } catch {
    /* Preserve readable historical records. */
  }
  for (const job of project.jobs) {
    ids.add(job.sourceMediaId);
    if (job.outputMediaId) ids.add(job.outputMediaId);
    try {
      collect(JSON.parse(job.parameters));
    } catch {
      /* Malformed old metadata has no usable references. */
    }
  }
  for (const look of project.looks || []) {
    collect(JSON.parse(look.garmentMediaIds));
    collect(JSON.parse(look.parameters));
    if (look.outputMediaId) ids.add(look.outputMediaId);
    if (look.mannequin?.referenceMediaId)
      ids.add(look.mannequin.referenceMediaId);
  }
  const media = new Map(project.media.map((item) => [item.id, item]));
  const candidates = [...ids].filter((id) => !media.has(id));
  for (let offset = 0; offset < candidates.length; offset += 500) {
    for (const item of await db.media.findMany({
      where: { id: { in: candidates.slice(offset, offset + 500) } },
    }))
      media.set(item.id, item);
  }
  return [...media.values()];
}
export async function duplicateProject(id: string) {
  const source = await db.project.findUnique({
    where: { id },
    include: {
      media: true,
      jobs: true,
      looks: { include: { mannequin: true } },
    },
  });
  if (!source) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  const sourceMedia = await includeReferencedMedia(source);
  const copied: string[] = [];
  await mkdir(path.join(storageRoot(), 'media'), {
    recursive: true,
    mode: 0o700,
  });
  try {
    const ids = new Map<string, string>([[source.id, randomUUID()]]);
    const media: {
      id: string;
      name: string;
      path: string;
      mimeType: string;
      size: number;
      width: number | null;
      height: number | null;
      duration: number | null;
      role: string;
    }[] = [];
    for (const original of sourceMedia) {
      const newId = randomUUID();
      ids.set(original.id, newId);
      const relativePath = `media/${newId}${path.extname(original.path)}`;
      await copyFile(
        resolveMediaPath(original.path),
        resolveMediaPath(relativePath),
      );
      copied.push(relativePath);
      const { name, mimeType, size, width, height, duration, role } = original;
      media.push({
        id: newId,
        name,
        path: relativePath,
        mimeType,
        size,
        width,
        height,
        duration,
        role,
      });
    }
    for (const look of source.looks) ids.set(look.id, randomUUID());
    function remap(value: unknown): unknown {
      if (typeof value === 'string') return ids.get(value) ?? value;
      if (Array.isArray(value)) return value.map(remap);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, remap(item)]),
        );
      return value;
    }
    const parameters = JSON.stringify(remap(JSON.parse(source.parameters)));
    const created = await db.project.create({
      data: {
        id: ids.get(source.id),
        name: `${source.name.slice(0, 140)} (copie)`,
        type: source.type,
        description: source.description,
        parameters,
        media: { create: media },
        looks: {
          create: source.looks.map((look) => ({
            id: ids.get(look.id),
            name: look.name,
            mannequinId: look.mannequinId,
            garmentMediaIds: JSON.stringify(
              remap(JSON.parse(look.garmentMediaIds)),
            ),
            parameters: JSON.stringify(remap(JSON.parse(look.parameters))),
            outputMediaId: look.outputMediaId
              ? ids.get(look.outputMediaId) || look.outputMediaId
              : null,
          })),
        },
      },
    });
    return publicProject(created);
  } catch (error) {
    await Promise.all(
      copied.map((file) => unlink(resolveMediaPath(file)).catch(() => {})),
    );
    throw error;
  }
}
export async function deleteProject(id: string) {
  await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id } });
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    // Preserve the financial ledger and any active worker inputs.
    const retained = await tx.job.findFirst({
      where: {
        projectId: id,
        OR: [
          {
            providerRequested: true,
            provider: { in: ['runway', 'replicate'] },
          },
          { reservedCents: { gt: 0 } },
          { actualCostCents: { gt: 0 } },
          {
            status: {
              in: [
                'QUEUED',
                'RUNNING',
                'SUBMITTING',
                'PROCESSING',
                'EXPORTING',
              ],
            },
          },
        ],
      },
    });
    if (retained)
      throw new ApiError(
        409,
        'PROJECT_HAS_JOB_HISTORY',
        'Ce projet conserve un historique financier ou une tâche active.',
      );
    await tx.job.deleteMany({ where: { projectId: id } });
    // Source files remain available in the media library after project deletion.
    await tx.project.delete({ where: { id } });
  });
}
export async function archiveProject(id: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      media: true,
      jobs: true,
      looks: { include: { mannequin: true } },
    },
  });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  const archiveMedia = await includeReferencedMedia(project);
  const brandPresets = await db.brandPreset.findMany({
    where: { logoMediaId: { in: archiveMedia.map((media) => media.id) } },
  });
  for (const media of archiveMedia) {
    if (!(await stat(resolveMediaPath(media.path)).catch(() => null)))
      throw new ApiError(409, 'MEDIA_FILE_MISSING');
  }
  const output = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', (error) => output.destroy(error));
  archive.on('warning', (error) => output.destroy(error));
  output.on('close', () => archive.abort());
  archive.pipe(output);
  const backup = {
    format: 'yassdem-project-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    brandPresets,
    project: {
      ...publicProject(project),
      media: undefined,
      jobs: undefined,
      looks: undefined,
    },
    looks: project.looks.map((look) => ({
      ...look,
      garmentMediaIds: JSON.parse(look.garmentMediaIds),
      parameters: JSON.parse(look.parameters),
      mannequin: look.mannequin
        ? {
            ...look.mannequin,
            parameters: JSON.parse(look.mannequin.parameters),
          }
        : null,
    })),
    media: archiveMedia.map((media) => ({
      ...publicMedia(media),
      url: undefined,
      archivePath: `media/${media.id}${path.extname(media.path)}`,
    })),
    jobs: project.jobs.map((job) => ({
      ...job,
      parameters: JSON.parse(job.parameters),
    })),
  };
  archive.append(JSON.stringify(backup, null, 2), { name: 'project.json' });
  for (const media of archiveMedia)
    archive.file(resolveMediaPath(media.path), {
      name: `media/${media.id}${path.extname(media.path)}`,
    });
  void archive.finalize().catch((error) => output.destroy(error));
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="yassdem-${id}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
