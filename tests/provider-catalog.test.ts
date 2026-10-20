import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getProviderCatalog,
  getReplicateVideoConfiguration,
} from '../src/lib/provider-catalog';

const version = 'c'.repeat(64);
function clearProviders() {
  for (const key of [
    'RUNWAY_API_KEY',
    'REPLICATE_API_TOKEN',
    'REPLICATE_MODEL_VERSION',
    'REPLICATE_OUTPUT_KIND',
    'REPLICATE_ESTIMATE_CENTS',
    'OLLAMA_MODEL',
    'COMFYUI_FASHION_WORKFLOW',
    'COMFYUI_TRYON_WORKFLOW',
  ])
    vi.stubEnv(key, '');
  vi.stubEnv('OLLAMA_URL', 'http://127.0.0.1:11434');
  vi.stubEnv('COMFYUI_URL', 'http://127.0.0.1:8188');
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('truthful supported provider catalog', () => {
  it('lists supported adapters and real parameter limits without inventing configured account models', async () => {
    clearProviders();
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const catalog = await getProviderCatalog({ usdToEur: 1.2 });
    expect(catalog.accountInventory).toBe(false);
    expect(catalog.models.map((model) => model.provider)).toEqual([
      'local',
      'runway',
    ]);
    const local = catalog.models[0];
    expect(local).toMatchObject({
      configured: true,
      ai: false,
      access: 'not-required',
      cost: { amountCents: 0 },
    });
    expect(
      local.parameters.find((parameter) => parameter.key === 'durationSeconds')
        ?.values,
    ).toEqual([5, 10, 15]);
    const runway = catalog.models[1];
    expect(runway).toMatchObject({
      id: 'gen4_turbo',
      configured: false,
      access: 'unverified',
    });
    expect(
      runway.parameters.find((parameter) => parameter.key === 'prompt')
        ?.maxLength,
    ).toBe(1000);
    expect(
      runway.parameters.find((parameter) => parameter.key === 'durationSeconds')
        ?.values,
    ).toEqual([5, 10]);
    expect(runway.cost.durationEstimates).toEqual([
      { seconds: 5, amountCents: 30 },
      { seconds: 10, amountCents: 60 },
    ]);
    expect(network).not.toHaveBeenCalled();
  });
  it('exposes a pinned compatible Replicate model and a sanitized local tag without any key or service URL', async () => {
    clearProviders();
    vi.stubEnv('RUNWAY_API_KEY', 'secret-runway-key');
    vi.stubEnv('REPLICATE_API_TOKEN', 'secret-replicate-key');
    vi.stubEnv('REPLICATE_MODEL_VERSION', version);
    vi.stubEnv('REPLICATE_OUTPUT_KIND', 'video');
    vi.stubEnv('REPLICATE_ESTIMATE_CENTS', '57');
    vi.stubEnv('OLLAMA_MODEL', 'qwen3:8b');
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    const catalog = await getProviderCatalog();
    expect(
      catalog.models.find((model) => model.provider === 'replicate'),
    ).toMatchObject({
      id: version,
      configured: true,
      outputKind: 'video',
      access: 'unverified',
      cost: { kind: 'manual-reservation', amountCents: 57 },
    });
    const ollama = catalog.models.find((model) => model.provider === 'ollama');
    expect(ollama).toMatchObject({
      id: 'qwen3:8b',
      access: 'unverified',
      outputKind: 'text',
    });
    expect(
      ollama?.parameters.find((parameter) => parameter.key === 'maxTokens'),
    ).toMatchObject({ min: 128, max: 4096 });
    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toMatch(
      /secret-runway-key|secret-replicate-key|127\.0\.0\.1|11434/,
    );
    expect(network).not.toHaveBeenCalled();
    expect(getReplicateVideoConfiguration()).toEqual({
      version,
      outputKind: 'video',
      estimateCents: 57,
    });
  });
  it('never makes an invalid tag or mutable model version selectable and excludes image-only defaults', async () => {
    clearProviders();
    vi.stubEnv('REPLICATE_API_TOKEN', 'private');
    vi.stubEnv('REPLICATE_MODEL_VERSION', 'latest');
    vi.stubEnv('REPLICATE_OUTPUT_KIND', 'video');
    vi.stubEnv('REPLICATE_ESTIMATE_CENTS', '25');
    vi.stubEnv('OLLAMA_MODEL', 'bad model\nsecret');
    expect(
      (await getProviderCatalog()).models.map((model) => model.provider),
    ).toEqual(['local', 'runway']);
    expect(getReplicateVideoConfiguration()).toBeNull();
    vi.stubEnv('REPLICATE_MODEL_VERSION', version);
    vi.stubEnv('REPLICATE_OUTPUT_KIND', 'image');
    expect(getReplicateVideoConfiguration()).toBeNull();
    expect(
      (await getProviderCatalog()).models.find(
        (model) => model.provider === 'replicate',
      )?.outputKind,
    ).toBe('image');
  });
  it('catalogues only validated local workflow modes without exposing node graphs or their private paths', async () => {
    clearProviders();
    const directory = await mkdtemp(
      join(tmpdir(), 'yassdem-catalog-workflow-'),
    );
    try {
      const file = join(directory, 'private-fashion.json');
      await writeFile(
        file,
        JSON.stringify({
          version: 1,
          mode: 'fashion-image',
          garmentSlots: 1,
          prompt: {
            '1': {
              class_type: 'PrivateLoadNode',
              inputs: { image: '{{garment_1}}' },
            },
            '2': {
              class_type: 'PrivateTextNode',
              inputs: { text: '{{prompt}} {{mannequin_parameters}}' },
            },
          },
        }),
      );
      vi.stubEnv('COMFYUI_FASHION_WORKFLOW', file);
      vi.stubEnv('COMFYUI_TRYON_WORKFLOW', join(directory, 'absent.json'));
      const network = vi.fn();
      vi.stubGlobal('fetch', network);
      const catalog = await getProviderCatalog();
      const workflows = catalog.models.filter(
        (model) => model.provider === 'comfyui',
      );
      expect(workflows).toHaveLength(1);
      expect(workflows[0]).toMatchObject({
        id: 'fashion-image',
        configured: true,
        access: 'unverified',
      });
      expect(
        workflows[0].parameters.find(
          (parameter) => parameter.key === 'garments',
        ),
      ).toMatchObject({ min: 1, max: 1 });
      expect(JSON.stringify(catalog)).not.toContain(directory);
      expect(JSON.stringify(catalog)).not.toContain('PrivateLoadNode');
      expect(network).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('persists only a configured video default, keeping activation, budget and existing jobs independent in real SQLite', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/provider-catalog-runner.ts'],
      { cwd: process.cwd(), timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    expect(JSON.parse(stdout)).toEqual([
      'private-catalog-api',
      'invalid-and-image-defaults-rejected',
      'video-default-persists-with-zero-budget-and-no-activation',
      'existing-projects-and-ledger-unchanged',
    ]);
  }, 35000);
});
