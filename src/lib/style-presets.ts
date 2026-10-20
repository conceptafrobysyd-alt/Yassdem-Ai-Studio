import type { StylePreset as StoredStylePreset } from '@prisma/client';
import { db } from './db';
import { ApiError, boundedString } from './http';
import {
  DEFAULT_STYLE_PARAMETERS,
  STYLE_DESCRIPTOR_KEYS,
  type StylePreset,
  type StylePresetParameters,
} from './style-preset-values';

const id = (value: string) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new ApiError(400, 'INVALID_STYLE_PRESET');
  return value;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(400, 'INVALID_STYLE_PRESET');
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new ApiError(400, 'INVALID_STYLE_PRESET');
}
function cleanText(value: unknown, max: number, empty = false) {
  const text = boundedString(value, 'style', max, empty);
  if (/[\x00-\x1f\x7f]/.test(text))
    throw new ApiError(400, 'INVALID_STYLE_PRESET');
  return text;
}
export function validateStylePresetParameters(
  value: unknown,
): StylePresetParameters {
  const input = object(value);
  onlyKeys(input, Object.keys(DEFAULT_STYLE_PARAMETERS));
  const result = {
    ...DEFAULT_STYLE_PARAMETERS,
    colors: [] as string[],
    accessories: [] as string[],
  };
  if ('fit' in input) {
    if (
      !['regular', 'fitted', 'relaxed', 'oversized', 'custom'].includes(
        input.fit as string,
      )
    )
      throw new ApiError(400, 'INVALID_STYLE_PRESET');
    result.fit = input.fit as StylePresetParameters['fit'];
  }
  for (const key of STYLE_DESCRIPTOR_KEYS)
    if (key in input) result[key] = cleanText(input[key], 200, true);
  for (const key of ['colors', 'accessories'] as const)
    if (key in input) {
      const list = input[key];
      if (!Array.isArray(list) || list.length > 12)
        throw new ApiError(400, 'INVALID_STYLE_PRESET');
      result[key] = [...new Set(list.map((item) => cleanText(item, 100)))];
    }
  return result;
}
function publicPreset(value: StoredStylePreset): StylePreset {
  return {
    ...value,
    parameters: validateStylePresetParameters(JSON.parse(value.parameters)),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function values(input: Record<string, unknown>, previous?: StylePreset) {
  onlyKeys(input, ['name', 'parameters']);
  const name = 'name' in input ? cleanText(input.name, 100) : previous?.name;
  if (!name) throw new ApiError(400, 'INVALID_STYLE_PRESET');
  return {
    name,
    parameters: JSON.stringify(
      'parameters' in input
        ? validateStylePresetParameters(input.parameters)
        : (previous?.parameters ?? DEFAULT_STYLE_PARAMETERS),
    ),
  };
}
export async function listStylePresets() {
  return (
    await db.stylePreset.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })
  ).map(publicPreset);
}
export async function getStylePreset(presetId: string) {
  const preset = await db.stylePreset.findUnique({
    where: { id: id(presetId) },
  });
  if (!preset) throw new ApiError(404, 'STYLE_PRESET_NOT_FOUND');
  return publicPreset(preset);
}
export async function createStylePreset(input: Record<string, unknown>) {
  const data = values(input);
  return db.$transaction(async (tx) => {
    if ((await tx.stylePreset.count()) >= 100)
      throw new ApiError(409, 'STYLE_PRESET_LIMIT');
    return publicPreset(await tx.stylePreset.create({ data }));
  });
}
export async function updateStylePreset(
  presetId: string,
  input: Record<string, unknown>,
) {
  id(presetId);
  return db.$transaction(async (tx) => {
    const stored = await tx.stylePreset.findUnique({ where: { id: presetId } });
    if (!stored) throw new ApiError(404, 'STYLE_PRESET_NOT_FOUND');
    const data = values(input, publicPreset(stored));
    return publicPreset(
      await tx.stylePreset.update({ where: { id: presetId }, data }),
    );
  });
}
export async function deleteStylePreset(presetId: string) {
  const result = await db.stylePreset.deleteMany({
    where: { id: id(presetId) },
  });
  if (!result.count) throw new ApiError(404, 'STYLE_PRESET_NOT_FOUND');
}
