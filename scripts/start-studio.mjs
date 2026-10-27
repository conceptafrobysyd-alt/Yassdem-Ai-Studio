import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const npmCommands = {
  version: ['--version'],
  install: ['ci', '--include=dev'],
  migrate: ['run', 'db:deploy'],
  build: ['run', 'build'],
  start: ['start'],
};

async function exists(file) {
  return access(file).then(() => true, () => false);
}

async function readJson(file) {
  return readFile(file, 'utf8').then((value) => JSON.parse(value)).catch(() => null);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export function assertSupportedNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!(major >= 22 && major < 25 && (major !== 22 || minor >= 12)))
    throw new Error('Installez Node.js 24 LTS (ou Node.js 22.12 minimum, avant la version 25), puis relancez le studio.');
}

export async function localConfiguration(root, environment = process.env) {
  const envPath = path.join(root, '.env');
  const contents = await readFile(await exists(envPath) ? envPath : path.join(root, '.env.example'), 'utf8');
  const values = { ...parseEnv(contents), ...environment };
  const rawPort = values.PORT || '3000';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
    throw new Error('PORT doit être un nombre de 1 à 65535 dans votre configuration.');
  const port = Number(rawPort);
  let url = `http://localhost:${port}/`;
  if (values.APP_ORIGIN) {
    let origin;
    try { origin = new URL(values.APP_ORIGIN); } catch { /* Message below never prints configuration values. */ }
    if (!origin || origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
        Number(origin.port || '80') !== port || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash)
      throw new Error(`Le lanceur local nécessite APP_ORIGIN vide, ou http://localhost:${port}, ou http://127.0.0.1:${port}. Vérifiez uniquement cette option dans votre .env.`);
    url = `${origin.origin}/`;
  }
  return {
    port, url,
    storage: path.resolve(root, values.STORAGE_DIR || 'storage'),
    // Do not copy private .env values into logs, caches, or command arguments.
    environment: { ...environment, PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' },
  };
}

export async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => reject(new Error(error.code === 'EADDRINUSE'
      ? `Le port ${port} est déjà utilisé. Si une autre fenêtre Yassdem est ouverte, arrêtez-la avec Ctrl+C, puis relancez ce fichier. Aucun processus n'a été fermé.`
      : `Impossible d'utiliser le port local ${port} (${error.code || 'erreur réseau'}).`)));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(resolve));
  });
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Un verrou de démarrage est illisible. Fermez les anciennes fenêtres Yassdem et demandez une vérification.');
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

async function assertWorkerStopped(storage) {
  const lock = path.join(storage, '.worker.lock');
  if (!await exists(lock)) return;
  const owner = await readJson(lock);
  if (!owner || processAlive(owner.pid))
    throw new Error('Un traitement Yassdem est déjà actif, ou son verrou nécessite une vérification. Arrêtez son ancienne fenêtre avec Ctrl+C avant de relancer.');
}

async function acquireLauncherLock(storage) {
  await mkdir(storage, { recursive: true });
  const file = path.join(storage, '.launcher.lock');
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open(file, 'wx', 0o600);
      await handle.writeFile(owner);
      await handle.close();
      return async () => {
        if (await readFile(file, 'utf8').catch(() => '') === owner) await unlink(file).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const cleanupFile = `${file}.cleanup`;
      let cleanup;
      try { cleanup = await open(cleanupFile, 'wx', 0o600); }
      catch { throw new Error('Une autre ouverture du studio est en cours. Patientez dans sa fenêtre.'); }
      try {
        const previous = await readJson(file);
        if (!previous || processAlive(previous.pid))
          throw new Error('Une autre ouverture du studio est en cours. Patientez dans sa fenêtre.');
        await unlink(file).catch((cause) => { if (cause.code !== 'ENOENT') throw cause; });
      } finally {
        await cleanup.close();
        await unlink(cleanupFile).catch(() => {});
      }
    }
  }
  throw new Error('Impossible de réserver le démarrage du studio.');
}

export function spawnNpm(operation, { root, environment, platform = process.platform } = {}) {
  const args = npmCommands[operation];
  if (!args) throw new Error('Commande de lancement inconnue.');
  const options = { cwd: root, env: environment, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true };
  // Only fixed npm commands reach cmd.exe; paths and .env values are never shell code.
  return platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], options)
    : spawn('npm', args, options);
}

function relayOutput(child, observe = () => {}) {
  for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream?.on('data', (chunk) => { target.write(chunk); observe(chunk.toString()); });
  }
}

