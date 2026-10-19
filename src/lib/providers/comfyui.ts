import { open, realpath } from 'node:fs/promises';
import { LocalServiceError, LocalServiceHttp } from './local-http';

export type ComfyMode = 'fashion-image' | 'try-on';
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface ComfyWorkflow {
  version: 1;
  mode: ComfyMode;
  garmentSlots: number | 'array';
  prompt: Record<string, Json>;
}
export interface ComfyImage {
  filename: string;
  subfolder: string;
  type: 'output' | 'temp';
}
export interface ComfyWorkflowInput {
  prompt: string;
  negativePrompt?: string;
  seed: number;
  width: number;
  height: number;
  garmentImages: string[];
  portraitImage?: string;
  mannequinParameters: Record<string, Json>;
}
const WORKFLOW_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 20 * 1024 * 1024;
const tokenPattern = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
function fail(code: string): never {
  throw new LocalServiceError(code, 400);
}

function tokensIn(
  value: Json,
  tokens = new Set<string>(),
  depth = 0,
): Set<string> {
  if (depth > 30) fail('COMFYUI_INVALID_WORKFLOW');
  if (typeof value === 'string') {
    for (const match of value.matchAll(tokenPattern)) tokens.add(match[1]);
    if (value.replace(tokenPattern, '').includes('{{'))
      fail('COMFYUI_INVALID_WORKFLOW');
  } else if (Array.isArray(value)) {
    for (const child of value) tokensIn(child, tokens, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (
        ['__proto__', 'prototype', 'constructor'].includes(key) ||
        key.includes('{{')
      )
        fail('COMFYUI_INVALID_WORKFLOW');
      tokensIn(child, tokens, depth + 1);
    }
  }
  return tokens;
}

/** Server-owned JSON contract: { version:1, mode, garmentSlots, prompt:<Comfy API graph> }.
 * Placeholders are substituted only within node.inputs values. Class names,
 * node IDs and all metadata must remain static.
 * Required: {{prompt}}, {{mannequin_parameters}}, and either {{garment_1}}...
 * for every declared slot, or {{garment_images}} for garmentSlots:"array".
 * Try-on additionally requires {{portrait_image}}. Optional: {{negative_prompt}},
 * {{seed}}, {{width}}, {{height}} and individual {{mannequin.<field>}} values.
 */
export function validateComfyWorkflow(
  value: unknown,
  mode: ComfyMode,
): ComfyWorkflow {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.mode !== mode ||
    !object(value.prompt)
  )
    fail('COMFYUI_INVALID_WORKFLOW');
  const slots = value.garmentSlots;
  if (
    slots !== 'array' &&
    (!Number.isSafeInteger(slots) ||
      (slots as number) < 1 ||
      (slots as number) > 8)
  )
    fail('COMFYUI_INVALID_WORKFLOW');
  const entries = Object.entries(value.prompt as Record<string, unknown>);
  if (!entries.length || entries.length > 500) fail('COMFYUI_INVALID_WORKFLOW');
  for (const [key, metadata] of Object.entries(value)) {
    if (key !== 'prompt' && tokensIn({ [key]: metadata as Json }).size)
      fail('COMFYUI_INVALID_WORKFLOW');
  }
  const tokens = new Set<string>();
  for (const [id, node] of entries) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
      ['__proto__', 'prototype', 'constructor'].includes(id) ||
      !object(node) ||
      typeof node.class_type !== 'string' ||
      !node.class_type ||
      !object(node.inputs)
    )
      fail('COMFYUI_INVALID_WORKFLOW');
    for (const [key, metadata] of Object.entries(node)) {
      if (key !== 'inputs' && tokensIn({ [key]: metadata as Json }).size)
        fail('COMFYUI_INVALID_WORKFLOW');
    }
    tokensIn(node.inputs as Json, tokens);
  }
  if (!tokens.has('prompt') || !tokens.has('mannequin_parameters'))
    fail('COMFYUI_MODEL_MAPPING_REQUIRED');
  if (mode === 'try-on' && !tokens.has('portrait_image'))
    fail('COMFYUI_PORTRAIT_MAPPING_REQUIRED');
  if (slots === 'array') {
    if (
      !tokens.has('garment_images') ||
      [...tokens].some((t) => /^garment_\d+$/.test(t))
    )
      fail('COMFYUI_GARMENT_MAPPING_MISMATCH');
  } else {
    for (let index = 1; index <= (slots as number); index++)
      if (!tokens.has(`garment_${index}`))
        fail('COMFYUI_GARMENT_MAPPING_MISMATCH');
    if (
      tokens.has('garment_images') ||
      [...tokens].some(
        (t) =>
          /^garment_\d+$/.test(t) && Number(t.slice(8)) > (slots as number),
      )
    )
      fail('COMFYUI_GARMENT_MAPPING_MISMATCH');
  }
  const common = new Set([
    'prompt',
    'negative_prompt',
    'seed',
    'width',
    'height',
    'portrait_image',
    'mannequin_parameters',
    'garment_images',
  ]);
  for (const token of tokens)
    if (
      !common.has(token) &&
      !/^garment_[1-8]$/.test(token) &&
      !/^mannequin\.[A-Za-z][A-Za-z0-9_]{0,63}$/.test(token)
    )
      fail('COMFYUI_UNKNOWN_PLACEHOLDER');
  return value as unknown as ComfyWorkflow;
}

