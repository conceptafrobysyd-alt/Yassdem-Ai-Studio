import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import type { Look, Mannequin, Media, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError, boundedString } from '@/lib/http';
import { publicMedia, resolveMediaPath } from '@/lib/media';

export interface MannequinParameters {
  skinTone: string;
  bodyType: string;
  heightCm: number;
  hair: string;
  hijab: boolean;
  pose: string;
}
export interface LookParameters {
  styles: string[];
  fit: 'regular' | 'fitted' | 'relaxed' | 'oversized' | 'custom';
  colors: string[];
  accessories: string[];
  coverage: string;
  mood: string;
  length: string;
  layering: string;
  decor: string;
  pose: string;
  bodyFeatures: string;
  prompt: string;
}
export const DEFAULT_MANNEQUIN: MannequinParameters = {
  skinTone: '',
  bodyType: '',
  heightCm: 170,
  hair: '',
  hijab: false,
  pose: 'standing',
};
export const DEFAULT_LOOK: LookParameters = {
  styles: [],
  fit: 'regular',
  colors: [],
  accessories: [],
  coverage: '',
  mood: '',
  length: '',
  layering: '',
  decor: '',
  pose: '',
  bodyFeatures: '',
  prompt: '',
};
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACTIVE_STATUSES = [
  'QUEUED',
  'RUNNING',
  'SUBMITTING',
  'PROCESSING',
  'EXPORTING',
];
const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new ApiError(400, 'INVALID_INPUT');
  return value;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, 'INVALID_PARAMETERS');
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ApiError(400, 'INVALID_INPUT');
}
function parseStored<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
function canonicalJson(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, ordered(child)]),
      );
    return item;
  }
  return JSON.stringify(ordered(value));
}
function sameParameters(a: string, b: string, defaults: object) {
  return (
    canonicalJson({ ...defaults, ...parseStored(a, {}) }) ===
    canonicalJson({ ...defaults, ...parseStored(b, {}) })
  );
}
function nextVersion(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}
function stringList(value: unknown, maximum = 12): string[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new ApiError(400, 'INVALID_PARAMETERS');
  return [...new Set(value.map((item) => boundedString(item, 'list', 100)))];
}
export function validateMannequinParameters(
  value: unknown,
): MannequinParameters {
  const input = object(value);
  onlyKeys(input, Object.keys(DEFAULT_MANNEQUIN));
  const result = { ...DEFAULT_MANNEQUIN };
  for (const key of ['skinTone', 'bodyType', 'hair', 'pose'] as const)
    if (key in input) result[key] = boundedString(input[key], key, 120, true);
  if ('heightCm' in input) {
    if (
      typeof input.heightCm !== 'number' ||
      !Number.isFinite(input.heightCm) ||
      input.heightCm < 100 ||
      input.heightCm > 230
    )
      throw new ApiError(400, 'INVALID_HEIGHT');
    result.heightCm = Math.round(input.heightCm);
  }
  if ('hijab' in input) {
    if (typeof input.hijab !== 'boolean')
      throw new ApiError(400, 'INVALID_PARAMETERS');
    result.hijab = input.hijab;
  }
  return result;
}
export function validateLookParameters(value: unknown): LookParameters {
  const input = object(value);
  onlyKeys(input, Object.keys(DEFAULT_LOOK));
  const result = { ...DEFAULT_LOOK };
  for (const key of ['styles', 'colors', 'accessories'] as const)
    if (key in input) result[key] = stringList(input[key]);
  if ('fit' in input) {
    if (
      !['regular', 'fitted', 'relaxed', 'oversized', 'custom'].includes(
        input.fit as string,
      )
    )
      throw new ApiError(400, 'INVALID_FIT');
    result.fit = input.fit as LookParameters['fit'];
  }
  for (const key of [
    'coverage',
    'mood',
    'length',
    'layering',
    'decor',
    'pose',
    'bodyFeatures',
    'prompt',
  ] as const)
    if (key in input)
      result[key] = boundedString(
        input[key],
        key,
        key === 'prompt' ? 2000 : 200,
        true,
      );
  return result;
}
export function publicMannequin(mannequin: Mannequin) {
  return {
    ...mannequin,
    parameters: parseStored(mannequin.parameters, DEFAULT_MANNEQUIN),
  };
}
export async function listMannequins() {
  return (await db.mannequin.findMany({ orderBy: { updatedAt: 'desc' } })).map(
    publicMannequin,
  );
}
export async function getMannequin(id: string) {
  const mannequin = await db.mannequin.findUnique({
    where: { id: identifier(id) },
  });
  if (!mannequin) throw new ApiError(404, 'MANNEQUIN_NOT_FOUND');
  return publicMannequin(mannequin);
}
async function validateImage(tx: Prisma.TransactionClient, id: string) {
  const media = await tx.media.findUnique({ where: { id } });
  if (!media || !IMAGE_TYPES.includes(media.mimeType) || media.role === 'LOGO')
    throw new ApiError(400, 'INVALID_FASHION_IMAGE');
  return media;
}
function mannequinInput(input: Record<string, unknown>, creating: boolean) {
  onlyKeys(input, ['name', 'description', 'parameters', 'referenceMediaId']);
  const data: {
    name?: string;
    description?: string;
    parameters?: string;
    referenceMediaId?: string | null;
  } = {};
  if (creating || 'name' in input)
    data.name = boundedString(input.name, 'name', 150);
  if ('description' in input)
    data.description = boundedString(
      input.description,
      'description',
      2000,
      true,
    );
  if (creating || 'parameters' in input)
    data.parameters = JSON.stringify(
      validateMannequinParameters(input.parameters ?? {}),
    );
  if ('referenceMediaId' in input)
    data.referenceMediaId =
      input.referenceMediaId === null
        ? null
        : identifier(input.referenceMediaId);
  return data;
}
export async function createMannequin(input: Record<string, unknown>) {
  const data = mannequinInput(input, true);
  return db.$transaction(async (tx) => {
    if (data.referenceMediaId) await validateImage(tx, data.referenceMediaId);
    return publicMannequin(
      await tx.mannequin.create({ data: { ...data, name: data.name! } }),
    );
  });
}
export async function updateMannequin(
  id: string,
  input: Record<string, unknown>,
) {
  identifier(id);
  const data = mannequinInput(input, false);
  return db.$transaction(async (tx) => {
    const current = await tx.mannequin.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'MANNEQUIN_NOT_FOUND');
    const changed = Object.entries(data).some(([key, value]) =>
      key === 'parameters'
        ? !sameParameters(
            current.parameters,
            value as string,
            DEFAULT_MANNEQUIN,
          )
        : current[key as keyof Mannequin] !== value,
    );
    if (!changed) return publicMannequin(current);
    const looks = await tx.look.findMany({
      where: { mannequinId: id },
      select: { id: true, updatedAt: true },
    });
    for (const look of looks) await assertNoActiveRender(tx, look.id);
    if (data.referenceMediaId) await validateImage(tx, data.referenceMediaId);
    for (const look of looks)
      await tx.look.update({
        where: { id: look.id },
        data: { outputMediaId: null, updatedAt: nextVersion(look.updatedAt) },
      });
    return publicMannequin(
      await tx.mannequin.update({
        where: { id },
        data: { ...data, updatedAt: nextVersion(current.updatedAt) },
      }),
    );
  });
}
export async function deleteMannequin(id: string) {
  return db.$transaction(async (tx) => {
    // Keep a reusable model while a look still refers to it; delete the look or
    // explicitly detach its mannequin first. Active jobs keep their snapshots.
    if (await tx.look.findFirst({ where: { mannequinId: identifier(id) } }))
      throw new ApiError(409, 'MANNEQUIN_IN_USE');
    await tx.mannequin.delete({ where: { id } });
  });
}
function garmentIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    throw new ApiError(400, 'INVALID_GARMENTS');
  const ids = value.map(identifier);
  if (new Set(ids).size !== ids.length)
    throw new ApiError(400, 'INVALID_GARMENTS');
  return ids;
}
function lookInput(input: Record<string, unknown>, creating: boolean) {
  onlyKeys(input, [
    'name',
    'projectId',
    'mannequinId',
    'garmentMediaIds',
    'parameters',
  ]);
  const data: {
    name?: string;
    projectId?: string;
    mannequinId?: string | null;
    garmentMediaIds?: string;
    parameters?: string;
  } = {};
  if (creating || 'name' in input)
    data.name = boundedString(input.name, 'name', 150);
  if (creating || 'projectId' in input)
    data.projectId = identifier(input.projectId);
  if ('mannequinId' in input)
    data.mannequinId =
      input.mannequinId === null ? null : identifier(input.mannequinId);
  if (creating || 'garmentMediaIds' in input)
    data.garmentMediaIds = JSON.stringify(garmentIds(input.garmentMediaIds));
  if (creating || 'parameters' in input)
    data.parameters = JSON.stringify(
      validateLookParameters(input.parameters ?? {}),
    );
  return data;
}
async function validateLookReferences(
  tx: Prisma.TransactionClient,
  data: ReturnType<typeof lookInput>,
) {
  if (data.projectId) {
    const project = await tx.project.findUnique({
      where: { id: data.projectId },
    });
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    if (!['fashion', 'lookbook'].includes(project.type))
      throw new ApiError(400, 'FASHION_PROJECT_REQUIRED');
  }
  if (
    data.mannequinId &&
    !(await tx.mannequin.findUnique({ where: { id: data.mannequinId } }))
  )
    throw new ApiError(404, 'MANNEQUIN_NOT_FOUND');
  if (data.garmentMediaIds)
    for (const id of JSON.parse(data.garmentMediaIds) as string[])
      await validateImage(tx, id);
}
export async function getLookRenderContext(id: string) {
  const look = await db.look.findUnique({ where: { id: identifier(id) } });
  if (!look) throw new ApiError(404, 'LOOK_NOT_FOUND');
  const ids = parseStored<string[]>(look.garmentMediaIds, []);
  const garments = await db.media.findMany({ where: { id: { in: ids } } });
  const ordered = ids.map((id) => garments.find((item) => item.id === id));
  if (ordered.some((item) => !item || !IMAGE_TYPES.includes(item.mimeType)))
    throw new ApiError(409, 'LOOK_MEDIA_MISSING');
  const mannequin = look.mannequinId
    ? await db.mannequin.findUnique({ where: { id: look.mannequinId } })
    : null;
  const reference = mannequin?.referenceMediaId
    ? await db.media.findUnique({ where: { id: mannequin.referenceMediaId } })
    : null;
  return {
    look,
    mannequin,
    garments: ordered as Media[],
    reference,
    parameters: validateLookParameters(
      parseStored(look.parameters, DEFAULT_LOOK),
    ),
    mannequinParameters: mannequin
      ? parseStored(mannequin.parameters, DEFAULT_MANNEQUIN)
      : null,
  };
}
export async function publicLook(look: Look) {
  const ids = parseStored<string[]>(look.garmentMediaIds, []);
  const [media, mannequin] = await Promise.all([
    db.media.findMany({
      where: {
        id: {
          in: [...ids, ...(look.outputMediaId ? [look.outputMediaId] : [])],
        },
      },
    }),
    look.mannequinId
      ? db.mannequin.findUnique({ where: { id: look.mannequinId } })
      : null,
  ]);
  return {
    ...look,
    garmentMediaIds: ids,
    parameters: validateLookParameters(
      parseStored(look.parameters, DEFAULT_LOOK),
    ),
    mannequin: mannequin ? publicMannequin(mannequin) : null,
    sourceMedia: ids.flatMap((id) => {
      const item = media.find((item) => item.id === id);
      return item ? [publicMedia(item)] : [];
    }),
    outputMedia: media.find((item) => item.id === look.outputMediaId)
      ? publicMedia(media.find((item) => item.id === look.outputMediaId)!)
      : null,
  };
}
export async function getLook(id: string) {
  const look = await db.look.findUnique({ where: { id: identifier(id) } });
  if (!look) throw new ApiError(404, 'LOOK_NOT_FOUND');
  return publicLook(look);
}
export async function listLooks(projectId?: string) {
  if (projectId !== undefined) identifier(projectId);
  return Promise.all(
    (
      await db.look.findMany({
        where: projectId ? { projectId } : undefined,
        orderBy: { updatedAt: 'desc' },
      })
    ).map(publicLook),
  );
}
export async function createLook(input: Record<string, unknown>) {
  const data = lookInput(input, true);
  const look = await db.$transaction(async (tx) => {
    await validateLookReferences(tx, data);
    const look = await tx.look.create({
      data: {
        ...data,
        name: data.name!,
        projectId: data.projectId!,
        garmentMediaIds: data.garmentMediaIds!,
      },
    });
    await tx.project.update({
      where: { id: look.projectId },
      data: { updatedAt: new Date() },
    });
    return look;
  });
  return publicLook(look);
}
async function assertNoActiveRender(
  tx: Prisma.TransactionClient,
  lookId: string,
) {
  const candidates = await tx.job.findMany({
    where: {
      kind: { in: ['lookbook_sheet', 'fashion_image', 'try_on'] },
      status: { in: ACTIVE_STATUSES },
      parameters: { contains: lookId },
    },
    select: { parameters: true },
  });
  if (
    candidates.some(
      (job) =>
        parseStored<{ lookId?: string }>(job.parameters, {}).lookId === lookId,
    )
  )
    throw new ApiError(409, 'LOOK_RENDER_ACTIVE');
}
export async function updateLook(id: string, input: Record<string, unknown>) {
  identifier(id);
  const data = lookInput(input, false);
  const look = await db.$transaction(async (tx) => {
    const current = await tx.look.findUnique({ where: { id } });
    if (!current) throw new ApiError(404, 'LOOK_NOT_FOUND');
    const changed = Object.entries(data).some(([key, value]) => {
      if (key === 'parameters')
        return !sameParameters(
          current.parameters,
          value as string,
          DEFAULT_LOOK,
        );
      if (key === 'garmentMediaIds')
        return (
          canonicalJson(parseStored(current.garmentMediaIds, [])) !==
          canonicalJson(parseStored(value as string, []))
        );
      return current[key as keyof Look] !== value;
    });
    if (!changed) return current;
    await assertNoActiveRender(tx, id);
    await validateLookReferences(tx, data);
    return tx.look.update({
      where: { id },
      data: {
        ...data,
        outputMediaId: null,
        updatedAt: nextVersion(current.updatedAt),
      },
    });
  });
  return publicLook(look);
}
export async function deleteLook(id: string) {
  return db.$transaction(async (tx) => {
    await assertNoActiveRender(tx, identifier(id));
    await tx.look.delete({ where: { id } });
  });
}
export async function duplicateLook(id: string) {
  const look = await db.look.findUnique({ where: { id: identifier(id) } });
  if (!look) throw new ApiError(404, 'LOOK_NOT_FOUND');
  return createLook({
    name: `${look.name.slice(0, 138)} (variante)`,
    projectId: look.projectId,
    mannequinId: look.mannequinId,
    garmentMediaIds: parseStored(look.garmentMediaIds, []),
    parameters: validateLookParameters(
      parseStored(look.parameters, DEFAULT_LOOK),
    ),
  });
}
function xml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (letter) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[letter]!,
  );
}
/** A contact sheet of the real garment images. This never pretends to fit
 * clothes onto a body and makes no generation or inference request. */
