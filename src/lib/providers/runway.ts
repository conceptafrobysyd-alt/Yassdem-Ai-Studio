import { open, unlink } from 'node:fs/promises';

export type RunwayDuration = 5 | 10;
export type RunwayRatio = '1280:720' | '720:1280' | '960:960';
export const RUNWAY_MODEL = 'gen4_turbo' as const;
export const RUNWAY_API_VERSION = '2024-11-06';
export const RUNWAY_NATIVE_SIZES: Record<
  RunwayRatio,
  { width: number; height: number }
> = {
  '1280:720': { width: 1280, height: 720 },
  '720:1280': { width: 720, height: 1280 },
  '960:960': { width: 960, height: 960 },
};

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(code);
    this.name = 'ProviderError';
  }
}

/** Published Gen-4 Turbo tariff assumption: 5 credits/s, $0.01/credit.
 * The UI must disclose both this assumption and the configured USD/EUR rate.
 * Estimates remain reserved until explicitly reconciled; no invented actual cost.
 */
export function estimateRunwayCost(
  durationSeconds: RunwayDuration,
  usdToEur = 1,
) {
  if (![5, 10].includes(durationSeconds))
    throw new ProviderError('INVALID_DURATION', 400);
  if (!Number.isFinite(usdToEur) || usdToEur < 0.01 || usdToEur > 10) {
    throw new ProviderError('INVALID_EXCHANGE_RATE', 400);
  }
  const credits = durationSeconds * 5;
  return {
    credits,
    usdCents: credits,
    eurCents: Math.ceil(credits * usdToEur),
    exchangeRate: usdToEur,
  };
}

export interface RunwayVideoInput {
  imageDataUri: string;
  prompt: string;
  durationSeconds: RunwayDuration;
  ratio: RunwayRatio;
}

export interface RunwayTask {
  id: string;
  status:
    'PENDING' | 'THROTTLED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  progress?: number;
  output?: string[];
  failureCode?: string;
  costCredits?: number;
}

export class RunwayProvider {
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.RUNWAY_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured() {
    return Boolean(this.apiKey?.trim());
  }

