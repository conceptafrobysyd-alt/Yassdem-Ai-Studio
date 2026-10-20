import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:https';
import type { IncomingMessage, ClientRequest } from 'node:http';
import type { RequestOptions } from 'node:https';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';

const isolated = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    if (!isolated.client) throw new Error('No database');
    return isolated.client;
  },
}));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
import {
  fetchProductImportBytes,
  importProduct,
  isPublicProductAddress,
  parseProductImportData,
  pinnedProductLookup,
  productImportUrl,
  shopifyProductEndpoint,
} from '@/lib/product-import';
import { deleteMedia, resolveMediaPath } from '@/lib/media';
import { duplicateProject } from '@/lib/projects';
import { POST } from '@/app/api/projects/[id]/product-import/route';

type Fixture = {
  body: Buffer;
  status?: number;
  contentType?: string;
  length?: number;
  encoding?: string;
  chunks?: Buffer[];
};
let directory = '';
const previousStorage = process.env.STORAGE_DIR;
const previousOrigin = process.env.APP_ORIGIN;
const fixtures = new Map<string, Fixture>();
const calls: {
  url: string;
  options: RequestOptions;
  pinnedAddress?: unknown;
}[] = [];
const productUrl =
  'https://merchant.example.com/fr/products/signature-bag?variant=123';
const endpoint = 'https://merchant.example.com/fr/products/signature-bag.js';
const imageUrl = 'https://cdn.example.com/bag.png?v=123';
let image: Buffer;
const input = (overrides: Record<string, unknown> = {}) => ({
  productUrl,
  source: 'shopify',
  authorized: true,
  replaceProjectName: false,
  idempotencyKey: crypto.randomUUID(),
  ...overrides,
});

function network() {
  vi.mocked(lookup).mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ] as never);
  const implementation = (
    url: URL,
    options: RequestOptions,
    callback: (message: IncomingMessage) => void,
  ) => {
    const entry = {
      url: url.href,
      options,
      pinnedAddress: undefined as unknown,
    };
    calls.push(entry);
    const req = new EventEmitter() as ClientRequest;
    let cancelled = false;
    req.destroy = (() => {
      cancelled = true;
      return req;
    }) as typeof req.destroy;
    req.end = (() => {
      queueMicrotask(() => {
        if (cancelled) return;
        options.lookup!(url.hostname, {}, (error, address) => {
          if (error) {
            req.emit('error', error);
            return;
          }
          entry.pinnedAddress = address;
          const fixture = fixtures.get(url.href);
          if (!fixture) {
            req.emit('error', new Error('Missing fixture'));
            return;
          }
          const response = Readable.from(
            fixture.chunks ?? [fixture.body],
          ) as IncomingMessage;
          response.statusCode = fixture.status ?? 200;
          response.headers = {
            'content-type':
              fixture.contentType ??
              (url.pathname.endsWith('.js') ? 'application/json' : 'image/png'),
            ...(fixture.length !== undefined
              ? { 'content-length': String(fixture.length) }
              : {}),
            ...(fixture.encoding
              ? { 'content-encoding': fixture.encoding }
              : {}),
          };
          callback(response);
        });
      });
      return req;
    }) as typeof req.end;
    return req;
  };
  vi.mocked(request).mockImplementation(implementation as typeof request);
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'yassdem-product-import-'));
  process.env.STORAGE_DIR = directory;
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  isolated.client = new PrismaClient({
    adapter: new PrismaBetterSQLite3({
      url: `file:${path.join(directory, 'test.db')}`,
    }),
  });
  const migrations = path.join(process.cwd(), 'prisma/migrations');
  for (const migration of (await readdir(migrations, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(
      path.join(migrations, migration.name, 'migration.sql'),
      'utf8',
    );
    for (const statement of sql
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean))
      await isolated.client.$executeRawUnsafe(statement);
  }
  image = await sharp({
    create: { width: 64, height: 48, channels: 4, background: '#cf1020' },
  })
    .png()
    .toBuffer();
});
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.clear();
  calls.length = 0;
  network();
  fixtures.set(endpoint, {
    contentType: 'application/json',
    body: Buffer.from(
      JSON.stringify({
        title: 'Signature Bag',
        description: '<p>Coton &amp; détails vérifiés.</p>',
        images: [imageUrl],
      }),
    ),
  });
  fixtures.set(imageUrl, { body: image, contentType: 'image/png' });
});
afterAll(async () => {
  await isolated.client?.$disconnect();
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previousOrigin;
  await rm(directory, { recursive: true, force: true });
});

