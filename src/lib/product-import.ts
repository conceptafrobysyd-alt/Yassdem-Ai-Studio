import { randomUUID, createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { db } from './db';
import { ApiError } from './http';
import {
  IMAGE_LIMIT,
  publicMedia,
  resolveMediaPath,
  sniffImage,
  storageRoot,
} from './media';
import { publicProject } from './projects';

const JSON_LIMIT = 1024 * 1024;
const MAX_IMAGES = 3;
const privateV4 = new BlockList();
privateV4.addAddress('168.63.129.16', 'ipv4'); // Azure platform/metadata service.
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const specialV6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  specialV6.addSubnet(address, prefix, 'ipv6');

/** Conservative globally routable addresses only, including DNS answers. */
export function isPublicProductAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4
    ? !privateV4.check(address, 'ipv4')
    : version === 6 &&
        globalV6.check(address, 'ipv6') &&
        !specialV6.check(address, 'ipv6');
}

export function productImportUrl(value: unknown): URL {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    /[\x00-\x20\x7f\\]/.test(value)
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_URL');
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    isIP(hostname.replace(/^\[|\]$/g, '')) ||
    hostname.endsWith('.') ||
    !hostname.includes('.') ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/.test(
      hostname,
    ) ||
    [...url.searchParams.keys()].some((key) =>
      /(?:token|secret|pass(?:word)?|api[_-]?key|auth|signature|credential|cookie|session|x-amz)/i.test(
        key,
      ),
    )
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_UNSAFE_URL');
  return url;
}

export function shopifyProductEndpoint(product: URL): URL {
  const match =
    /^\/(?:(?<locale>[A-Za-z]{2}(?:-[A-Za-z]{2})?)\/)?(?:collections\/[^/]+\/)?products\/(?<handle>[^/]+)\/?$/.exec(
      product.pathname,
    );
  let handle = '';
  try {
    handle = decodeURIComponent(match?.groups?.handle || '');
  } catch {
    /* Invalid encoded handles are refused. */
  }
  if (!match || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(handle))
    throw new ApiError(400, 'PRODUCT_IMPORT_UNSUPPORTED_PRODUCT_URL');
  return new URL(
    `${match.groups?.locale ? `/${match.groups.locale}` : ''}/products/${handle}.js`,
    product.origin,
  );
}

export function pinnedProductLookup(
  answers: { address: string; family: number }[],
): LookupFunction {
  if (
    !answers.length ||
    answers.length > 32 ||
    answers.some(
      (answer) =>
        ![4, 6].includes(answer.family) ||
        isIP(answer.address) !== answer.family ||
        !isPublicProductAddress(answer.address),
    )
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_UNSAFE_URL');
  const chosen = answers.find((answer) => answer.family === 4) || answers[0];
  return (_hostname, options, callback) => {
    // Never perform another DNS lookup between validation and the TLS socket.
    callback(
      null,
      options.all
        ? [{ address: chosen.address, family: chosen.family }]
        : chosen.address,
      chosen.family,
    );
  };
}

/** Requests only a validated, DNS-pinned public HTTPS destination. No cookies,
 * authorization, proxy credentials or user-supplied headers are forwarded.
 * Redirects and compressed response bodies are deliberately unsupported.
 */
export async function fetchProductImportBytes(
  url: URL,
  limit: number,
  kind: 'json' | 'image',
) {
  url = productImportUrl(url.href);
  let answers: { address: string; family: number }[];
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    answers = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), 8000);
      }),
    ]);
  } catch {
    throw new ApiError(502, 'PRODUCT_IMPORT_DNS');
  } finally {
    if (dnsTimer) clearTimeout(dnsTimer);
  }
  const pinned = pinnedProductLookup(answers);
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: ApiError, bytes?: Buffer) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(bytes!);
    };
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: pinned,
        servername: url.hostname,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
        headers: {
          Accept:
            kind === 'json'
              ? 'application/json, application/ld+json'
              : 'image/png, image/jpeg, image/webp',
          'Accept-Encoding': 'identity',
          'User-Agent': 'Yassdem-AI-Studio/0.1 authorized-product-import',
        },
      },
      (response) => {
        const refuse = (code: string, status = 400) => {
          finish(new ApiError(status, code));
          response.destroy();
          request.destroy();
        };
        if (
          (response.statusCode ?? 0) >= 300 &&
          (response.statusCode ?? 0) < 400
        )
          return refuse('PRODUCT_IMPORT_REDIRECT');
        if (response.statusCode !== 200)
          return refuse('PRODUCT_IMPORT_FETCH_FAILED', 502);
        const encoding = response.headers['content-encoding'];
        if (encoding && encoding !== 'identity')
          return refuse('PRODUCT_IMPORT_FETCH_FAILED', 502);
        const contentType = String(response.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        if (
          kind === 'json' &&
          !/^application\/(?:json|ld\+json|[a-z0-9!#$&^_.+-]+\+json)$/.test(
            contentType,
          )
        )
          return refuse('PRODUCT_IMPORT_JSON_REQUIRED');
        if (Number(response.headers['content-length'] || 0) > limit)
          return refuse('PRODUCT_IMPORT_TOO_LARGE', 413);
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          if (done) return;
          size += chunk.length;
          if (size > limit) return refuse('PRODUCT_IMPORT_TOO_LARGE', 413);
          chunks.push(Buffer.from(chunk));
        });
        response.on('end', () =>
          size
            ? finish(undefined, Buffer.concat(chunks, size))
            : finish(new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA')),
        );
        response.on('error', () =>
          finish(new ApiError(502, 'PRODUCT_IMPORT_FETCH_FAILED')),
        );
        response.on('aborted', () =>
          finish(new ApiError(502, 'PRODUCT_IMPORT_FETCH_FAILED')),
        );
      },
    );
    request.on('error', () =>
      finish(new ApiError(502, 'PRODUCT_IMPORT_FETCH_FAILED')),
    );
    timer = setTimeout(() => {
      finish(new ApiError(504, 'PRODUCT_IMPORT_FETCH_FAILED'));
      request.destroy();
    }, 15000);
    request.end();
  });
}

