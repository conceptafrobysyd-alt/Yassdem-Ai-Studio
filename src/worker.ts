import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { processPendingJobs } from './lib/jobs';
import { processFashionJobs } from './lib/fashion-jobs';
import { processEditJobs } from './lib/editor-jobs';
import { db } from './lib/db';
import { storageRoot } from './lib/media';

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    stopping = true;
  });

// Recovery assumes one worker per SQLite database. Enforce this for supported
// startup commands, including two terminals accidentally running npm run dev.
async function acquireWorkerLock() {
  await mkdir(storageRoot(), { recursive: true, mode: 0o700 });
  const file = path.join(storageRoot(), '.worker.lock');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const handle = await open(file, 'wx', 0o600);
      const owner = JSON.stringify({ pid: process.pid });
      await handle.writeFile(owner);
      await handle.close();
      return async () => {
        if ((await readFile(file, 'utf8').catch(() => null)) === owner)
          await unlink(file).catch(() => {});
      };
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        error.code !== 'EEXIST'
      )
        throw error;
      // Serialize stale cleanup so two simultaneous restarts cannot unlink
      // a newly acquired lock belonging to the other worker.
      const cleanupPath = file + '.cleanup';
      let cleanup;
      try {
        cleanup = await open(cleanupPath, 'wx', 0o600);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      try {
        let owner: { pid: number };
        try {
          owner = JSON.parse(await readFile(file, 'utf8'));
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ENOENT'
          )
            continue;
          throw new Error('Worker lock is unreadable.');
        }
        if (!Number.isSafeInteger(owner.pid) || owner.pid < 1)
          throw new Error('Invalid worker lock.');
        let alive = true;
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 'ESRCH'
          )
            alive = false;
        }
        if (alive)
          throw new Error('Another Yassdem worker is already running.');
        await unlink(file);
      } finally {
        await cleanup.close();
        await unlink(cleanupPath).catch(() => {});
      }
    }
  }
  throw new Error('Could not acquire worker lock.');
}
async function main() {
  const release = await acquireWorkerLock();
  console.log('[worker] Yassdem job worker started');
  try {
    while (!stopping) {
      try {
        await processPendingJobs();
        await processFashionJobs();
        await processEditJobs();
      } catch {
        console.error(
          '[worker] Job processing failed; retrying pending tasks.',
        );
      }
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } finally {
    await db.$disconnect();
    await release();
  }
}
main().catch((error) => {
  console.error(
    '[worker]',
    error instanceof Error ? error.message : 'Worker startup failed.',
  );
  process.exitCode = 1;
});
