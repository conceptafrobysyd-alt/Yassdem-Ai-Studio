import type { BrandPreset as StoredBrandPreset, Prisma } from '@prisma/client';
import { db } from './db';
import { ApiError, boundedString } from './http';
import type { LogoPosition } from './export';

export interface BrandPresetValues {
  name: string;
  logoMediaId: string | null;
  logoSize: number;
  logoOpacity: number;
  logoPosition: LogoPosition;
  logoFade: boolean;
}
export interface BrandPreset extends BrandPresetValues {
  id: string;
  createdAt: string;
  updatedAt: string;
}
const DEFAULTS: BrandPresetValues = {
  name: '',
  logoMediaId: null,
  logoSize: 15,
  logoOpacity: 0.8,
  logoPosition: 'bottom-right',
  logoFade: false,
};
const POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
];
function publicPreset(value: StoredBrandPreset): BrandPreset {
  return {
    ...value,
    logoPosition: value.logoPosition as LogoPosition,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function validate(
  input: Record<string, unknown>,
  previous: BrandPresetValues = DEFAULTS,
): BrandPresetValues {
  if (Object.keys(input).some((key) => !Object.hasOwn(DEFAULTS, key)))
    throw new ApiError(400, 'INVALID_BRAND_PRESET');
  const value = { ...previous, ...input };
  const name = boundedString(value.name, 'name', 80);
  if (/[\x00-\x1f\x7f]/.test(name))
    throw new ApiError(400, 'INVALID_BRAND_PRESET');
  if (
    value.logoMediaId !== null &&
    (typeof value.logoMediaId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(value.logoMediaId))
  )
    throw new ApiError(400, 'INVALID_LOGO');
  if (
    typeof value.logoSize !== 'number' ||
    !Number.isInteger(value.logoSize) ||
    value.logoSize < 3 ||
    value.logoSize > 50 ||
    typeof value.logoOpacity !== 'number' ||
    !Number.isFinite(value.logoOpacity) ||
    value.logoOpacity < 0 ||
    value.logoOpacity > 1 ||
    typeof value.logoPosition !== 'string' ||
    !POSITIONS.includes(value.logoPosition) ||
    typeof value.logoFade !== 'boolean'
  )
    throw new ApiError(400, 'INVALID_BRAND_PRESET');
  return {
    name,
    logoMediaId: value.logoMediaId as string | null,
    logoSize: value.logoSize,
    logoOpacity: value.logoOpacity,
    logoPosition: value.logoPosition as LogoPosition,
    logoFade: value.logoFade,
  };
}
async function checkLogo(
  tx: Prisma.TransactionClient,
  logoMediaId: string | null,
) {
  if (
    logoMediaId &&
    !(await tx.media.findFirst({
      where: {
        id: logoMediaId,
        role: 'LOGO',
        mimeType: { in: ['image/png', 'image/jpeg', 'image/webp'] },
      },
    }))
  )
    throw new ApiError(400, 'INVALID_LOGO');
}
export async function listBrandPresets() {
  return (
    await db.brandPreset.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })
  ).map(publicPreset);
}
export async function getBrandPreset(id: string) {
  const preset = await db.brandPreset.findUnique({ where: { id } });
  if (!preset) throw new ApiError(404, 'BRAND_PRESET_NOT_FOUND');
  return publicPreset(preset);
}
export async function createBrandPreset(input: Record<string, unknown>) {
  const values = validate(input);
  return db.$transaction(async (tx) => {
    if ((await tx.brandPreset.count()) >= 100)
      throw new ApiError(409, 'BRAND_PRESET_LIMIT');
    await checkLogo(tx, values.logoMediaId);
    return publicPreset(await tx.brandPreset.create({ data: values }));
  });
}
export async function updateBrandPreset(
  id: string,
  input: Record<string, unknown>,
) {
  return db.$transaction(async (tx) => {
    const previous = await tx.brandPreset.findUnique({ where: { id } });
    if (!previous) throw new ApiError(404, 'BRAND_PRESET_NOT_FOUND');
    const values = validate(input, publicPreset(previous));
    await checkLogo(tx, values.logoMediaId);
    return publicPreset(
      await tx.brandPreset.update({ where: { id }, data: values }),
    );
  });
}
export async function deleteBrandPreset(id: string) {
  const result = await db.brandPreset.deleteMany({ where: { id } });
  if (!result.count) throw new ApiError(404, 'BRAND_PRESET_NOT_FOUND');
}
