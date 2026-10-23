import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

vi.mock('@/lib/db', () => ({
  db: {
    media: {
      create: vi.fn(async ({ data }) => ({
        id: 'media1',
        createdAt: new Date(),
        ...data,
      })),
    },
  },
}));
import { assertSameOrigin, ApiError, apiError, readJson } from '@/lib/http';
import {
  hashPassword,
  verifyPassword,
  isAuthenticated,
  setSession,
} from '@/lib/auth';
import { resolveMediaPath, uploadMedia } from '@/lib/media';
import { publicSettings } from '@/lib/settings';
import { POST as setupStudio } from '@/app/api/auth/setup/route';
import type { Settings } from '@prisma/client';

let temporary = '';
const previousStorage = process.env.STORAGE_DIR;
const previousOrigin = process.env.APP_ORIGIN;
beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'yassdem-backend-'));
  process.env.STORAGE_DIR = temporary;
});
afterEach(() => {
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
});
afterAll(async () => {
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  await rm(temporary, { recursive: true, force: true });
});

function multipart(
  name: string,
  type: string,
  bytes: Uint8Array,
  role = 'SOURCE',
) {
  const body = new FormData();
  body.set('role', role);
  body.set('file', new File([bytes as BlobPart], name, { type }));
  return new Request('http://localhost:3000/api/media', {
    method: 'POST',
    body,
  });
}

describe('bounded JSON parsing', () => {
  it('rejects an oversized chunked body without consuming the rest', async () => {
    let produced = 0;
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        if (produced > 200) controller.close();
        else controller.enqueue(new Uint8Array(4096).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      body: source,
      duplex: 'half',
    };
    const request = new Request('http://localhost:3000/api/auth/login', init);
    expect(request.headers.has('content-length')).toBe(false);
    await expect(readJson(request)).rejects.toMatchObject({
      status: 413,
      code: 'REQUEST_TOO_LARGE',
    });
    expect(produced).toBeLessThan(200);
    expect(cancelled).toBe(true);
  });
  it('parses valid chunked JSON including multibyte characters', async () => {
    const encoded = new TextEncoder().encode('{"name":"Création"}');
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === encoded.length) controller.close();
        else controller.enqueue(encoded.subarray(offset, ++offset));
      },
    });
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      body: stream,
      duplex: 'half',
    };
    await expect(
      readJson(new Request('http://localhost:3000/api/projects', init)),
    ).resolves.toEqual({ name: 'Création' });
  });
});