export interface ProductReference {
  name: string;
  description: string;
  productUrl: string;
  structuredDataUrl: string;
  source: 'shopify' | 'json';
  imageMediaIds: string[];
  importedAt: string;
}
type ImportRecord = ProductReference & {
  idempotencyKey: string;
  fingerprint: string;
};
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
function text(value: unknown, maximum: number, required = false) {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (required && !value.trim())
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
}
function plainDescription(value: string) {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  // This is plain text extraction, not an HTML sanitizer. It is never rendered as HTML.
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (token) => entities[token.slice(1, -1)],
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}
export function parseProductImportData(
  bytes: Buffer,
  source: 'shopify' | 'json',
  endpoint: URL,
) {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  }
  if (!object(value)) throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  const jsonLd =
    source === 'json' &&
    (value['@type'] === 'Product' ||
      (Array.isArray(value['@type']) && value['@type'].includes('Product')));
  const name = text(source === 'shopify' ? value.title : value.name, 150, true);
  const description =
    source === 'shopify'
      ? plainDescription(text(value.description ?? '', 30000))
      : text(value.description ?? '', 3000);
  let rawImages: unknown = jsonLd ? value.image : value.images;
  if (jsonLd && typeof rawImages === 'string') rawImages = [rawImages];
  if (
    source === 'shopify' &&
    Array.isArray(rawImages) &&
    !rawImages.length &&
    typeof value.featured_image === 'string'
  )
    rawImages = [value.featured_image];
  if (!Array.isArray(rawImages) || !rawImages.length || rawImages.length > 100)
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  const images = [
    ...new Set(
      rawImages.slice(0, MAX_IMAGES).map((raw) => {
        if (typeof raw !== 'string' || raw.length > 2048)
          throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
        let image: string;
        try {
          image = new URL(raw, endpoint).href;
        } catch {
          throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
        }
        return productImportUrl(image).href;
      }),
    ),
  ];
  return { name, description, images };
}

