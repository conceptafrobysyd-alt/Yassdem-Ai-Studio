import { db } from './db';
import { ApiError } from './http';

const choices: Record<string, readonly (string | number)[]> = {
  provider: ['local', 'runway', 'replicate'],
  duration: [5, 10, 15],
  format: ['9:16', '4:5', '1:1', '16:9'],
  resolution: [720, 1080, 1440, 2160],
  codec: ['h264', 'h265'],
  quality: ['high', 'balanced', 'compressed'],
  logoPosition: [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'center',
  ],
  logoAnimation: ['none', 'fade'],
  logoTiming: ['all', 'start', 'end'],
};
const textLimits: Record<string, number> = {
  prompt: 6000,
  preset: 100,
  decor: 100,
  camera: 100,
};
const ids = new Set(['sourceMediaId', 'logoMediaId']);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

function validate(input: unknown) {
  if (
    !record(input) ||
    Object.keys(input).length !== 1 ||
    !record(input.parameters)
  )
    throw new ApiError(400, 'INVALID_PRODUCT_STATE');
  const parameters = input.parameters;
  for (const [key, value] of Object.entries(parameters)) {
    if (Object.hasOwn(choices, key)) {
      if (!choices[key].includes(value as string | number))
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else if (Object.hasOwn(textLimits, key)) {
      if (typeof value !== 'string' || value.length > textLimits[key])
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else if (ids.has(key)) {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{0,128}$/.test(value))
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else if (key === 'logoSize') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 3 ||
        value > 50
      )
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else if (key === 'logoOpacity') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1
      )
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else if (key === 'stylePreferences') {
      if (
        !record(value) ||
        Object.keys(value).length > 6 ||
        Object.entries(value).some(
          ([k, v]) =>
            ![
              'fit',
              'colors',
              'accessories',
              'coverage',
              'mood',
              'body',
            ].includes(k) ||
            typeof v !== 'string' ||
            v.length > 1000,
        )
      )
        throw new ApiError(400, 'INVALID_PRODUCT_STATE');
    } else throw new ApiError(400, 'INVALID_PRODUCT_STATE');
  }
  return parameters;
}

/** Merge only product controls against the latest row, preserving other ateliers. */
export async function saveProductState(projectId: string, input: unknown) {
  const parameters = validate(input);
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    let existing: unknown;
    try {
      existing = JSON.parse(project.parameters);
    } catch {
      throw new ApiError(409, 'INVALID_PARAMETERS');
    }
    if (!record(existing)) throw new ApiError(409, 'INVALID_PARAMETERS');
    const merged = { ...existing, ...parameters };
    const serialized = JSON.stringify(merged);
    if (serialized.length > 20000)
      throw new ApiError(400, 'INVALID_PARAMETERS');
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { parameters: serialized },
    });
    return { ...updated, parameters: merged };
  });
}
