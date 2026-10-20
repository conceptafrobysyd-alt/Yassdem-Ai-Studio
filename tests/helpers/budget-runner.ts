/** Exercise financial persistence under the same plain Node+tsx runtime as the
 * worker, keeping the native SQLite lifecycle outside test-runner VM contexts. */
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'yassdem-budget-'));
  process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
  process.env.STORAGE_DIR = join(dir, 'storage');
  process.env.RUNWAY_API_KEY = 'dummy-test-key-never-sent';
  const sqlite = new DatabaseSync(join(dir, 'test.db'));
  for (const name of (
    await readdir(join(process.cwd(), 'prisma/migrations'))
  ).sort()) {
    if (name === 'migration_lock.toml') continue;
    sqlite.exec(
      await readFile(
        join(process.cwd(), 'prisma/migrations', name, 'migration.sql'),
        'utf8',
      ),
    );
  }
  sqlite.close();
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAjYAAAAASUVORK5CYII=',
    'base64',
  );
  await mkdir(join(dir, 'storage', 'media'), { recursive: true });
  await writeFile(join(dir, 'storage', 'media', 'source.png'), png);
  const { db } = await import('../../src/lib/db');
  const jobs = await import('../../src/lib/jobs');
  const actualFetch = globalThis.fetch;
  let requests = 0;
  let lastMethod: string | undefined;
  let reply: Response | undefined;
  globalThis.fetch = async (_input, init) => {
    requests++;
    lastMethod = init?.method;
    if (reply) return reply;
    throw new Error('Simulated uncertain request outcome');
  };
  const passed: string[] = [];
  const input = (key: string) => ({
    projectId: 'project-test',
    sourceMediaId: 'source-test',
    provider: 'runway' as const,
    prompt: 'Slow camera movement',
    durationSeconds: 5 as const,
    format: '9:16' as const,
    resolution: 720 as const,
    idempotencyKey: key,
    confirmedPaid: true,
    expectedCostCents: 25,
  });
  const reset = async (budget = 25) => {
    requests = 0;
    reply = undefined;
    lastMethod = undefined;
    await db.job.deleteMany();
    await db.media.deleteMany();
    await db.project.deleteMany();
    await db.settings.deleteMany();
    await db.settings.create({
      data: { providerEnabled: true, monthlyBudgetCents: budget },
    });
    await db.project.create({ data: { id: 'project-test', name: 'Test' } });
    await db.media.create({
      data: {
        id: 'source-test',
        name: 'source.png',
        path: 'media/source.png',
        mimeType: 'image/png',
        size: png.length,
        role: 'SOURCE',
      },
    });
  };
  try {
    await reset(0);
    await assert.rejects(jobs.enqueueJob(input('zero')), {
      code: 'BUDGET_EXCEEDED',
    });
    assert.equal(await db.job.count(), 0);
    assert.equal(requests, 0);
    passed.push('zero-budget');

    await reset(100);
    await db.settings.update({
      where: { id: 'default' },
      data: { providerEnabled: false },
    });
    await assert.rejects(jobs.enqueueJob(input('disabled')), {
      code: 'PROVIDER_DISABLED',
    });
    await db.settings.update({
      where: { id: 'default' },
      data: { providerEnabled: true },
    });
    await assert.rejects(
      jobs.enqueueJob({ ...input('confirm'), confirmedPaid: false }),
      { code: 'PAID_CONFIRMATION_REQUIRED' },
    );
    await assert.rejects(
      jobs.enqueueJob({ ...input('price'), expectedCostCents: 24 }),
      { code: 'PRICE_CHANGED' },
    );
    await assert.rejects(
      jobs.enqueueJob({ ...input('invalid-codec'), codec: '' as 'h264' }),
      { code: 'INVALID_CODEC' },
    );
    for (const quality of [17, 33, 21.5, NaN])
      await assert.rejects(
        jobs.enqueueJob({ ...input('invalid-quality'), quality }),
        { code: 'INVALID_QUALITY' },
      );
    await assert.rejects(
      jobs.enqueueJob({
        ...input('invalid-logo-position'),
        logoPosition: '' as 'center',
      }),
      { code: 'INVALID_LOGO_SETTINGS' },
    );
    await assert.rejects(
      jobs.enqueueJob({
        ...input('invalid-logo-timing'),
        logoTiming: "start';movie=/etc/passwd" as 'start',
      }),
      { code: 'INVALID_LOGO_SETTINGS' },
    );
    assert.equal(requests, 0);
    passed.push('activation-confirmation-price');

    await reset(0);
    await db.settings.update({
      where: { id: 'default' },
      data: { providerEnabled: false },
    });
    const local = await jobs.enqueueJob({
      ...input('local-fifteen'),
      provider: 'local',
      durationSeconds: 15,
      confirmedPaid: false,
      expectedCostCents: undefined,
      logoTiming: 'end',
      quality: 28,
    });
    assert.equal(local.estimatedCostCents, 0);
    assert.equal(local.reservedCents, 0);
    assert.equal(JSON.parse(local.parameters).sourceKind, 'local-animation');
    assert.equal(JSON.parse(local.parameters).durationSeconds, 15);
    assert.equal(JSON.parse(local.parameters).logoTiming, 'end');
    assert.equal(JSON.parse(local.parameters).quality, 28);
    assert.equal(requests, 0);
    passed.push('free-local-fifteen-seconds');

    await reset();
    const concurrent = await Promise.allSettled([
      jobs.enqueueJob(input('first')),
      jobs.enqueueJob(input('second')),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(await db.job.count(), 1);
    const first = await db.job.findFirstOrThrow();
    assert.equal(
      (await jobs.enqueueJob(input(first.idempotencyKey))).id,
      first.id,
    );
    assert.equal((await jobs.getBudget()).reservedCents, 25);
    assert.equal((await jobs.getBudget()).remainingCents, 0);
    assert.equal(requests, 0);
    passed.push('concurrent-cap-idempotency');

    await reset();
    const lowered = await jobs.enqueueJob(input('lowered'));
    await db.settings.update({
      where: { id: 'default' },
      data: { monthlyBudgetCents: 0 },
    });
    await jobs.processPendingJobs();
    const blocked = await db.job.findUniqueOrThrow({
      where: { id: lowered.id },
    });
    assert.equal(blocked.status, 'FAILED');
    assert.equal(blocked.providerRequested, false);
    assert.equal(blocked.reservedCents, 0);
    assert.equal(blocked.errorCode, 'BUDGET_EXCEEDED');
    assert.equal(requests, 0);
    passed.push('worker-revalidates-budget');

    await reset();
    const ambiguous = await jobs.enqueueJob(input('ambiguous'));
    await jobs.processPendingJobs();
    await jobs.processPendingJobs();
    const unknown = await db.job.findUniqueOrThrow({
      where: { id: ambiguous.id },
    });
    assert.equal(unknown.status, 'UNKNOWN');
    assert.equal(unknown.providerRequested, true);
    assert.equal(unknown.reservedCents, 25);
    assert.equal(unknown.actualCostCents, null);
    assert.equal(requests, 1);
    passed.push('ambiguous-post-never-retried');

    await reset();
    const refund = await jobs.enqueueJob(input('refund'));
    await db.job.update({
      where: { id: refund.id },
      data: {
        status: 'RUNNING',
        providerRequested: true,
        providerTaskId: 'task-refunded',
        updatedAt: new Date(Date.now() - 10_000),
      },
    });
    reply = Response.json({ status: 'FAILED', cost: { credits: 0 } });
    await jobs.processPendingJobs();
    const refunded = await db.job.findUniqueOrThrow({
      where: { id: refund.id },
    });
    assert.equal(refunded.status, 'FAILED');
    assert.equal(refunded.actualCostCents, 0);
    assert.equal(refunded.reservedCents, 0);
    assert.equal((await jobs.getBudget()).remainingCents, 25);
    assert.equal(requests, 1);
    assert.equal(lastMethod, undefined);
    passed.push('verified-refund-reconciliation');

    await reset(100);
    await db.settings.update({
      where: { id: 'default' },
      data: { usdToEur: 0.91 },
    });
    const billed = await jobs.enqueueJob({
      ...input('billed'),
      expectedCostCents: 23,
    });
    await db.settings.update({
      where: { id: 'default' },
      data: { usdToEur: 2 },
    });
    await db.job.update({
      where: { id: billed.id },
      data: {
        status: 'RUNNING',
        providerRequested: true,
        providerTaskId: 'task-billed',
        updatedAt: new Date(Date.now() - 10_000),
      },
    });
    reply = Response.json({ status: 'FAILED', cost: { credits: 20 } });
    await jobs.processPendingJobs();
    assert.equal(
      (await db.job.findUniqueOrThrow({ where: { id: billed.id } }))
        .actualCostCents,
      19,
    );
    assert.equal((await jobs.getBudget()).remainingCents, 81);
    passed.push('actual-cost-uses-reserved-exchange-rate');

    await reset();
    const cancellable = await jobs.enqueueJob(input('cancel'));
    const cancelled = await jobs.cancelJob(cancellable.id);
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.reservedCents, 0);
    assert.equal(requests, 0);
    passed.push('queued-cancellation');

    // A fresh process is the actual recovery mechanism; seed an interrupted POST
    // for the second runner invocation below. No provider request may be repeated.
    await reset();
    const interrupted = await jobs.enqueueJob(input('interrupted'));
    await db.job.update({
      where: { id: interrupted.id },
      data: { status: 'SUBMITTING', providerRequested: true },
    });
    await db.$disconnect();
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const recovery = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        `const {db}=await import('./src/lib/db.ts'); const {processPendingJobs}=await import('./src/lib/jobs.ts'); globalThis.fetch=async()=>{throw new Error('RECOVERY_MUST_NOT_FETCH')}; await processPendingJobs(); const job=await db.job.findFirstOrThrow(); if(job.status!=='UNKNOWN'||job.reservedCents!==25) throw new Error('RECOVERY_FAILED'); await db.$disconnect(); process.stdout.write('recovery-ok');`,
      ],
      { cwd: process.cwd(), env: process.env, timeout: 15_000 },
    );
    assert.equal(recovery.stdout, 'recovery-ok');
    passed.push('restart-does-not-resubmit');
    process.stdout.write(JSON.stringify(passed));
  } finally {
    globalThis.fetch = actualFetch;
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
