import { open, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { probeMedia } from '../export';

export class ReplicateError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(code);
    this.name = 'ReplicateError';
  }
}
export type ReplicateOutputKind = 'image' | 'video';
export interface ReplicateConfiguration {
  version: string;
  outputKind: ReplicateOutputKind;
  estimateCents: number;
}
export const REPLICATE_ESTIMATE_ASSUMPTION =
  'Administrator-supplied EUR reservation per prediction, not a provider quote or a guaranteed maximum. Actual charges require a verified billing record; compute time is not a price.';
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const exec = promisify(execFile);

/** Decode one frame, rather than trusting a container's stream metadata. The
 * tiny raw output proves a frame exists while keeping stdout bounded. */
async function validateVideoFrame(filePath: string) {
  const { stdout } = await exec(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-xerror',
      '-max_alloc',
      '268435456',
      '-protocol_whitelist',
      'file,pipe',
      '-threads',
      '1',
      '-filter_threads',
      '1',
      '-f',
      'mov',
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-vf',
      'scale=1:1',
      '-frames:v',
      '1',
      '-threads',
      '1',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    {
      timeout: 15_000,
      killSignal: 'SIGKILL',
      maxBuffer: 64 * 1024,
      encoding: 'buffer',
      windowsHide: true,
    },
  );
  if (stdout.length !== 3) throw new ReplicateError('INVALID_ARTIFACT');
}

export function readReplicateConfiguration(
  options: {
    version?: string;
    outputKind?: string;
    estimateCents?: string | number;
  } = {},
): ReplicateConfiguration {
  const version = options.version ?? process.env.REPLICATE_MODEL_VERSION ?? '';
  const outputKind = options.outputKind ?? process.env.REPLICATE_OUTPUT_KIND;
  const rawEstimate =
    options.estimateCents ?? process.env.REPLICATE_ESTIMATE_CENTS;
  const estimateCents =
    typeof rawEstimate === 'number'
      ? rawEstimate
      : /^\d{1,9}$/.test(rawEstimate ?? '')
        ? Number(rawEstimate)
        : NaN;
  if (!/^[a-f0-9]{64}$/.test(version))
    throw new ReplicateError('REPLICATE_MODEL_VERSION_REQUIRED', 400);
  if (outputKind !== 'image' && outputKind !== 'video')
    throw new ReplicateError('REPLICATE_OUTPUT_KIND_REQUIRED', 400);
  if (
    !Number.isSafeInteger(estimateCents) ||
    estimateCents <= 0 ||
    estimateCents > 100_000_000
  )
    throw new ReplicateError('REPLICATE_ESTIMATE_REQUIRED', 400);
  return { version, outputKind, estimateCents };
}

async function responseJson(
  response: Response,
  maxBytes = 1024 * 1024,
): Promise<Record<string, unknown>> {
  if (
    !response.body ||
    Number(response.headers.get('content-length') ?? 0) > maxBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new ReplicateError('REPLICATE_INVALID_RESPONSE');
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks: Buffer[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes)
        throw new ReplicateError('REPLICATE_INVALID_RESPONSE');
      chunks.push(Buffer.from(next.value));
    }
    const result: unknown = JSON.parse(
      Buffer.concat(chunks, bytes).toString('utf8'),
    );
    if (!object(result)) throw new Error();
    return result;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof ReplicateError
      ? error
      : new ReplicateError('REPLICATE_INVALID_RESPONSE');
  } finally {
    reader.releaseLock();
  }
}

export interface ReplicateTask {
  id: string;
  status:
    'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'aborted';
  output?: string[];
  failureCode?: string;
}

/** Protocol checked against the official replicate@1.4.0 SDK.
 * Raw metrics and error bodies are intentionally excluded from our contract.
 */
export class ReplicateProvider {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  constructor(options: { apiToken?: string; fetchImpl?: typeof fetch } = {}) {
    this.token = options.apiToken ?? process.env.REPLICATE_API_TOKEN;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  get configured() {
    return Boolean(this.token?.trim());
  }
  private async request(path: string, init: RequestInit = {}) {
    if (!this.configured)
      throw new ReplicateError('REPLICATE_NOT_CONFIGURED', 400);
    let response: Response;
    try {
      response = await this.fetchImpl(`https://api.replicate.com/v1${path}`, {
        ...init,
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
    } catch {
      throw new ReplicateError('REPLICATE_UNREACHABLE');
    }
    if (response.redirected || !response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ReplicateError(
        response.status === 401 || response.status === 403
          ? 'REPLICATE_AUTH_FAILED'
          : response.status === 429
            ? 'REPLICATE_RATE_LIMITED'
            : response.status === 400 || response.status === 422
              ? 'REPLICATE_INVALID_REQUEST'
              : 'REPLICATE_REQUEST_FAILED',
      );
    }
    return responseJson(response);
  }
  async checkConnection(): Promise<{ ok: boolean; code?: string }> {
    try {
      await this.request('/account', { method: 'GET' });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code:
          error instanceof ReplicateError
            ? error.code
            : 'REPLICATE_UNREACHABLE',
      };
    }
  }
  async createPrediction(input: {
    version: string;
    prompt: string;
    imageDataUri?: string;
  }): Promise<{ id: string }> {
    if (!/^[a-f0-9]{64}$/.test(input.version))
      throw new ReplicateError('REPLICATE_MODEL_VERSION_REQUIRED', 400);
    if (
      typeof input.prompt !== 'string' ||
      !input.prompt.trim() ||
      input.prompt.length > 6000
    )
      throw new ReplicateError('INVALID_PROMPT', 400);
    if (
      input.imageDataUri !== undefined &&
      (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
        input.imageDataUri,
      ) ||
        input.imageDataUri.length > 7 * 1024 * 1024)
    )
      throw new ReplicateError('INVALID_SOURCE_IMAGE', 400);
    const data = await this.request('/predictions', {
      method: 'POST',
      body: JSON.stringify({
        version: input.version,
        input: {
          prompt: input.prompt,
          ...(input.imageDataUri ? { image: input.imageDataUri } : {}),
        },
      }),
    });
    if (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id))
      throw new ReplicateError('REPLICATE_INVALID_RESPONSE');
    return { id: data.id };
  }
  async getTask(id: string): Promise<ReplicateTask> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new ReplicateError('INVALID_TASK_ID', 400);
    const data = await this.request(`/predictions/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    const statuses = [
      'starting',
      'processing',
      'succeeded',
      'failed',
      'canceled',
      'aborted',
    ];
    if (typeof data.status !== 'string' || !statuses.includes(data.status))
      throw new ReplicateError('REPLICATE_INVALID_RESPONSE');
    // Pin model adapters to URL or URL-array outputs. Arbitrary JSON is not interpreted as media.
    const urls =
      typeof data.output === 'string'
        ? [data.output]
        : Array.isArray(data.output)
          ? data.output
          : [];
    if (urls.length > 16 || urls.some((value) => typeof value !== 'string'))
      throw new ReplicateError('REPLICATE_INVALID_OUTPUT');
    return {
      id,
      status: data.status as ReplicateTask['status'],
      output: urls as string[],
      ...(data.status === 'failed' || data.status === 'aborted'
        ? { failureCode: 'REPLICATE_GENERATION_FAILED' }
        : {}),
    };
  }
  async cancelTask(id: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new ReplicateError('INVALID_TASK_ID', 400);
    await this.request(`/predictions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  }
}