function parameters(value: string): Record<string, unknown> {
  try {
    const result: unknown = JSON.parse(value);
    if (object(result)) return result;
  } catch {
    /* Invalid stored state is refused. */
  }
  throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
}
function importHistory(value: Record<string, unknown>) {
  if (value.productImports === undefined) return [];
  if (
    !Array.isArray(value.productImports) ||
    value.productImports.length > 20 ||
    value.productImports.some(
      (item) =>
        !object(item) ||
        typeof item.idempotencyKey !== 'string' ||
        typeof item.fingerprint !== 'string',
    )
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  return value.productImports as ImportRecord[];
}
function publicReference(record: ImportRecord): ProductReference {
  const {
    idempotencyKey: _key,
    fingerprint: _fingerprint,
    ...reference
  } = record;
  return reference;
}
let busy = false;

export async function importProduct(
  projectId: string,
  input: Record<string, unknown>,
) {
  if (input.authorized !== true)
    throw new ApiError(400, 'PRODUCT_IMPORT_AUTHORIZATION_REQUIRED');
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(projectId) ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.idempotencyKey) ||
    Object.keys(input).some(
      (key) =>
        ![
          'productUrl',
          'source',
          'structuredDataUrl',
          'authorized',
          'replaceProjectName',
          'idempotencyKey',
        ].includes(key),
    ) ||
    (input.replaceProjectName !== undefined &&
      typeof input.replaceProjectName !== 'boolean')
  )
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  const source = input.source ?? 'shopify';
  if (source !== 'shopify' && source !== 'json')
    throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_DATA');
  const product = productImportUrl(input.productUrl);
  const endpoint =
    source === 'shopify'
      ? shopifyProductEndpoint(product)
      : productImportUrl(input.structuredDataUrl);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        source,
        productUrl: product.href,
        structuredDataUrl: endpoint.href,
        replaceProjectName: input.replaceProjectName === true,
      }),
    )
    .digest('hex');
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
  const existing = importHistory(parameters(project.parameters)).find(
    (item) => item.idempotencyKey === input.idempotencyKey,
  );
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new ApiError(409, 'PRODUCT_IMPORT_IDEMPOTENCY_CONFLICT');
    const media = await db.media.findMany({
      where: { id: { in: existing.imageMediaIds } },
    });
    return {
      project: publicProject(project),
      media: media.map(publicMedia),
      productReference: publicReference(existing),
    };
  }
  if (busy) throw new ApiError(429, 'PRODUCT_IMPORT_BUSY');
  busy = true;
  const createdPaths: string[] = [];
  try {
    const data = parseProductImportData(
      await fetchProductImportBytes(endpoint, JSON_LIMIT, 'json'),
      source,
      endpoint,
    );
    const downloaded: {
      name: string;
      path: string;
      mimeType: string;
      size: number;
      width: number;
      height: number;
    }[] = [];
    await mkdir(path.join(storageRoot(), 'media'), {
      recursive: true,
      mode: 0o700,
    });
    for (const [index, image] of data.images.entries()) {
      const bytes = await fetchProductImportBytes(
        productImportUrl(image),
        IMAGE_LIMIT,
        'image',
      );
      const format = sniffImage(bytes);
      if (!format) throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_IMAGE');
      let decoded: { data: Buffer; info: OutputInfo };
      try {
        decoded = await sharp(bytes, {
          animated: false,
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .timeout({ seconds: 15 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        throw new ApiError(400, 'PRODUCT_IMPORT_INVALID_IMAGE');
      }
      if (decoded.data.length > IMAGE_LIMIT)
        throw new ApiError(413, 'PRODUCT_IMPORT_TOO_LARGE');
      const extension = format === 'jpeg' ? 'jpg' : format;
      const relative = `media/${randomUUID()}-product.${extension}`;
      const file = resolveMediaPath(relative);
      await writeFile(file, decoded.data, { flag: 'wx', mode: 0o600 });
      createdPaths.push(file);
      downloaded.push({
        name: `${data.name.slice(0, 130)}-${index + 1}.${extension}`,
        path: relative,
        mimeType: `image/${format}`,
        size: decoded.data.length,
        width: decoded.info.width,
        height: decoded.info.height,
      });
    }
    const result = await db.$transaction(async (tx) => {
      const current = await tx.project.findUnique({ where: { id: projectId } });
      if (!current) throw new ApiError(404, 'PROJECT_NOT_FOUND');
      const currentParameters = parameters(current.parameters);
      const history = importHistory(currentParameters);
      if (history.some((item) => item.idempotencyKey === input.idempotencyKey))
        throw new ApiError(409, 'PRODUCT_IMPORT_IDEMPOTENCY_CONFLICT');
      if (history.length >= 20)
        throw new ApiError(400, 'PRODUCT_IMPORT_PROJECT_TOO_LARGE');
      const media = [];
      for (const file of downloaded)
        media.push(
          await tx.media.create({
            data: { ...file, role: 'SOURCE', projectId },
          }),
        );
      const record: ImportRecord = {
        name: data.name,
        description: data.description,
        source,
        productUrl: product.href,
        structuredDataUrl: endpoint.href,
        imageMediaIds: media.map((item) => item.id),
        importedAt: new Date().toISOString(),
        idempotencyKey: input.idempotencyKey as string,
        fingerprint,
      };
      const merged = JSON.stringify({
        ...currentParameters,
        productReference: publicReference(record),
        productImports: [...history, record],
      });
      if (merged.length > 20000)
        throw new ApiError(400, 'PRODUCT_IMPORT_PROJECT_TOO_LARGE');
      const updated = await tx.project.update({
        where: { id: projectId },
        data: {
          parameters: merged,
          ...(input.replaceProjectName === true ? { name: data.name } : {}),
        },
      });
      return {
        project: publicProject(updated),
        media: media.map(publicMedia),
        productReference: publicReference(record),
      };
    });
    createdPaths.length = 0;
    return result;
  } finally {
    await Promise.all(createdPaths.map((file) => unlink(file).catch(() => {})));
    busy = false;
  }
}