export async function composeLookCollage(lookId: string, outputPath: string) {
  const { look, garments, reference, mannequin } =
    await getLookRenderContext(lookId);
  const items = [
    ...(reference
      ? [{ media: reference, label: mannequin?.name || 'Mannequin' }]
      : []),
    ...garments.map((media, index) => ({
      media,
      label: `${index + 1}. ${media.name}`,
    })),
  ];
  if (!items.length || items.length > 9)
    throw new ApiError(400, 'INVALID_GARMENTS');
  const width = 1600,
    gutter = 32,
    header = 160,
    tileWidth = 488,
    tileHeight = 570;
  const columns = Math.min(3, items.length),
    rows = Math.ceil(items.length / columns);
  const height = header + rows * (tileHeight + gutter) + gutter;
  const overlays: OverlayOptions[] = [];
  const title = Buffer.from(
    `<svg width="${width}" height="${header}"><rect width="100%" height="100%" fill="#f8f5ef"/><text x="40" y="58" font-family="sans-serif" font-size="34" font-weight="bold" fill="#252525">${xml(look.name.slice(0, 65))}</text><text x="40" y="105" font-family="sans-serif" font-size="24" fill="#615b53">COLLAGE / CONTACT SHEET — NO VIRTUAL TRY-ON</text><text x="40" y="138" font-family="sans-serif" font-size="18" fill="#615b53">Original garment references • Images originales des vêtements</text></svg>`,
  );
  overlays.push({ input: title, top: 0, left: 0 });
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const left = gutter + (index % columns) * (tileWidth + gutter);
    const top = header + Math.floor(index / columns) * (tileHeight + gutter);
    const image = await sharp(resolveMediaPath(item.media.path), {
      limitInputPixels: 40_000_000,
      animated: false,
    })
      .rotate()
      .resize(tileWidth, tileHeight - 54, {
        fit: 'contain',
        background: '#ffffff',
      })
      .png()
      .toBuffer();
    overlays.push({ input: image, left, top });
    const label = Buffer.from(
      `<svg width="${tileWidth}" height="54"><rect width="100%" height="100%" fill="#ffffff"/><text x="15" y="34" font-family="sans-serif" font-size="20" fill="#252525">${xml(item.label.slice(0, 36))}</text></svg>`,
    );
    overlays.push({ input: label, left, top: top + tileHeight - 54 });
  }
  const info = await sharp({
    create: { width, height, channels: 3, background: '#f8f5ef' },
  })
    .composite(overlays)
    .png()
    .toFile(outputPath);
  return {
    width: info.width,
    height: info.height,
    bytes: info.size,
    sourceKind: 'collage' as const,
    aiGenerated: false as const,
  };
}