function waitForExit(child, operation) {
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('npm est introuvable ou ne peut pas démarrer. Réinstallez Node.js 24 LTS, puis rouvrez ce fichier.')));
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${operation} interrompu${signal ? '' : ` (code ${code})`}. Consultez le message affiché juste au-dessus avant de réessayer.`)));
  });
}

async function sourceFingerprint(root, installKey, environment) {
  const hash = createHash('sha256').update(installKey);
  const files = [];
  async function collect(relative, accept = () => true) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])) {
      const item = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(item, accept);
      else if (entry.isFile() && accept(entry.name)) files.push(item);
    }
  }
  for (const directory of ['src', 'public']) await collect(directory);
  await collect(path.join('prisma', 'migrations'), (name) => /\.(sql|toml)$/.test(name));
  files.push(path.join('prisma', 'schema.prisma'));
  files.push('next.config.ts', 'next.config.mjs', 'next.config.js', 'tsconfig.json', 'postcss.config.mjs', 'postcss.config.js',
    'package.json', 'package-lock.json', '.env', '.env.local', '.env.production', '.env.production.local');
  for (const relative of files.sort()) {
    const contents = await readFile(path.join(root, relative)).catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
    if (contents) hash.update(relative).update('\0').update(contents).update('\0');
  }
  for (const key of Object.keys(environment).filter((key) => key.startsWith('NEXT_PUBLIC_')).sort()) hash.update(key).update('\0').update(environment[key] || '').update('\0');
  return hash.digest('hex');
}

export async function prepareStudio(root, { environment = process.env, nodeVersion = process.versions.node, runTask, log = console.log } = {}) {
  assertSupportedNode(nodeVersion);
  const envFile = path.join(root, '.env');
  if (!await exists(envFile)) await copyFile(path.join(root, '.env.example'), envFile, constants.COPYFILE_EXCL).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  const installKey = createHash('sha256').update(nodeVersion).update(process.platform).update(process.arch)
    .update(await readFile(path.join(root, 'package.json'))).update(await readFile(path.join(root, 'package-lock.json'))).digest('hex');
  const installStamp = path.join(root, 'node_modules', '.yassdem-install.json');
  const executables = ['next/dist/bin/next', 'tsx/dist/cli.mjs', 'concurrently/dist/bin/concurrently.js', 'prisma/build/index.js', '@prisma/client/index.js'];
  const dependenciesReady = (await readJson(installStamp))?.key === installKey &&
    (await Promise.all(executables.map((file) => exists(path.join(root, 'node_modules', file))))).every(Boolean);
  if (!dependenciesReady) {
    log('Installation des dépendances — nécessaire au premier lancement ou après une mise à jour.');
    await unlink(installStamp).catch(() => {});
    await runTask('install');
    await writeJson(installStamp, { key: installKey });
  }
  log('Vérification de la base et application des migrations disponibles.');
  await runTask('migrate');
  const buildKey = await sourceFingerprint(root, installKey, environment);
  const buildStamp = path.join(root, '.next', 'yassdem-build.json');
  const buildId = await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8').catch(() => null);
  const previousBuild = await readJson(buildStamp);
  if (!buildId || previousBuild?.key !== buildKey || previousBuild?.buildId !== buildId) {
    log('Préparation de la version optimisée. Cette première étape peut prendre plusieurs minutes.');
    await unlink(buildStamp).catch(() => {});
    await runTask('build');
    const completedBuildId = await readFile(path.join(root, '.next', 'BUILD_ID'), 'utf8');
    if (!completedBuildId.trim()) throw new Error('Le build ne contient pas de version exploitable.');
    await writeJson(buildStamp, { key: buildKey, buildId: completedBuildId });
  } else log('La version optimisée est à jour : démarrage sans recompilation.');
}

function probePage(port) {
  return new Promise((resolve) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 2000 }, (response) => {
      response.resume(); resolve(response.statusCode === 200);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

export async function waitForStudio(child, port, { isReady, timeout = 120000, probe = probePage } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) throw new Error('Le studio s’est arrêté pendant son démarrage. Consultez les lignes [web] et [worker] ci-dessus.');
    if (isReady() && await probe(port)) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Le studio s’est arrêté pendant son démarrage. Consultez les lignes [web] et [worker] ci-dessus.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Le studio met trop de temps à répondre. Consultez les lignes [web] et [worker] ci-dessus.');
}

function openBrowser(url) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], { stdio: 'ignore', windowsHide: true })
    : process.platform === 'darwin'
      ? spawn('open', [url], { stdio: 'ignore' })
      : spawn('xdg-open', [url], { stdio: 'ignore' });
  child.once('error', () => console.log(`Ouvrez cette adresse dans votre navigateur : ${url}`));
}

async function main() {
  assertSupportedNode();
  const root = rootDirectory;
  const config = await localConfiguration(root);
  await assertPortAvailable(config.port);
  await assertWorkerStopped(config.storage);
  const release = await acquireLauncherLock(config.storage);
  let currentChild;
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (currentChild && currentChild.exitCode === null && currentChild.signalCode === null) {
      if (process.platform === 'win32') {
        // Only the process tree created by this launcher is stopped.
        const cleanup = spawn('taskkill.exe', ['/PID', String(currentChild.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        cleanup.once('error', () => {});
      } else currentChild.kill('SIGINT');
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const runTask = async (operation) => {
      if (stopping) throw new Error('Démarrage arrêté.');
      currentChild = spawnNpm(operation, { root, environment: config.environment });
      relayOutput(currentChild);
      await waitForExit(currentChild, operation);
    };
    await runTask('version');
    await prepareStudio(root, { environment: config.environment, runTask });
    if (stopping) return;
    console.log('Démarrage du studio et du traitement vidéo. Gardez cette fenêtre ouverte. Ctrl+C pour arrêter.');
    currentChild = spawnNpm('start', { root, environment: { ...config.environment, NODE_ENV: 'production' } });
    let output = '';
    let webReady = false;
    let workerReady = false;
    relayOutput(currentChild, (chunk) => {
      output = (output + chunk).slice(-8192).replace(/\x1b\[[0-9;]*m/g, '');
      webReady ||= /\[web\][^\r\n]*Ready/i.test(output);
      workerReady ||= output.includes('Yassdem job worker started');
    });
    // Attach the error listener immediately, before polling readiness.
    const finished = waitForExit(currentChild, 'start');
    finished.catch(() => {});
    await waitForStudio(currentChild, config.port, { isReady: () => webReady && workerReady });
    console.log(`Studio prêt : ${config.url}`);
    openBrowser(config.url);
    await finished;
  } catch (error) {
    if (!stopping) { stop(); throw error; }
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nLe studio n'a pas pu s'ouvrir : ${error.message}`);
    process.exitCode = 1;
  });
}
