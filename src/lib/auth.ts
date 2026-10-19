import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/http';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'yassdem_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
let keyPromise: Promise<Buffer> | undefined;

async function sessionKey() {
  keyPromise ??= (async () => {
    const directory = path.resolve(
      process.env.STORAGE_DIR || path.join(process.cwd(), 'storage'),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'session.key');
    try {
      await writeFile(file, randomBytes(48), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error;
    }
    const key = await readFile(file);
    if (key.length !== 48) throw new Error('Invalid local session key');
    return key;
  })();
  return keyPromise;
}

export async function getAuthSettings() {
  return db.settings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string) {
  const [format, salt, expected] = hash.split(':');
  if (format !== 'scrypt' || !salt || !expected || expected.length !== 128)
    return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}

function passwordStamp(hash: string) {
  return createHash('sha256').update(hash).digest('hex').slice(0, 24);
}

export async function setSession(
  response: NextResponse,
  request: Request,
  hash: string,
) {
  const value = Buffer.from(
    JSON.stringify({
      exp: Date.now() + SESSION_SECONDS * 1000,
      stamp: passwordStamp(hash),
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', await sessionKey())
    .update(value)
    .digest('base64url');
  response.cookies.set(SESSION_COOKIE, `${value}.${signature}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure:
      new URL(process.env.APP_ORIGIN || request.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export async function isAuthenticated(
  request: Request,
  existingHash?: string | null,
) {
  const hash =
    existingHash === undefined
      ? (await getAuthSettings()).passwordHash
      : existingHash;
  if (!hash) return false;
  const rawCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  const value = rawCookie?.slice(SESSION_COOKIE.length + 1);
  if (!value || value.length > 1024) return false;
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', await sessionKey())
    .update(payload)
    .digest('base64url');
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    return false;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    );
    return (
      typeof decoded.exp === 'number' &&
      decoded.exp > Date.now() &&
      decoded.stamp === passwordStamp(hash)
    );
  } catch {
    return false;
  }
}

export async function requireAuth(request: Request) {
  if (!(await isAuthenticated(request)))
    throw new ApiError(
      401,
      'AUTH_REQUIRED',
      'Connectez-vous pour accéder au studio.',
    );
}

let loginWindow = { since: Date.now(), attempts: 0 };
export function checkLoginLimit() {
  const now = Date.now();
  if (now - loginWindow.since > 10 * 60 * 1000)
    loginWindow = { since: now, attempts: 0 };
  loginWindow.attempts += 1;
  if (loginWindow.attempts > 10)
    throw new ApiError(
      429,
      'LOGIN_RATE_LIMIT',
      'Trop de tentatives. Réessayez dans dix minutes.',
    );
}

export function validatePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 256) {
    throw new ApiError(
      400,
      'PASSWORD_LENGTH',
      'Le mot de passe doit contenir entre 12 et 256 caractères.',
    );
  }
  return value;
}
