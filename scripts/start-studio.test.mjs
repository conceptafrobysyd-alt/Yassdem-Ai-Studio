import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertPortAvailable, assertSupportedNode, localConfiguration, prepareStudio, spawnNpm, waitForStudio } from './start-studio.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yassdem launcher spaces '));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(relative, value) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  await put('package.json', '{"name":"launcher-fixture"}');
  await put('package-lock.json', '{"lockfileVersion":3}');
  await put('.env.example', 'STORAGE_DIR="./storage"\n');
  await put('src/app/page.tsx', 'original source');
  await put('prisma/schema.prisma', 'original schema');
  await put('prisma/migrations/initial/migration.sql', 'original migration');
  await put('prisma/migrations/migration_lock.toml', 'provider="sqlite"');
  const calls = [];
  let build = 0;
  let fail;
  const options = {
    environment: {}, nodeVersion: '24.22.1', log: () => {},
    runTask: async (operation) => {
      calls.push(operation);
      if (fail === operation) throw new Error(`simulated ${operation} interruption`);
      if (operation === 'install') {
        for (const file of ['next/dist/bin/next', 'tsx/dist/cli.mjs', 'concurrently/dist/bin/concurrently.js', 'prisma/build/index.js', '@prisma/client/index.js']) await put(`node_modules/${file}`, 'installed');
      }
      if (operation === 'build') await put('.next/BUILD_ID', `build-${++build}`);
    },
  };
  return { root, put, calls, options, setFailure: (operation) => { fail = operation; } };
}

test('production preparation caches builds and installs while preserving personal files', async (t) => {
  const f = await fixture(t);
  const privateEnv = 'RUNWAY_API_KEY="not-a-real-secret"\nSTORAGE_DIR="./storage"\n';
  await f.put('.env', privateEnv);
  await f.put('prisma/studio.db', 'personal database');
  await f.put('prisma/custom.sqlite', 'custom database');
  await f.put('storage/real-photo.jpg', 'personal media');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['install', 'migrate', 'build']);
  assert.equal(await readFile(path.join(f.root, '.env'), 'utf8'), privateEnv);
  assert.equal(await readFile(path.join(f.root, 'prisma/studio.db'), 'utf8'), 'personal database');
  assert.equal(await readFile(path.join(f.root, 'storage/real-photo.jpg'), 'utf8'), 'personal media');
  for (const stamp of ['node_modules/.yassdem-install.json', '.next/yassdem-build.json']) assert.doesNotMatch(await readFile(path.join(f.root, stamp), 'utf8'), /not-a-real-secret/);
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate']);
  await f.put('prisma/studio.db', 'new personal database');
  await f.put('prisma/custom.sqlite', 'new custom database');
  await f.put('storage/real-photo.jpg', 'new real image');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate'], 'personal data must never invalidate the build cache');
  await f.put('src/app/page.tsx', 'updated source with creator modes');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate', 'build']);
  await f.put('prisma/migrations/new/migration.sql', 'new migration');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate', 'build']);
  await f.put('package-lock.json', '{"lockfileVersion":3,"updated":true}');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['install', 'migrate', 'build']);
  await prepareStudio(f.root, { ...f.options, nodeVersion: '24.22.2' });
  assert.deepEqual(f.calls.splice(0), ['install', 'migrate', 'build']);
});

test('first installation creates .env once; interrupted install and build cannot leave valid cache stamps', async (t) => {
  const f = await fixture(t);
  f.setFailure('install');
  await assert.rejects(prepareStudio(f.root, f.options), /simulated install/);
  assert.deepEqual(f.calls.splice(0), ['install']);
  await assert.rejects(readFile(path.join(f.root, 'node_modules/.yassdem-install.json')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.root, '.env'), 'utf8'), 'STORAGE_DIR="./storage"\n');
  f.setFailure('build');
  await assert.rejects(prepareStudio(f.root, f.options), /simulated build/);
  assert.deepEqual(f.calls.splice(0), ['install', 'migrate', 'build']);
  await assert.rejects(readFile(path.join(f.root, '.next/yassdem-build.json')), { code: 'ENOENT' });
  f.setFailure(undefined);
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate', 'build'], 'a successful install survives an interrupted build');
  await f.put('.next/BUILD_ID', 'external build');
  await prepareStudio(f.root, f.options);
  assert.deepEqual(f.calls.splice(0), ['migrate', 'build'], 'an external build cannot accidentally reuse a prior stamp');
});

test('local configuration respects custom paths and origin without exposing private .env values', async (t) => {
  const f = await fixture(t);
  await f.put('.env', 'PORT="4567"\nAPP_ORIGIN="http://127.0.0.1:4567"\nSTORAGE_DIR="./mes images"\nRUNWAY_API_KEY="not-a-real-secret"\n');
  const config = await localConfiguration(f.root, {});
  assert.equal(config.url, 'http://127.0.0.1:4567/');
  assert.equal(config.port, 4567);
  assert.equal(config.storage, path.join(f.root, 'mes images'));
  assert.equal(config.environment.RUNWAY_API_KEY, undefined);
  assert.equal(config.environment.PORT, '4567');
  await assert.rejects(localConfiguration(f.root, { PORT: '3000' }), /APP_ORIGIN/);
  await assert.rejects(localConfiguration(f.root, { PORT: '3000 & unsafe' }), /PORT/);
  await assert.rejects(localConfiguration(f.root, { APP_ORIGIN: 'http://example.com/?token=secret' }), (error) => /APP_ORIGIN/.test(error.message) && !error.message.includes('token=secret'));
  for (const version of ['22.12.0', '23.0.0', '24.22.1']) assert.doesNotThrow(() => assertSupportedNode(version));
  for (const version of ['20.0.0', '22.11.9', '25.0.0']) assert.throws(() => assertSupportedNode(version), /Node.js/);
  assert.throws(() => spawnNpm('start & unsafe'), /inconnue/);
});

test('an occupied port is rejected without stopping or contacting the other service', async (t) => {
  let requests = 0;
  const server = http.createServer((request, response) => { requests++; response.end('other application'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  await assert.rejects(assertPortAvailable(port), /déjà utilisé/);
  assert.equal(server.listening, true);
  assert.equal(requests, 0);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'other application');
});

test('readiness requires startup confirmation and a successful HTTP response while the child remains alive', async (t) => {
  let status = 503;
  const server = http.createServer((request, response) => { response.writeHead(status); response.end('startup fixture'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const child = { pid: process.pid, exitCode: null, signalCode: null };
  const port = server.address().port;
  await assert.rejects(waitForStudio(child, port, { isReady: () => false, timeout: 20 }), /trop de temps/);
  await assert.rejects(waitForStudio(child, port, { isReady: () => true, timeout: 20 }), /trop de temps/);
  status = 200;
  await waitForStudio(child, port, { isReady: () => true, timeout: 1000 });
  await assert.rejects(waitForStudio({ ...child, exitCode: 1 }, port, { isReady: () => true }), /arrêté/);
  await assert.rejects(waitForStudio({ ...child, pid: undefined }, port, { isReady: () => true }), /arrêté/);
  await assert.rejects(waitForStudio(child, port, { isReady: () => true, probe: async () => { child.exitCode = 1; return true; } }), /arrêté/);
});