export function prepareComfyWorkflow(
  workflow: ComfyWorkflow,
  input: ComfyWorkflowInput,
): Record<string, Json> {
  validateComfyWorkflow(workflow, workflow.mode);
  if (
    input.garmentImages.length < 1 ||
    input.garmentImages.length > 8 ||
    (workflow.garmentSlots !== 'array' &&
      input.garmentImages.length !== workflow.garmentSlots)
  )
    fail('COMFYUI_GARMENT_MAPPING_MISMATCH');
  if (tokensIn(workflow.prompt).has('portrait_image') && !input.portraitImage)
    fail('COMFYUI_PORTRAIT_REQUIRED');
  if (
    !input.prompt.trim() ||
    input.prompt.length > 12000 ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 0 ||
    ![input.width, input.height].every(
      (v) => Number.isSafeInteger(v) && v >= 256 && v <= 2048,
    )
  )
    fail('COMFYUI_INVALID_INPUT');
  const values: Record<string, Json> = {
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? '',
    seed: input.seed,
    width: input.width,
    height: input.height,
    garment_images: input.garmentImages,
    portrait_image: input.portraitImage ?? '',
    mannequin_parameters: JSON.stringify(input.mannequinParameters),
  };
  input.garmentImages.forEach((name, i) => {
    values[`garment_${i + 1}`] = name;
  });
  for (const [key, value] of Object.entries(input.mannequinParameters))
    values[`mannequin.${key}`] = value;
  const substitute = (value: Json): Json => {
    if (typeof value === 'string') {
      const matches = [...value.matchAll(tokenPattern)];
      for (const match of matches)
        if (!Object.hasOwn(values, match[1]))
          fail('COMFYUI_UNKNOWN_PLACEHOLDER');
      if (matches.length === 1 && matches[0][0] === value)
        return values[matches[0][1]];
      return value.replace(tokenPattern, (_whole, key: string) => {
        const replacement = values[key];
        if (replacement !== null && typeof replacement === 'object')
          fail('COMFYUI_INVALID_WORKFLOW');
        return String(replacement ?? '');
      });
    }
    if (Array.isArray(value)) return value.map(substitute);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, substitute(v)]),
      );
    return value;
  };
  return Object.fromEntries(
    Object.entries(workflow.prompt).map(([id, value]) => {
      const node = value as Record<string, Json>;
      return [id, { ...node, inputs: substitute(node.inputs) }];
    }),
  );
}

