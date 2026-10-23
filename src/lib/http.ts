import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string = code,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function assertSameOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = process.env.APP_ORIGIN;
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  const host = request.headers.get('host') ?? requestUrl.host;
  let expected = configuredOrigin || requestUrl.origin;

  // NextRequest normalizes loopback IPs to localhost in request.url, but keeps
  // the browser's Host and Origin. Accept that local alias only when its exact
  // Host, port and protocol still match the browser origin below.
  if (!configuredOrigin && localHosts.includes(requestUrl.hostname)) {
    try {
      const localUrl = new URL(`${requestUrl.protocol}//${host}`);
      if (
        localHosts.includes(localUrl.hostname) &&
        localUrl.host === host &&
        localUrl.port === requestUrl.port
      )
        expected = localUrl.origin;
    } catch {
      // A malformed Host is rejected by the strict comparison below.
    }
  }

  const origin = request.headers.get('origin');
  const expectedUrl = new URL(expected);
  const localHost = localHosts.includes(expectedUrl.hostname);
  if (
    (!configuredOrigin && !localHost) ||
    !origin ||
    origin !== expected ||
    host !== expectedUrl.host
  ) {
    throw new ApiError(
      403,
      'INVALID_ORIGIN',
      'Cette opération doit provenir de l’application.',
    );
  }
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const limit = 64 * 1024;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > limit) {
    void request.body?.cancel().catch(() => {});
    throw new ApiError(413, 'REQUEST_TOO_LARGE');
  }
  if (!request.body) throw new ApiError(400, 'INVALID_JSON');
  let body: unknown;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        // Do not wait for a potentially uncooperative client to finish cancellation.
        void reader.cancel().catch(() => {});
        throw new ApiError(413, 'REQUEST_TOO_LARGE');
      }
      chunks.push(next.value);
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, bytes),
    );
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_JSON');
  } finally {
    reader?.releaseLock();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ApiError(400, 'INVALID_JSON');
  return body as Record<string, unknown>;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : '';
  if (code === 'P2025')
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } },
      { status: 404 },
    );
  if (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status <= 599 &&
    /^[A-Z][A-Z0-9_]{2,80}$/.test(code)
  ) {
    return NextResponse.json(
      { error: { code, message: code } },
      { status: error.status },
    );
  }
  console.error(
    'API failure',
    error instanceof Error ? error.name : 'UnknownError',
    code,
  );
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue.',
      },
    },
    { status: 500 },
  );
}

export async function api(
  request: Request,
  action: () => Promise<Response>,
  options: { public?: boolean } = {},
) {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      assertSameOrigin(request);
    if (!options.public) await requireAuth(request);
    const response = await action();
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  } catch (error) {
    const response = apiError(error);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
}

export function boundedString(
  value: unknown,
  name: string,
  max = 200,
  allowEmpty = false,
) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  ) {
    throw new ApiError(400, 'INVALID_INPUT', `Champ invalide : ${name}.`);
  }
  return value.trim();
}
