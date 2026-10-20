import { ComfyUIProvider } from './comfyui';
import { OllamaError, OllamaProvider } from './ollama';
import {
  readReplicateConfiguration,
  REPLICATE_ESTIMATE_ASSUMPTION,
  ReplicateError,
  ReplicateProvider,
} from './replicate';
import { RunwayProvider } from './runway';

export interface ProviderStatus {
  id: 'local' | 'runway' | 'replicate' | 'comfyui' | 'ollama';
  capabilities: string[];
  configured: boolean;
  connection: 'unchecked' | 'connected' | 'unavailable';
  code?: string;
  model?: string;
  estimateCents?: number;
  estimateAssumption?: string;
  outputKind?: 'image' | 'video';
  supportedModels?: string[];
}

/** Safe configuration metadata only: no token, endpoint, file path, provider
 * account response, signed asset URL, or arbitrary environment value is returned.
 * Connection checks perform read-only requests and never start a generation.
 */
export async function getProviderRegistry(
  options: { checkConnections?: boolean } = {},
): Promise<ProviderStatus[]> {
  const check = options.checkConnections === true;
  const runway = new RunwayProvider();
  const replicate = new ReplicateProvider();
  let replicateConfig:
    ReturnType<typeof readReplicateConfiguration> | undefined;
  let replicateCode: string | undefined;
  try {
    replicateConfig = readReplicateConfiguration();
  } catch (error) {
    replicateCode =
      error instanceof ReplicateError ? error.code : 'REPLICATE_NOT_CONFIGURED';
  }
  let ollama: OllamaProvider | undefined;
  let ollamaCode: string | undefined;
  try {
    ollama = new OllamaProvider();
  } catch (error) {
    ollamaCode =
      error instanceof OllamaError ? error.code : 'OLLAMA_NOT_CONFIGURED';
  }
  const statuses: ProviderStatus[] = [
    {
      id: 'local',
      capabilities: ['still-image-animation', 'video-export'],
      configured: true,
      connection: 'unchecked',
      model: 'ffmpeg',
      supportedModels: ['ffmpeg'],
    },
    {
      id: 'runway',
      capabilities: ['image-to-video'],
      configured: runway.configured,
      connection: 'unchecked',
      model: 'gen4_turbo',
      supportedModels: ['gen4_turbo'],
    },
    {
      id: 'replicate',
      capabilities: replicateConfig
        ? [
            replicateConfig.outputKind === 'image'
              ? 'prompt-to-image'
              : 'prompt-to-video',
          ]
        : [],
      configured: replicate.configured && Boolean(replicateConfig),
      connection: 'unchecked',
      ...(replicateConfig
        ? {
            model: replicateConfig.version,
            supportedModels: [replicateConfig.version],
            estimateCents: replicateConfig.estimateCents,
            outputKind: replicateConfig.outputKind,
            estimateAssumption: REPLICATE_ESTIMATE_ASSUMPTION,
          }
        : {}),
      ...(!replicate.configured
        ? { code: 'REPLICATE_NOT_CONFIGURED' }
        : replicateCode
          ? { code: replicateCode }
          : {}),
    },
    {
      id: 'comfyui',
      capabilities: ['fashion-image', 'try-on'],
      configured: Boolean(
        process.env.COMFYUI_FASHION_WORKFLOW ||
        process.env.COMFYUI_TRYON_WORKFLOW,
      ),
      connection: 'unchecked',
      supportedModels: [
        ...(process.env.COMFYUI_FASHION_WORKFLOW ? ['fashion-image'] : []),
        ...(process.env.COMFYUI_TRYON_WORKFLOW ? ['try-on'] : []),
      ],
    },
    {
      id: 'ollama',
      capabilities: ['marketing-json'],
      configured: Boolean(ollama?.configured),
      connection: 'unchecked',
      ...(ollama?.configured
        ? {
            model: process.env.OLLAMA_MODEL,
            supportedModels: [process.env.OLLAMA_MODEL!],
          }
        : {}),
      ...(ollamaCode
        ? { code: ollamaCode }
        : !ollama?.configured
          ? { code: 'OLLAMA_MODEL_REQUIRED' }
          : {}),
    },
  ];
  if (!check) return statuses;
  await Promise.all(
    statuses
      .filter((status) => status.id !== 'local')
      .map(async (status) => {
        if (!status.configured) return;
        let result: { ok: boolean; code?: string };
        try {
          result =
            status.id === 'runway'
              ? await runway.checkConnection()
              : status.id === 'replicate'
                ? await replicate.checkConnection()
                : status.id === 'ollama'
                  ? await ollama!.checkConnection()
                  : await new ComfyUIProvider().checkConnection();
        } catch {
          result = { ok: false, code: 'PROVIDER_UNAVAILABLE' };
        }
        status.connection = result.ok ? 'connected' : 'unavailable';
        if (result.code) status.code = result.code;
      }),
  );
  return statuses;
}