describe('private API security', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'accepts matching browser headers for %s after NextRequest normalizes the URL',
    (hostname) => {
      delete process.env.APP_ORIGIN;
      const browserOrigin = `http://${hostname}:3000`;
      const request = new NextRequest(`${browserOrigin}/api/auth/setup`, {
        method: 'POST',
        headers: { origin: browserOrigin, host: `${hostname}:3000` },
      });
      expect(new URL(request.url).hostname).toBe('localhost');
      expect(request.headers.get('origin')).toBe(browserOrigin);
      expect(() => assertSameOrigin(request)).not.toThrow();
    },
  );
  it('accepts a matching local origin on a different port and protocol', () => {
    delete process.env.APP_ORIGIN;
    const request = new NextRequest('https://127.0.0.1:3443/api/settings', {
      method: 'PATCH',
      headers: {
        origin: 'https://127.0.0.1:3443',
        host: '127.0.0.1:3443',
      },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });
  it.each([
    {
      scenario: 'foreign origin',
      url: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3000',
      origin: 'https://attacker.example',
    },
    {
      scenario: 'different loopback aliases in Host and Origin',
      url: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3000',
      origin: 'http://localhost:3000',
    },
    {
      scenario: 'different browser origin port',
      url: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3001',
    },
    {
      scenario: 'matching Host and Origin on a different server port',
      url: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3001',
      origin: 'http://127.0.0.1:3001',
    },
    {
      scenario: 'different browser origin protocol',
      url: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3000',
      origin: 'https://127.0.0.1:3000',
    },
    {
      scenario: 'external Host with matching Origin',
      url: 'http://127.0.0.1:3000',
      host: 'attacker.example:3000',
      origin: 'http://attacker.example:3000',
    },
    {
      scenario: 'external request URL with local browser headers',
      url: 'http://attacker.example:3000',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
    },
    {
      scenario: 'unlisted loopback address normalized by NextRequest',
      url: 'http://127.0.0.2:3000',
      host: '127.0.0.2:3000',
      origin: 'http://127.0.0.2:3000',
    },
  ])('rejects $scenario with a real NextRequest', ({ url, host, origin }) => {
    delete process.env.APP_ORIGIN;
    const request = new NextRequest(`${url}/api/auth/setup`, {
      method: 'POST',
      headers: { host, origin },
    });
    expect(() => assertSameOrigin(request)).toThrow(ApiError);
  });
  it.each([
    'user@localhost:3000',
    'localhost:3000/path',
    'localhost:3000?query',
    'localhost:3000#fragment',
    'http://localhost:3000',
    'localhost:not-a-port',
    '::1:3000',
    '',
  ])('rejects malformed Host %j with a controlled API error', (host) => {
    delete process.env.APP_ORIGIN;
    const request = new NextRequest('http://localhost:3000/api/auth/setup', {
      method: 'POST',
      headers: { host, origin: 'http://localhost:3000' },
    });
    expect(() => assertSameOrigin(request)).toThrow(ApiError);
  });
  it('rejects a browser mutation without an Origin header', () => {
    delete process.env.APP_ORIGIN;
    const request = new NextRequest('http://127.0.0.1:3000/api/auth/setup', {
      method: 'POST',
      headers: { host: '127.0.0.1:3000' },
    });
    expect(() => assertSameOrigin(request)).toThrow(ApiError);
  });
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'uses an explicit %s APP_ORIGIN despite NextRequest URL normalization',
    (hostname) => {
      const browserOrigin = `http://${hostname}:3000`;
      process.env.APP_ORIGIN = browserOrigin;
      const request = new NextRequest(`${browserOrigin}/api/auth/setup`, {
        method: 'POST',
        headers: { origin: browserOrigin, host: `${hostname}:3000` },
      });
      expect(() => assertSameOrigin(request)).not.toThrow();
    },
  );
  it.each([
    ['http://localhost:3000', '127.0.0.1:3000'],
    ['http://127.0.0.1:3000', 'localhost:3000'],
    ['http://localhost:3000', '[::1]:3000'],
  ])('keeps explicit origin %s strict against browser Host %s', (expected, host) => {
    process.env.APP_ORIGIN = expected;
    const request = new NextRequest(`http://${host}/api/auth/setup`, {
      method: 'POST',
      headers: { origin: `http://${host}`, host },
    });
    expect(() => assertSameOrigin(request)).toThrow(ApiError);
  });
  it('preserves an explicit HTTPS deployment origin behind an internal local URL', () => {
    process.env.APP_ORIGIN = 'https://studio.example';
    const request = new NextRequest('http://127.0.0.1:3000/api/settings', {
      method: 'PATCH',
      headers: { origin: 'https://studio.example', host: 'studio.example' },
    });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });
  it('keeps first-use setup local when a public origin proxies to an internal local URL', async () => {
    process.env.APP_ORIGIN = 'https://studio.example';
    const request = new NextRequest('http://127.0.0.1:3000/api/auth/setup', {
      method: 'POST',
      headers: {
        origin: 'https://studio.example',
        host: 'studio.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: 'short' }),
    });
    const response = await setupStudio(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'SETUP_LOCAL_ONLY' },
    });
  });
  it('rejects cross-origin mutations and DNS rebinding by default', () => {
    delete process.env.APP_ORIGIN;
    expect(() =>
      assertSameOrigin(
        new Request('http://127.0.0.1:3000/api/settings', {
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(
        new Request('http://rebound.example:3000/api/settings', {
          headers: { origin: 'http://rebound.example:3000' },
        }),
      ),
    ).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(
        new Request('http://localhost:3000/api/settings', {
          headers: {
            origin: 'http://localhost:3000',
            host: 'attacker.example',
          },
        }),
      ),
    ).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(
        new Request('http://localhost:3000/api/settings', {
          headers: { origin: 'http://localhost:3000' },
        }),
      ),
    ).not.toThrow();
  });
  it('uses explicit deployment origin and still checks Host', () => {
    process.env.APP_ORIGIN = 'https://studio.example';
    expect(() =>
      assertSameOrigin(
        new Request('https://studio.example/api/settings', {
          headers: { origin: 'https://studio.example', host: 'studio.example' },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request('https://studio.example/api/settings', {
          headers: { origin: 'https://studio.example', host: 'other.example' },
        }),
      ),
    ).toThrow(ApiError);
  });
  it('hashes passwords with a distinct salt and rejects incorrect credentials', async () => {
    const first = await hashPassword('long-password-secret');
    const second = await hashPassword('long-password-secret');
    expect(first).not.toEqual(second);
    expect(await verifyPassword('long-password-secret', first)).toBe(true);
    expect(await verifyPassword('wrong-password', first)).toBe(false);
  });
  it('rejects a forged or password-invalidated session', async () => {
    const request = new Request('http://localhost:3000');
    const response = NextResponse.json({ ok: true });
    const passwordHash = await hashPassword('long-password-secret');
    await setSession(response, request, passwordHash);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=strict');
    expect(
      await isAuthenticated(
        new Request(request.url, { headers: { cookie } }),
        passwordHash,
      ),
    ).toBe(true);
    expect(
      await isAuthenticated(
        new Request(request.url, {
          headers: {
            cookie: cookie.replace('yassdem_session=', 'yassdem_session=x'),
          },
        }),
        passwordHash,
      ),
    ).toBe(false);
    expect(
      await isAuthenticated(
        new Request(request.url, { headers: { cookie } }),
        'a-different-hash',
      ),
    ).toBe(false);
  });
  it('never serializes the password hash in settings', () => {
    const settings = publicSettings({
      id: 'default',
      passwordHash: 'DO-NOT-RETURN',
      preferredStyles: '["Casual Chic"]',
      customStyles: '[]',
    } as Settings);
    expect(settings).not.toHaveProperty('passwordHash');
    expect(settings.preferredStyles).toEqual(['Casual Chic']);
  });
  it('strips provider details from a typed error', async () => {
    const response = apiError(
      Object.assign(new Error('secret key or upstream details'), {
        code: 'RUNWAY_AUTH_FAILED',
        status: 502,
      }),
    );
    expect(await response.json()).toEqual({
      error: { code: 'RUNWAY_AUTH_FAILED', message: 'RUNWAY_AUTH_FAILED' },
    });
  });
});

describe('media validation', () => {
  it('rejects paths outside managed storage', () => {
    expect(() => resolveMediaPath('../../etc/passwd')).toThrow(ApiError);
    expect(() => resolveMediaPath('/etc/passwd')).toThrow(ApiError);
  });
  it('does not trust image MIME or file extensions', async () => {
    await expect(
      uploadMedia(
        multipart('product.png', 'image/png', Buffer.from('not-an-image')),
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    const invalidPng = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
    await expect(
      uploadMedia(multipart('product.png', 'image/png', invalidPng)),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
  });
  it('rejects executable SVG logos explicitly', async () => {
    await expect(
      uploadMedia(
        multipart(
          'logo.svg',
          'image/svg+xml',
          Buffer.from('<svg onload="alert(1)"></svg>'),
          'LOGO',
        ),
      ),
    ).rejects.toMatchObject({ code: 'UNSAFE_SVG_LOGO' });
  });
  it('rasterizes a basic SVG logo and keeps SVG out of the source library', async () => {
    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="6" height="8" fill="#722f37"/></svg>',
    );
    const result = await uploadMedia(
      multipart('logo.svg', 'image/svg+xml', bytes, 'LOGO'),
    );
    expect(result).toMatchObject({
      mimeType: 'image/png',
      name: 'logo.png',
      width: 12,
      height: 8,
      role: 'LOGO',
    });
    await expect(
      uploadMedia(multipart('product.svg', 'image/svg+xml', bytes)),
    ).rejects.toMatchObject({ code: 'SVG_LOGO_ONLY' });
  });
  it('decodes a genuine transparent logo without exposing its server path', async () => {
    const bytes = await sharp({
      create: {
        width: 12,
        height: 8,
        channels: 4,
        background: { r: 114, g: 47, b: 55, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const result = await uploadMedia(
      multipart('logo.png', 'application/octet-stream', bytes, 'LOGO'),
    );
    expect(result).toMatchObject({
      mimeType: 'image/png',
      width: 12,
      height: 8,
      role: 'LOGO',
      url: '/api/media/media1',
    });
    expect(result).not.toHaveProperty('path');
  });
});