function safeComponent(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-][A-Za-z0-9_. -]{0,179}$/.test(value) &&
    value.trim() === value &&
    !value.includes('..')
  );
}
function safeSubfolder(value: unknown): value is string {
  return (
    value === '' ||
    (typeof value === 'string' &&
      value.length <= 300 &&
      value.split('/').every(safeComponent))
  );
}
export function validateComfyImage(value: unknown): ComfyImage {
  if (
    !object(value) ||
    !safeComponent(value.filename) ||
    !safeSubfolder(value.subfolder) ||
    !['output', 'temp'].includes(value.type as string) ||
    !/\.(png|jpe?g|webp)$/i.test(value.filename)
  )
    fail('COMFYUI_INVALID_OUTPUT');
  return value as unknown as ComfyImage;
}

export class ComfyUIProvider {
  private readonly http: LocalServiceHttp;
  private readonly paths: Record<ComfyMode, string | undefined>;
  constructor(
    options: {
      endpoint?: string;
      fetchImpl?: typeof fetch;
      fashionWorkflowPath?: string;
      tryOnWorkflowPath?: string;
    } = {},
  ) {
    this.http = new LocalServiceHttp({
      endpoint:
        options.endpoint ?? process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188',
      fetchImpl: options.fetchImpl,
    });
    this.paths = {
      'fashion-image':
        options.fashionWorkflowPath ?? process.env.COMFYUI_FASHION_WORKFLOW,
      'try-on': options.tryOnWorkflowPath ?? process.env.COMFYUI_TRYON_WORKFLOW,
    };
  }

