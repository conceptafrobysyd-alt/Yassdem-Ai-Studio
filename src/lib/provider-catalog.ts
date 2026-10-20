import { ComfyUIProvider } from './providers/comfyui';
import { OllamaProvider } from './providers/ollama';
import {
  readReplicateConfiguration,
  ReplicateProvider,
} from './providers/replicate';
import {
  estimateRunwayCost,
  RUNWAY_MODEL,
  RunwayProvider,
} from './providers/runway';

export type CatalogProvider =
  'local' | 'runway' | 'replicate' | 'comfyui' | 'ollama';
export type CatalogOutput = 'image' | 'video' | 'text';
export interface ModelParameter {
  key: string;
  type: 'text' | 'image' | 'images' | 'integer' | 'enum' | 'object';
  required: boolean;
  values?: (string | number)[];
  min?: number;
  max?: number;
  maxLength?: number;
}
export interface ProviderCatalogModel {
  id: string;
  provider: CatalogProvider;
  label: string;
  outputKind: CatalogOutput;
  ai: boolean;
  configured: boolean;
  // A configured adapter is never proof of model access or successful inference.
  access: 'not-required' | 'unverified';
  configurationCode?: string;
  parameters: ModelParameter[];
  nativeSizes?: { width: number; height: number }[];
  cost: {
    kind: 'local' | 'runway-estimate' | 'manual-reservation';
    currency: 'EUR';
    amountCents?: number;
    durationEstimates?: { seconds: number; amountCents: number }[];
    usdToEur?: number;
  };
}

/** Available for selection in the video studio, not proof of account access. */
export function getReplicateVideoConfiguration() {
  try {
    const config = readReplicateConfiguration();
    if (config.outputKind !== 'video' || !new ReplicateProvider().configured)
      return null;
    return config;
  } catch {
    return null;
  }
}

/** Catalog of implemented adapter contracts, not an invented provider account
 * inventory. It never calls provider endpoints, creates predictions or pulls
 * model weights. Comfy workflows are validated from administrator-owned files.
 */
export async function getProviderCatalog(options: { usdToEur?: number } = {}) {
  const rate = options.usdToEur ?? 1;
  const models: ProviderCatalogModel[] = [
    {
      id: 'ffmpeg',
      provider: 'local',
      label: 'FFmpeg',
      outputKind: 'video',
      ai: false,
      configured: true,
      access: 'not-required',
      parameters: [
        { key: 'image', type: 'image', required: true },
        {
          key: 'durationSeconds',
          type: 'enum',
          required: true,
          values: [5, 10, 15],
        },
        {
          key: 'format',
          type: 'enum',
          required: true,
          values: ['9:16', '4:5', '1:1', '16:9'],
        },
        {
          key: 'resolution',
          type: 'enum',
          required: true,
          values: [720, 1080, 1440, 2160],
        },
        {
          key: 'codec',
          type: 'enum',
          required: false,
          values: ['h264', 'h265'],
        },
        { key: 'quality', type: 'integer', required: false, min: 18, max: 32 },
      ],
      cost: { kind: 'local', currency: 'EUR', amountCents: 0 },
    },
    {
      id: RUNWAY_MODEL,
      provider: 'runway',
      label: 'Runway Gen-4 Turbo',
      outputKind: 'video',
      ai: true,
      configured: new RunwayProvider().configured,
      access: 'unverified',
      parameters: [
        { key: 'image', type: 'image', required: true },
        { key: 'prompt', type: 'text', required: true, maxLength: 1000 },
        {
          key: 'durationSeconds',
          type: 'enum',
          required: true,
          values: [5, 10],
        },
        {
          key: 'nativeRatio',
          type: 'enum',
          required: true,
          values: ['1280:720', '720:1280', '960:960'],
        },
      ],
      nativeSizes: [
        { width: 1280, height: 720 },
        { width: 720, height: 1280 },
        { width: 960, height: 960 },
      ],
      cost: {
        kind: 'runway-estimate',
        currency: 'EUR',
        usdToEur: rate,
        durationEstimates: [5, 10].map((seconds) => ({
          seconds,
          amountCents: estimateRunwayCost(seconds as 5 | 10, rate).eurCents,
        })),
      },
    },
  ];
  try {
    const config = readReplicateConfiguration();
    models.push({
      id: config.version,
      provider: 'replicate',
      label: 'Replicate',
      outputKind: config.outputKind,
      ai: true,
      configured: new ReplicateProvider().configured,
      access: 'unverified',
      parameters: [
        { key: 'prompt', type: 'text', required: true, maxLength: 6000 },
        { key: 'image', type: 'image', required: false },
      ],
      cost: {
        kind: 'manual-reservation',
        currency: 'EUR',
        amountCents: config.estimateCents,
      },
    });
  } catch {
    // Without a valid immutable model configuration, there is no selectable
    // Replicate model to announce. The provider status explains configuration.
  }
  for (const mode of ['fashion-image', 'try-on'] as const) {
    if (
      !(mode === 'fashion-image'
        ? process.env.COMFYUI_FASHION_WORKFLOW
        : process.env.COMFYUI_TRYON_WORKFLOW)
    )
      continue;
    try {
      const workflow = await new ComfyUIProvider().loadWorkflow(mode);
      models.push({
        id: mode,
        provider: 'comfyui',
        label: 'ComfyUI',
        outputKind: 'image',
        ai: true,
        configured: true,
        access: 'unverified',
        parameters: [
          {
            key: 'garments',
            type: 'images',
            required: true,
            min: 1,
            max: workflow.garmentSlots === 'array' ? 8 : workflow.garmentSlots,
          },
          { key: 'prompt', type: 'text', required: false, maxLength: 2000 },
          { key: 'mannequin', type: 'object', required: mode === 'try-on' },
          ...(mode === 'try-on'
            ? [{ key: 'portrait', type: 'image' as const, required: true }]
            : []),
        ],
        cost: { kind: 'local', currency: 'EUR', amountCents: 0 },
      });
    } catch {
      // Invalid graph files are not catalogued as configured models.
    }
  }
  try {
    const provider = new OllamaProvider();
    if (provider.configured)
      models.push({
        id: process.env.OLLAMA_MODEL!,
        provider: 'ollama',
        label: 'Ollama',
        outputKind: 'text',
        ai: true,
        configured: true,
        access: 'unverified',
        parameters: [
          { key: 'prompt', type: 'text', required: true, maxLength: 12000 },
          {
            key: 'language',
            type: 'enum',
            required: true,
            values: ['fr', 'en', 'both'],
          },
          {
            key: 'maxTokens',
            type: 'integer',
            required: false,
            min: 128,
            max: 4096,
          },
        ],
        cost: { kind: 'local', currency: 'EUR', amountCents: 0 },
      });
  } catch {
    // An invalid local endpoint or tag never becomes a selectable model.
  }
  return { version: 1 as const, accountInventory: false as const, models };
}
