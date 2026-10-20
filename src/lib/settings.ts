import { db } from '@/lib/db';
import { getAuthSettings } from '@/lib/auth';
import { ApiError } from '@/lib/http';
import type { Settings } from '@prisma/client';
import { getReplicateVideoConfiguration } from './provider-catalog';

function array(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
export function publicSettings(settings: Settings) {
  const { passwordHash: _passwordHash, ...safe } = settings;
  return {
    ...safe,
    preferredStyles: array(settings.preferredStyles),
    customStyles: array(settings.customStyles),
  };
}
export async function getSettings() {
  return publicSettings(await getAuthSettings());
}

export async function updateSettings(input: Record<string, unknown>) {
  const allowed = new Set([
    'locale',
    'theme',
    'contentLocale',
    'preferredStyles',
    'customStyles',
    'hijab',
    'activeLogoId',
    'preferredResolution',
    'preferredFormat',
    'defaultProvider',
    'monthlyBudgetCents',
    'providerEnabled',
    'replicateEnabled',
    'usdToEur',
    'logoSize',
    'logoOpacity',
    'logoPosition',
    'logoFade',
  ]);
  const data: Record<string, string | number | boolean | null> = {};
  const choices: Record<string, readonly (string | number)[]> = {
    locale: ['fr', 'en'],
    theme: ['light', 'dark'],
    contentLocale: ['fr', 'en'],
    preferredResolution: [720, 1080, 1440, 2160],
    preferredFormat: ['9:16', '4:5', '1:1', '16:9'],
    defaultProvider: ['local', 'runway', 'replicate'],
    logoPosition: [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'center',
    ],
  };
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key))
      throw new ApiError(
        400,
        'INVALID_SETTINGS',
        `Paramètre inconnu : ${key}.`,
      );
    if (key in choices) {
      if (!choices[key].includes(value as string | number))
        throw new ApiError(
          400,
          'INVALID_SETTINGS',
          `Valeur invalide : ${key}.`,
        );
      if (
        key === 'defaultProvider' &&
        value === 'replicate' &&
        !getReplicateVideoConfiguration()
      )
        throw new ApiError(400, 'REPLICATE_VIDEO_MODEL_REQUIRED');
      data[key] = value as string | number;
    } else if (key === 'preferredStyles' || key === 'customStyles') {
      if (
        !Array.isArray(value) ||
        value.length > 30 ||
        value.some(
          (item) =>
            typeof item !== 'string' || item.length > 100 || !item.trim(),
        )
      )
        throw new ApiError(400, 'INVALID_SETTINGS');
      data[key] = JSON.stringify([
        ...new Set(value.map((item) => (item as string).trim())),
      ]);
    } else if (
      key === 'hijab' ||
      key === 'providerEnabled' ||
      key === 'replicateEnabled' ||
      key === 'logoFade'
    ) {
      if (typeof value !== 'boolean')
        throw new ApiError(400, 'INVALID_SETTINGS');
      data[key] = value;
    } else if (key === 'activeLogoId') {
      if (value !== null && typeof value !== 'string')
        throw new ApiError(400, 'INVALID_SETTINGS');
      if (
        typeof value === 'string' &&
        !(await db.media.findFirst({
          where: {
            id: value,
            role: 'LOGO',
            mimeType: { startsWith: 'image/' },
          },
        }))
      )
        throw new ApiError(400, 'INVALID_LOGO');
      data[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new ApiError(400, 'INVALID_SETTINGS');
      if (
        key === 'monthlyBudgetCents' &&
        (!Number.isInteger(value) || value < 0 || value > 100_000_000)
      )
        throw new ApiError(400, 'INVALID_SETTINGS');
      if (key === 'usdToEur' && (value < 0.1 || value > 10))
        throw new ApiError(400, 'INVALID_SETTINGS');
      if (
        key === 'logoSize' &&
        (!Number.isInteger(value) || value < 3 || value > 50)
      )
        throw new ApiError(400, 'INVALID_SETTINGS');
      if (key === 'logoOpacity' && (value < 0 || value > 1))
        throw new ApiError(400, 'INVALID_SETTINGS');
      data[key] = value;
    }
  }
  await getAuthSettings();
  return publicSettings(
    await db.settings.update({ where: { id: 'default' }, data }),
  );
}