  async loadWorkflow(mode: ComfyMode): Promise<ComfyWorkflow> {
    const path = this.paths[mode];
    if (!path)
      fail(
        mode === 'try-on'
          ? 'COMFYUI_TRYON_WORKFLOW_REQUIRED'
          : 'COMFYUI_FASHION_WORKFLOW_REQUIRED',
      );
    try {
      const other = this.paths[mode === 'try-on' ? 'fashion-image' : 'try-on'];
      if (
        other &&
        (await realpath(path)) === (await realpath(other).catch(() => null))
      )
        fail('COMFYUI_SEPARATE_WORKFLOWS_REQUIRED');
      const file = await open(path, 'r');
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > WORKFLOW_LIMIT)
          fail('COMFYUI_INVALID_WORKFLOW');
        const buffer = Buffer.alloc(WORKFLOW_LIMIT + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > WORKFLOW_LIMIT) fail('COMFYUI_INVALID_WORKFLOW');
        return validateComfyWorkflow(
          JSON.parse(buffer.toString('utf8', 0, bytesRead)),
          mode,
        );
      } finally {
        await file.close();
      }
    } catch (error) {
      throw error instanceof LocalServiceError
        ? error
        : new LocalServiceError('COMFYUI_INVALID_WORKFLOW', 400);
    }
  }

  async checkConnection(): Promise<{ ok: boolean; code?: string }> {
    try {
      const data = await this.http.json('/system_stats');
      if (!object(data.system) || !Array.isArray(data.devices))
        throw new LocalServiceError('COMFYUI_INVALID_RESPONSE');
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code:
          error instanceof LocalServiceError
            ? error.code
            : 'COMFYUI_UNREACHABLE',
      };
    }
  }

  async uploadImage(
    bytes: Buffer,
    mimeType: string,
    name: string,
  ): Promise<string> {
    if (
      !bytes.length ||
      bytes.length > IMAGE_LIMIT ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) ||
      !/^[A-Za-z0-9_-]{1,128}\.(png|jpg|webp)$/.test(name)
    )
      fail('COMFYUI_INVALID_IMAGE');
    const form = new FormData();
    form.set(
      'image',
      new Blob([new Uint8Array(bytes)], { type: mimeType }),
      name,
    );
    form.set('type', 'input');
    form.set('overwrite', 'false');
    const data = await this.http.json('/upload/image', {
      method: 'POST',
      body: form,
    });
    if (
      !safeComponent(data.name) ||
      !safeSubfolder(data.subfolder) ||
      data.type !== 'input'
    )
      throw new LocalServiceError('COMFYUI_INVALID_RESPONSE');
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }

  async createTask(
    prompt: Record<string, Json>,
    clientId: string,
  ): Promise<{ id: string }> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId) || !object(prompt))
      fail('COMFYUI_INVALID_INPUT');
    const body = JSON.stringify({ prompt, client_id: clientId });
    if (Buffer.byteLength(body) > WORKFLOW_LIMIT)
      fail('COMFYUI_INVALID_WORKFLOW');
    const data = await this.http.json('/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (
      typeof data.prompt_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(data.prompt_id) ||
      (object(data.node_errors) && Object.keys(data.node_errors).length)
    )
      throw new LocalServiceError('COMFYUI_INVALID_RESPONSE');
    return { id: data.prompt_id };
  }

  async getTask(id: string): Promise<{
    status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    images?: ComfyImage[];
  }> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail('COMFYUI_INVALID_TASK_ID');
    const data = await this.http.json(
      `/history/${encodeURIComponent(id)}`,
      {},
      4 * WORKFLOW_LIMIT,
    );
    const entry = data[id];
    if (!entry) return { status: 'RUNNING' };
    if (!object(entry) || !object(entry.status))
      throw new LocalServiceError('COMFYUI_INVALID_RESPONSE');
    if (entry.status.status_str === 'error') return { status: 'FAILED' };
    if (entry.status.completed !== true) return { status: 'RUNNING' };
    if (!object(entry.outputs))
      throw new LocalServiceError('COMFYUI_MISSING_OUTPUT');
    const images: ComfyImage[] = [];
    for (const output of Object.values(entry.outputs)) {
      if (object(output) && Array.isArray(output.images))
        for (const value of output.images) {
          images.push(validateComfyImage(value));
          if (images.length > 16)
            throw new LocalServiceError('COMFYUI_TOO_MANY_OUTPUTS');
        }
    }
    if (!images.length) throw new LocalServiceError('COMFYUI_MISSING_OUTPUT');
    return { status: 'SUCCEEDED', images };
  }

  async downloadImage(image: ComfyImage): Promise<Buffer> {
    const descriptor = validateComfyImage(image);
    const query = new URLSearchParams({
      filename: descriptor.filename,
      subfolder: descriptor.subfolder,
      type: descriptor.type,
    });
    const { bytes, headers } = await this.http.request(
      `/view?${query.toString()}`,
      {},
      IMAGE_LIMIT,
    );
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/octet-stream',
      ].includes(headers.get('content-type')?.split(';')[0].trim() ?? '')
    )
      throw new LocalServiceError('COMFYUI_INVALID_OUTPUT');
    return bytes;
  }
}

export async function getComfyUIStatus() {
  try {
    const provider = new ComfyUIProvider();
    const workflowStatus = async (mode: ComfyMode) => {
      try {
        const workflow = await provider.loadWorkflow(mode);
        return {
          configured: true,
          garmentSlots: workflow.garmentSlots,
          requiresPortrait: tokensIn(workflow.prompt).has('portrait_image'),
        };
      } catch (error) {
        return {
          configured: false,
          code:
            error instanceof LocalServiceError
              ? error.code
              : 'COMFYUI_INVALID_WORKFLOW',
        };
      }
    };
    const [connection, fashionImage, tryOn] = await Promise.all([
      provider.checkConnection(),
      workflowStatus('fashion-image'),
      workflowStatus('try-on'),
    ]);
    return {
      connected: connection.ok,
      ...(connection.code ? { code: connection.code } : {}),
      fashionImage,
      tryOn,
    };
  } catch (error) {
    const code =
      error instanceof LocalServiceError ? error.code : 'COMFYUI_UNREACHABLE';
    return {
      connected: false,
      code,
      fashionImage: { configured: false, code },
      tryOn: { configured: false, code },
    };
  }
}