describe('authorized product URL imports', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '168.63.129.16',
    '169.254.169.254',
    '172.16.1.1',
    '192.168.1.1',
    '192.0.0.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:93.184.216.34',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '64:ff9b::7f00:1',
    '3fff::1',
  ])('rejects non-global DNS address %s', (address) =>
    expect(isPublicProductAddress(address)).toBe(false),
  );
  it('pins all socket lookups to the validated public address and refuses mixed public/private answers', async () => {
    expect(isPublicProductAddress('93.184.216.34')).toBe(true);
    expect(isPublicProductAddress('2606:4700:4700::1111')).toBe(true);
    const pin = pinnedProductLookup([{ address: '93.184.216.34', family: 4 }]);
    await new Promise<void>((resolve, reject) =>
      pin('merchant.example.com', {}, (error, address, family) => {
        try {
          expect(error).toBeNull();
          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );
    await new Promise<void>((resolve, reject) =>
      pin('merchant.example.com', { all: true }, (error, address) => {
        try {
          expect(error).toBeNull();
          expect(address).toEqual([{ address: '93.184.216.34', family: 4 }]);
          resolve();
        } catch (error) {
          reject(error);
        }
      }),
    );
    expect(() =>
      pinnedProductLookup([
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    ).toThrow();
    expect(() =>
      pinnedProductLookup([{ address: '93.184.216.34', family: 6 }]),
    ).toThrow();
  });
  it.each([
    'http://merchant.example.com/products/bag',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://[::1]/',
    'https://[2606:4700:4700::1111]/',
    'https://user:pass@merchant.example.com/',
    'https://merchant.example.com:8443/',
    'https://merchant.example.com./',
    'https://localhost/',
    'https://service.internal/',
    'https://merchant.example.com/?access_token=abc',
    'https://merchant.example.com/?X-Amz-Signature=abc',
    'https://merchant.example.com/#secret',
    'https://merchant.example.com\\@localhost/',
    ' https://merchant.example.com/',
  ])('rejects unsafe URL %s', (value) =>
    expect(() => productImportUrl(value)).toThrow(),
  );
  it('derives only the official Shopify product JSON endpoint without reading a product page', () => {
    expect(shopifyProductEndpoint(productImportUrl(productUrl)).href).toBe(
      endpoint,
    );
    expect(
      shopifyProductEndpoint(
        productImportUrl(
          'https://merchant.example.com/collections/bags/products/bag-1',
        ),
      ).href,
    ).toBe('https://merchant.example.com/products/bag-1.js');
    expect(
      shopifyProductEndpoint(
        productImportUrl('https://merchant.example.com/en-us/products/bag'),
      ).href,
    ).toBe('https://merchant.example.com/en-us/products/bag.js');
    for (const value of [
      'https://merchant.example.com/blog',
      'https://merchant.example.com/products/../admin',
      'https://merchant.example.com/products/a%2fb',
    ])
      expect(() => shopifyProductEndpoint(productImportUrl(value))).toThrow();
  });
  it('accepts a documented JSON or JSON-LD contract and normalizes Shopify descriptions to plain text', () => {
    const parsed = parseProductImportData(
      Buffer.from(
        JSON.stringify({
          title: 'Bag',
          description: '<script>bad()</script><p>Coton &amp; soie</p>',
          images: ['//cdn.example.com/a.png'],
        }),
      ),
      'shopify',
      new URL(endpoint),
    );
    expect(parsed).toEqual({
      name: 'Bag',
      description: 'Coton & soie',
      images: ['https://cdn.example.com/a.png'],
    });
    const jsonLd = parseProductImportData(
      Buffer.from(
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: 'Bag',
          image: imageUrl,
        }),
      ),
      'json',
      new URL(endpoint),
    );
    expect(jsonLd.images).toEqual([imageUrl]);
    expect(() =>
      parseProductImportData(
        Buffer.from('<html>page</html>'),
        'json',
        new URL(endpoint),
      ),
    ).toThrow();
  });
  it('requires authorization and keeps the route private before any outbound request', async () => {
    const project = await isolated.client!.project.create({
      data: { name: 'Private' },
    });
    await expect(
      importProduct(project.id, input({ authorized: false })),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_AUTHORIZATION_REQUIRED' });
    expect(request).not.toHaveBeenCalled();
    const origin = 'http://127.0.0.1:3000';
    const unauthenticated = await POST(
      new Request(origin + `/api/projects/${project.id}/product-import`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify(input()),
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(unauthenticated.status).toBe(401);
    const foreign = await POST(
      new Request(origin + `/api/projects/${project.id}/product-import`, {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify(input()),
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(foreign.status).toBe(403);
    expect(request).not.toHaveBeenCalled();
  });
  it('enforces public DNS, TLS, no redirects, JSON MIME, total byte caps and no forwarded credentials', async () => {
    const bytes = await fetchProductImportBytes(
      new URL(endpoint),
      1000,
      'json',
    );
    expect(JSON.parse(bytes.toString()).title).toBe('Signature Bag');
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(calls[0].pinnedAddress).toBe('93.184.216.34');
    expect(calls[0].options).toMatchObject({
      rejectUnauthorized: true,
      servername: 'merchant.example.com',
      agent: false,
    });
    expect(calls[0].options.headers).not.toHaveProperty('Authorization');
    expect(calls[0].options.headers).not.toHaveProperty('Cookie');
    fixtures.set(endpoint, {
      status: 302,
      body: Buffer.from('redirect'),
      contentType: 'application/json',
    });
    await expect(
      fetchProductImportBytes(new URL(endpoint), 1000, 'json'),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_REDIRECT' });
    fixtures.set(endpoint, {
      body: Buffer.from('<html>not an API</html>'),
      contentType: 'text/html',
    });
    await expect(
      fetchProductImportBytes(new URL(endpoint), 1000, 'json'),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_JSON_REQUIRED' });
    fixtures.set(endpoint, {
      body: Buffer.from('{}'),
      contentType: 'application/json',
      length: 1001,
    });
    await expect(
      fetchProductImportBytes(new URL(endpoint), 1000, 'json'),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_TOO_LARGE' });
    fixtures.set(endpoint, {
      body: Buffer.from('{}'),
      contentType: 'application/json',
      chunks: [Buffer.alloc(600), Buffer.alloc(600)],
    });
    await expect(
      fetchProductImportBytes(new URL(endpoint), 1000, 'json'),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_TOO_LARGE' });
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(
      fetchProductImportBytes(new URL(endpoint), 1000, 'json'),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_UNSAFE_URL' });
  });
  it('imports actual decoded image pixels, preserves project fields, prevents duplicate downloads and remaps copies', async () => {
    const project = await isolated.client!.project.create({
      data: {
        name: 'Keep my title',
        parameters: JSON.stringify({
          editor: { clips: [] },
          seo: { custom: true },
        }),
      },
    });
    const body = input();
    const result = await importProduct(project.id, body);
    expect(calls.map((call) => call.url)).toEqual([endpoint, imageUrl]);
    expect(result.project.name).toBe('Keep my title');
    expect(result.project.parameters).toMatchObject({
      editor: { clips: [] },
      seo: { custom: true },
    });
    expect(result.productReference).toMatchObject({
      name: 'Signature Bag',
      description: 'Coton & détails vérifiés.',
      productUrl,
      source: 'shopify',
    });
    expect(result.media).toHaveLength(1);
    const media = result.media[0];
    expect(media).toMatchObject({
      width: 64,
      height: 48,
      mimeType: 'image/png',
      role: 'SOURCE',
      projectId: project.id,
    });
    expect(media).not.toHaveProperty('path');
    const stored = await isolated.client!.media.findUniqueOrThrow({
      where: { id: media.id },
    });
    const pixels = await sharp(await readFile(resolveMediaPath(stored.path)))
      .raw()
      .toBuffer();
    expect([...pixels.subarray(0, 3)]).toEqual([207, 16, 32]);
    await expect(deleteMedia(media.id)).rejects.toMatchObject({
      code: 'MEDIA_IN_USE',
    });
    const retry = await importProduct(project.id, body);
    expect(retry.media.map((item) => item.id)).toEqual([media.id]);
    expect(request).toHaveBeenCalledTimes(2);
    await expect(
      importProduct(project.id, {
        ...body,
        productUrl: 'https://merchant.example.com/products/another',
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_IMPORT_IDEMPOTENCY_CONFLICT' });
    const duplicate = await duplicateProject(project.id);
    const reference = (duplicate.parameters as Record<string, unknown>)
      .productReference as { imageMediaIds: string[] };
    expect(reference.imageMediaIds).toHaveLength(1);
    expect(reference.imageMediaIds[0]).not.toBe(media.id);
    const copied = await isolated.client!.media.findUniqueOrThrow({
      where: { id: reference.imageMediaIds[0] },
    });
    expect(await readFile(resolveMediaPath(copied.path))).toEqual(
      await readFile(resolveMediaPath(stored.path)),
    );
  });
  it('supports authorized generic JSON and only replaces the project title when requested', async () => {
    const project = await isolated.client!.project.create({
      data: { name: 'Original' },
    });
    const api = 'https://merchant.example.com/api/catalog/bag.json';
    fixtures.set(api, {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify({
          name: 'Renamed',
          description: 'Verified details',
          images: [imageUrl],
        }),
      ),
    });
    const result = await importProduct(
      project.id,
      input({
        source: 'json',
        structuredDataUrl: api,
        replaceProjectName: true,
      }),
    );
    expect(result.project.name).toBe('Renamed');
    expect(result.productReference.structuredDataUrl).toBe(api);
    expect(calls.map((call) => call.url)).toEqual([api, imageUrl]);
  });
  it('cleans up downloaded files and database rows after a later image or transaction failure', async () => {
    const baseline = (await readdir(path.join(directory, 'media'))).sort();
    const rows = await isolated.client!.media.count();
    const bad = 'https://cdn.example.com/forged.png';
    fixtures.set(endpoint, {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify({ title: 'Bad', images: [imageUrl, bad] }),
      ),
    });
    fixtures.set(bad, {
      body: Buffer.from('not really an image'),
      contentType: 'image/png',
    });
    const project = await isolated.client!.project.create({
      data: { name: 'Failed import' },
    });
    await expect(importProduct(project.id, input())).rejects.toMatchObject({
      code: 'PRODUCT_IMPORT_INVALID_IMAGE',
    });
    expect(await isolated.client!.media.count()).toBe(rows);
    expect((await readdir(path.join(directory, 'media'))).sort()).toEqual(
      baseline,
    );
    fixtures.set(endpoint, {
      contentType: 'application/json',
      body: Buffer.from(
        JSON.stringify({ title: 'Too large project', images: [imageUrl] }),
      ),
    });
    await isolated.client!.project.update({
      where: { id: project.id },
      data: { parameters: JSON.stringify({ unrelated: 'x'.repeat(19900) }) },
    });
    await expect(importProduct(project.id, input())).rejects.toMatchObject({
      code: 'PRODUCT_IMPORT_PROJECT_TOO_LARGE',
    });
    expect(await isolated.client!.media.count()).toBe(rows);
    expect((await readdir(path.join(directory, 'media'))).sort()).toEqual(
      baseline,
    );
  });
});
