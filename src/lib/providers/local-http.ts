/** HTTP transport for a service explicitly configured by the server administrator.
 * Never pass a URL received from a request to this class. Plain HTTP is restricted
 * to exact loopback hosts; remote deployments must use HTTPS with valid TLS.
 */
export class LocalServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 502,
  ) {
    super(code);
    this.name = 'LocalServiceError';
  }
}

export function validateLocalServiceEndpoint(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LocalServiceError('COMFYUI_INVALID_ENDPOINT', 400);
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol === 'http:' && !loopback) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new LocalServiceError('COMFYUI_INVALID_ENDPOINT', 400);
  return url;
}

export async function readLimitedResponse(
  response: Response,
  limit: number,
): Promise<Buffer> {
  if (
    !response.body ||
    Number(response.headers.get('content-length') ?? 0) > limit
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new LocalServiceError('COMFYUI_RESPONSE_TOO_LARGE');
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit)
        throw new LocalServiceError('COMFYUI_RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof LocalServiceError
      ? error
      : new LocalServiceError('COMFYUI_UNREACHABLE');
  } finally {
    reader.releaseLock();
  }
}

export class LocalServiceHttp {
  private readonly endpoint: URL;
  private readonly fetchImpl: typeof fetch;
  constructor(options: { endpoint: string; fetchImpl?: typeof fetch }) {
    this.endpoint = validateLocalServiceEndpoint(options.endpoint);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request(path: string, init: RequestInit = {}, maxBytes = 1024 * 1024) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
      throw new LocalServiceError('COMFYUI_INVALID_REQUEST', 400);
    const url = new URL(path, this.endpoint);
    if (url.origin !== this.endpoint.origin)
      throw new LocalServiceError('COMFYUI_INVALID_REQUEST', 400);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        cache: 'no-store',
      });
    } catch {
      throw new LocalServiceError('COMFYUI_UNREACHABLE');
    }
    if (response.redirected || !response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new LocalServiceError(
        response.status === 400
          ? 'COMFYUI_INVALID_REQUEST'
          : 'COMFYUI_REQUEST_FAILED',
      );
    }
    return {
      bytes: await readLimitedResponse(response, maxBytes),
      headers: response.headers,
    };
  }

  async json(
    path: string,
    init: RequestInit = {},
    maxBytes = 1024 * 1024,
  ): Promise<Record<string, unknown>> {
    const { bytes } = await this.request(path, init, maxBytes);
    try {
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      return value as Record<string, unknown>;
    } catch {
      throw new LocalServiceError('COMFYUI_INVALID_RESPONSE');
    }
  }
}