export function validateReplicateArtifactUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ReplicateError('UNSAFE_ARTIFACT_URL');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !(host === 'replicate.delivery' || host.endsWith('.replicate.delivery'))
  )
    throw new ReplicateError('UNSAFE_ARTIFACT_URL');
  return url;
}

/** Only call with URLs returned by getTask, never with a request-supplied URL. */
export async function downloadReplicateArtifact(
  value: string,
  destination: string,
  kind: ReplicateOutputKind,
  options: { fetchImpl?: typeof fetch; maxBytes?: number } = {},
) {
  if (kind !== 'image' && kind !== 'video')
    throw new ReplicateError('REPLICATE_OUTPUT_KIND_REQUIRED', 400);
  const url = validateReplicateArtifactUrl(value);
  const maxBytes = Math.min(
    options.maxBytes ?? 150 * 1024 * 1024,
    150 * 1024 * 1024,
  );
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new ReplicateError('INVALID_ARTIFACT_LIMIT', 400);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ReplicateError('ARTIFACT_DOWNLOAD_FAILED');
  }
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  const allowed =
    kind === 'video'
      ? ['video/mp4', 'application/octet-stream']
      : ['image/png', 'image/jpeg', 'image/webp', 'application/octet-stream'];
  if (
    response.redirected ||
    !response.ok ||
    !response.body ||
    !allowed.includes(type ?? '')
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new ReplicateError('INVALID_ARTIFACT');
  }
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new ReplicateError('ARTIFACT_TOO_LARGE');
  }
  const file = await open(destination, 'wx', 0o600);
  const reader = response.body.getReader();
  let total = 0;
  let signature = Buffer.alloc(0);
  try {
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > maxBytes) throw new ReplicateError('ARTIFACT_TOO_LARGE');
      if (signature.length < 12)
        signature = Buffer.concat([
          signature,
          Buffer.from(chunk).subarray(0, 12 - signature.length),
        ]);
      let offset = 0;
      while (offset < chunk.length) {
        const result = await file.write(chunk, offset, chunk.length - offset);
        if (!result.bytesWritten)
          throw new ReplicateError('ARTIFACT_DOWNLOAD_FAILED');
        offset += result.bytesWritten;
      }
    }
    await file.close();
    if (kind === 'video') {
      if (total < 12 || signature.subarray(4, 8).toString('ascii') !== 'ftyp')
        throw new ReplicateError('INVALID_ARTIFACT');
      const native = await probeMedia(destination);
      if (
        typeof native.durationSeconds !== 'number' ||
        !Number.isFinite(native.durationSeconds) ||
        native.durationSeconds <= 0 ||
        native.durationSeconds > 1800
      )
        throw new ReplicateError('INVALID_ARTIFACT');
      await validateVideoFrame(destination);
      return {
        bytes: total,
        mimeType: 'video/mp4',
        extension: 'mp4',
        width: native.width,
        height: native.height,
        duration: native.durationSeconds,
      };
    }
    const image = sharp(destination, {
      limitInputPixels: 40_000_000,
      failOn: 'error',
    });
    const metadata = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    )
      throw new ReplicateError('INVALID_ARTIFACT');
    // Decode the pixel stream; a valid header alone does not establish valid media.
    await image.stats();
    const format = metadata.format!;
    return {
      bytes: total,
      mimeType: `image/${format}`,
      extension: format === 'jpeg' ? 'jpg' : format,
      width: metadata.width,
      height: metadata.height,
      duration: undefined,
    };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await file.close().catch(() => undefined);
    await unlink(destination).catch(() => undefined);
    throw error instanceof ReplicateError
      ? error
      : new ReplicateError('INVALID_ARTIFACT');
  } finally {
    await file.close().catch(() => undefined);
    reader.releaseLock();
  }
}