  private async request(path: string, init: RequestInit = {}) {
    if (!this.configured) throw new ProviderError('RUNWAY_NOT_CONFIGURED', 400);
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.dev.runwayml.com/v1${path}`,
        {
          ...init,
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'X-Runway-Version': RUNWAY_API_VERSION,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      // Network exceptions may contain the URL or implementation details.
      throw new ProviderError('RUNWAY_UNREACHABLE');
    }
    if (!response.ok) {
      // Never echo provider bodies, prompts, credentials or signed asset URLs.
      const code =
        response.status === 401 || response.status === 403
          ? 'RUNWAY_AUTH_FAILED'
          : response.status === 429
            ? 'RUNWAY_RATE_LIMITED'
            : response.status === 400
              ? 'RUNWAY_INVALID_REQUEST'
              : 'RUNWAY_REQUEST_FAILED';
      throw new ProviderError(code);
    }
    if (response.status === 204) return {};
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ProviderError('RUNWAY_INVALID_RESPONSE');
    }
  }

  async checkConnection(): Promise<{ ok: boolean; code?: string }> {
    try {
      await this.request('/organization');
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        code:
          error instanceof ProviderError ? error.code : 'RUNWAY_REQUEST_FAILED',
      };
    }
  }

  async createVideo(input: RunwayVideoInput): Promise<{ id: string }> {
    estimateRunwayCost(input.durationSeconds);
    if (!Object.hasOwn(RUNWAY_NATIVE_SIZES, input.ratio))
      throw new ProviderError('INVALID_FORMAT', 400);
    if (input.prompt.length > 1000 || !input.prompt.trim())
      throw new ProviderError('INVALID_PROMPT', 400);
    if (
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
        input.imageDataUri,
      ) ||
      input.imageDataUri.length > Math.ceil((5 * 1024 * 1024) / 3) * 4 + 40
    ) {
      throw new ProviderError('INVALID_SOURCE_IMAGE', 400);
    }
    const data = await this.request('/image_to_video', {
      method: 'POST',
      body: JSON.stringify({
        model: RUNWAY_MODEL,
        promptImage: input.imageDataUri,
        promptText: input.prompt,
        duration: input.durationSeconds,
        ratio: input.ratio,
      }),
    });
    if (
      typeof data.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(data.id)
    ) {
      throw new ProviderError('RUNWAY_INVALID_RESPONSE');
    }
    return { id: data.id };
  }

  async getTask(id: string): Promise<RunwayTask> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new ProviderError('INVALID_TASK_ID', 400);
    const data = await this.request(`/tasks/${encodeURIComponent(id)}`);
    const statuses = [
      'PENDING',
      'THROTTLED',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'CANCELLED',
    ];
    if (typeof data.status !== 'string' || !statuses.includes(data.status)) {
      throw new ProviderError('RUNWAY_INVALID_RESPONSE');
    }
    return {
      id,
      status: data.status as RunwayTask['status'],
      progress:
        typeof data.progress === 'number' &&
        data.progress >= 0 &&
        data.progress <= 1
          ? data.progress
          : undefined,
      output: Array.isArray(data.output)
        ? data.output.filter(
            (value): value is string => typeof value === 'string',
          )
        : undefined,
      // Deliberately do not forward provider-supplied error prose.
      failureCode:
        data.status === 'FAILED' ? 'RUNWAY_GENERATION_FAILED' : undefined,
      costCredits:
        data.cost &&
        typeof data.cost === 'object' &&
        'credits' in data.cost &&
        typeof data.cost.credits === 'number' &&
        Number.isFinite(data.cost.credits) &&
        data.cost.credits >= 0 &&
        data.cost.credits <= 100_000_000
          ? data.cost.credits
          : undefined,
    };
  }

  async cancelTask(id: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new ProviderError('INVALID_TASK_ID', 400);
    await this.request(`/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}

const ARTIFACT_HOSTS = new Set(['dnznrvs05pmza.cloudfront.net']);

export function validateRunwayArtifactUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderError('UNSAFE_ARTIFACT_URL');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !(
      ARTIFACT_HOSTS.has(host) ||
      host.endsWith('.runwayml.com') ||
      host.endsWith('.runwayml.cloud')
    )
  ) {
    throw new ProviderError('UNSAFE_ARTIFACT_URL');
  }
  return url;
}

/** Downloads only provider artifacts. Redirects are rejected, including same-host ones. */
export async function downloadRunwayVideo(
  value: string,
  destination: string,
  options: { fetchImpl?: typeof fetch; maxBytes?: number } = {},
) {
  const url = validateRunwayArtifactUrl(value);
  const maxBytes = Math.min(
    options.maxBytes ?? 250 * 1024 * 1024,
    250 * 1024 * 1024,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ProviderError('ARTIFACT_DOWNLOAD_FAILED');
  }
  const contentType = response.headers
    .get('content-type')
    ?.split(';')[0]
    .trim();
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (
    !response.ok ||
    !response.body ||
    !['video/mp4', 'application/octet-stream'].includes(contentType ?? '')
  ) {
    throw new ProviderError('INVALID_ARTIFACT');
  }
  if (contentLength > maxBytes) throw new ProviderError('ARTIFACT_TOO_LARGE');
  const file = await open(destination, 'wx', 0o600);
  const reader = response.body.getReader();
  let total = 0;
  let signature = Buffer.alloc(0);
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.length;
      if (total > maxBytes) throw new ProviderError('ARTIFACT_TOO_LARGE');
      if (signature.length < 12)
        signature = Buffer.concat([
          signature,
          Buffer.from(chunk).subarray(0, 12 - signature.length),
        ]);
      let offset = 0;
      while (offset < chunk.length) {
        const written = await file.write(chunk, offset, chunk.length - offset);
        if (!written.bytesWritten)
          throw new ProviderError('ARTIFACT_DOWNLOAD_FAILED');
        offset += written.bytesWritten;
      }
    }
    if (total < 12 || signature.subarray(4, 8).toString('ascii') !== 'ftyp')
      throw new ProviderError('INVALID_ARTIFACT');
    return { bytes: total, mimeType: 'video/mp4' as const };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    await unlink(destination).catch(() => undefined);
    throw error instanceof ProviderError
      ? error
      : new ProviderError('ARTIFACT_DOWNLOAD_FAILED');
  } finally {
    await file.close();
  }
}
