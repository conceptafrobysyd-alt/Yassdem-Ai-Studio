import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
import { inflateRawSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import sharp from 'sharp';

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function zipEntry(bytes: Buffer, wanted: string) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  let offset = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10);
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === wanted) {
      const local = bytes.readUInt32LE(offset + 42);
      const start =
        local +
        30 +
        bytes.readUInt16LE(local + 26) +
        bytes.readUInt16LE(local + 28);
      const compressed = bytes.subarray(start, start + compressedSize);
      return method === 8 ? inflateRawSync(compressed) : compressed;
    }
    offset +=
      46 +
      nameLength +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
  throw new Error(`Missing ZIP entry: ${wanted}`);
}
async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-creator-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.OLLAMA_MODEL = '';
  const sqlite = new DatabaseSync(join(directory, 'test.db'));
  for (const name of (
    await readdir(join(process.cwd(), 'prisma/migrations'))
  ).sort())
    if (name !== 'migration_lock.toml')
      sqlite.exec(
        await readFile(
          join(process.cwd(), 'prisma/migrations', name, 'migration.sql'),
          'utf8',
        ),
      );
  sqlite.close();
  const { db } = await import('../../src/lib/db');
  const domain = await import('../../src/lib/creator');
  const { generateLocalCreatorPlan, validateCreatorBrief } =
    await import('../../src/lib/creator-script');
  const collectionRoute = await import('../../src/app/api/creator/route');
  const documentRoute =
    await import('../../src/app/api/creator/[projectId]/route');
  const approveRoute =
    await import('../../src/app/api/creator/[projectId]/approve/route');
  const exportRoute =
    await import('../../src/app/api/creator/[projectId]/exports/route');
  const { hashPassword, setSession } = await import('../../src/lib/auth');
  const { duplicateProject, archiveProject } =
    await import('../../src/lib/projects');
  const { deleteMedia, resolveMediaPath } = await import('../../src/lib/media');
  const passed: string[] = [];
  const origin = 'http://127.0.0.1:3000';
  let cookie = '';
  let listening = false;
  let modelPlan: unknown;
  const modelRequests: string[] = [];
  const server = createServer((req, res) => {
    modelRequests.push(`${req.method} ${req.url}`);
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags')
      res.end(JSON.stringify({ models: [{ name: 'creator-test' }] }));
    else if (req.url === '/api/generate') {
      const chunks: Buffer[] = [];
      req.on('data', (bytes) => chunks.push(bytes));
      req.on('end', () => {
        const request = JSON.parse(Buffer.concat(chunks).toString());
        assert.equal(request.model, 'creator-test');
        assert.equal(request.stream, false);
        assert.equal(request.format, 'json');
        res.end(
          JSON.stringify({ done: true, response: JSON.stringify(modelPlan) }),
        );
      });
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  function request(
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    extra: Record<string, string> = {},
  ) {
    return new Request(origin + path, {
      method,
      headers: {
        cookie,
        ...(body === undefined
          ? {}
          : { origin, 'content-type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  const context = (projectId: string) => ({
    params: Promise.resolve({ projectId }),
  });
  const input = (mode: 'ugc' | 'affiliate' | 'story' | 'youtube' = 'ugc') => ({
    brief: {
      mode,
      language: 'fr',
      subject: mode === 'story' ? 'Le message inattendu' : 'Sac Alba',
      facts: ['Coloris sable', 'Deux poches intérieures'],
      ...(mode === 'affiliate'
        ? { affiliateUrl: 'https://shop.example/item?ref=yassdem' }
        : {}),
      ...(mode === 'story'
        ? {
            characters: [
              { name: 'Nora', description: 'Veste bleue.' },
              { name: 'Sam', description: 'Carnet rouge.' },
            ],
            episode: 2,
          }
        : {}),
    },
    source: 'local',
    idempotencyKey: `creator-test-${mode}`,
  });
  try {
    assert.equal(
      (await collectionRoute.GET(request('/api/creator'))).status,
      401,
    );
    assert.equal(
      (await collectionRoute.POST(request('/api/creator', input()))).status,
      401,
    );
    assert.equal(
      (
        await collectionRoute.POST(
          request('/api/creator', input(), 'POST', {
            origin: 'https://foreign.example',
          }),
        )
      ).status,
      403,
    );
    const passwordHash = await hashPassword('creator-private-test');
    await db.settings.update({
      where: { id: 'default' },
      data: {
        passwordHash,
        defaultProvider: 'runway',
        providerEnabled: true,
        monthlyBudgetCents: 2000,
      },
    });
    const session = NextResponse.json({});
    await setSession(session, new Request(origin), passwordHash);
    cookie = session.headers.get('set-cookie')!.split(';')[0];
    const bootstrap = await collectionRoute.GET(request('/api/creator'));
    assert.equal(bootstrap.status, 200);
    assert.equal(bootstrap.headers.get('cache-control'), 'private, no-store');
    assert.equal((await bootstrap.json()).capabilities.ollama, false);
    assert.equal(
      (
        await collectionRoute.POST(
          new Request(origin + '/api/creator', {
            method: 'POST',
            headers: { cookie, 'content-type': 'application/json' },
            body: JSON.stringify(input()),
          }),
        )
      ).status,
      403,
    );
    process.env.OLLAMA_URL = 'https://outside.example';
    const optionalUnavailable = await collectionRoute.GET(
      request('/api/creator'),
    );
    assert.equal(optionalUnavailable.status, 200);
    assert.equal((await optionalUnavailable.json()).capabilities.ollama, false);
    delete process.env.OLLAMA_URL;
    passed.push('private-api-and-origin-protection');

    const created = await Promise.all(
      ['ugc', 'affiliate', 'story', 'youtube'].map((mode) =>
        domain.createCreatorDocument(input(mode as 'ugc')),
      ),
    );
    assert.equal(await db.project.count(), 4);
    assert.deepEqual(
      created.map((item) => item.document.plan.mode),
      ['ugc', 'affiliate', 'story', 'youtube'],
    );
    assert.equal(created[2].document.plan.characters[0].name, 'Nora');
    assert.equal(created[3].document.plan.format, '16:9');
    assert.ok(
      created.every(
        (item) =>
          item.document.revision === 1 &&
          item.document.approvedRevision === null &&
          item.document.render.voice === 'none',
      ),
    );
    const retries = await Promise.all([
      domain.createCreatorDocument(input()),
      domain.createCreatorDocument(input()),
    ]);
    assert.equal(retries[0].project.id, created[0].project.id);
    assert.equal(retries[1].project.id, created[0].project.id);
    await assert.rejects(
      domain.createCreatorDocument({
        ...input(),
        brief: { ...input().brief, subject: 'Autre produit' },
      }),
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    assert.equal(await db.project.count(), 4);
    assert.equal(await db.job.count(), 0);
    passed.push('four-real-persisted-plans-and-stable-creation-retries');

    const owner = await db.project.create({
      data: { name: 'Existing project', parameters: '{"keep":"untouched"}' },
    });
    await mkdir(join(process.env.STORAGE_DIR!, 'media'), { recursive: true });
    const png = await sharp({
      create: { width: 32, height: 40, channels: 3, background: '#a04c62' },
    })
      .png()
      .toBuffer();
    await writeFile(join(process.env.STORAGE_DIR!, 'media', 'source.png'), png);
    const media = await db.media.create({
      data: {
        name: 'source.png',
        path: 'media/source.png',
        mimeType: 'image/png',
        size: png.length,
        width: 32,
        height: 40,
        role: 'SOURCE',
        projectId: owner.id,
      },
    });
    let doc = created[0];
    const projectId = doc.project.id;
    const plan = structuredClone(doc.document.plan);
    plan.scenes[0].mediaId = media.id;
    const oldParameters = record(doc.project.parameters);
    await db.project.update({
      where: { id: projectId },
      data: {
        parameters: JSON.stringify({
          ...oldParameters,
          editorDraft: { title: 'Keep this draft' },
        }),
      },
    });
    doc = await domain.updateCreatorDocument(projectId, {
      plan,
      render: doc.document.render,
      expectedRevision: 1,
    });
    assert.equal(
      record(doc.project.parameters).editorDraft &&
        record(record(doc.project.parameters).editorDraft).title,
      'Keep this draft',
    );
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: media.id } })).projectId,
      owner.id,
    );
    assert.equal(
      (await db.project.findUniqueOrThrow({ where: { id: owner.id } }))
        .parameters,
      '{"keep":"untouched"}',
    );
    assert.deepEqual(await readFile(resolveMediaPath(media.path)), png);
    await assert.rejects(deleteMedia(media.id), { code: 'MEDIA_IN_USE' });
    await assert.rejects(
      domain.updateCreatorDocument(projectId, {
        plan: {
          ...plan,
          scenes: [{ ...plan.scenes[0], mediaId: 'missing-media' }],
        },
        render: doc.document.render,
        expectedRevision: 2,
      }),
    );
    await assert.rejects(
      domain.updateCreatorDocument(projectId, {
        plan: doc.document.plan,
        render: {
          ...doc.document.render,
          voice: 'imported',
          narrationMediaId: media.id,
        },
        expectedRevision: 2,
      }),
      { code: 'CREATOR_AUDIO_NOT_FOUND' },
    );
    assert.equal(
      (await domain.getCreatorDocument(projectId)).document.revision,
      2,
    );
    passed.push(
      'validated-read-only-media-references-and-independent-ateliers',
    );

    doc = await domain.approveCreatorDocument(projectId, {
      expectedRevision: 2,
    });
    assert.equal(doc.document.approvedRevision, 2);
    assert.equal(
      (await domain.approveCreatorDocument(projectId, { expectedRevision: 2 }))
        .document.revision,
      2,
    );
    const responses = await Promise.allSettled([
      domain.updateCreatorDocument(projectId, {
        plan: { ...doc.document.plan, title: 'Version A' },
        render: doc.document.render,
        expectedRevision: 2,
      }),
      domain.updateCreatorDocument(projectId, {
        plan: { ...doc.document.plan, title: 'Version B' },
        render: doc.document.render,
        expectedRevision: 2,
      }),
    ]);
    assert.equal(
      responses.filter((item) => item.status === 'fulfilled').length,
      1,
    );
    const rejected = responses.find((item) => item.status === 'rejected');
    assert.ok(rejected?.status === 'rejected');
    assert.equal(rejected.reason.code, 'CREATOR_REVISION_CONFLICT');
    doc = await domain.getCreatorDocument(projectId);
    assert.equal(doc.document.revision, 3);
    assert.equal(doc.document.approvedRevision, null);
    assert.equal(
      (await domain.createCreatorDocument(input())).document.revision,
      3,
    );
    const staleApproval = await approveRoute.POST(
      request(`/api/creator/${projectId}/approve`, { expectedRevision: 2 }),
      context(projectId),
    );
    assert.equal(staleApproval.status, 409);
    assert.equal(
      (
        await documentRoute.GET(
          request(`/api/creator/${projectId}`),
          context(projectId),
        )
      ).status,
      200,
    );
    passed.push('optimistic-revisions-explicit-approval-and-conflicts');

    const affiliate = created[1];
    await assert.rejects(
      domain.updateCreatorDocument(affiliate.project.id, {
        plan: { ...affiliate.document.plan, adDisclosure: '' },
        render: affiliate.document.render,
        expectedRevision: 1,
      }),
      { code: 'CREATOR_DISCLOSURE_REQUIRED' },
    );
    const publication = await exportRoute.GET(
      request(
        `/api/creator/${affiliate.project.id}/exports?format=publication`,
      ),
      context(affiliate.project.id),
    );
    const publicationText = await publication.text();
    assert.ok(publicationText.includes('Publicité · lien affilié.'));
    assert.ok(
      publicationText.includes('https://shop.example/item?ref=yassdem'),
    );
    const subtitles = await exportRoute.GET(
      request(`/api/creator/${projectId}/exports?format=srt`),
      context(projectId),
    );
    assert.ok(
      subtitles.headers.get('content-disposition')?.includes('brouillon.srt'),
    );
    assert.match(await subtitles.text(), /00:00:00,000 -->/);
    const fiction = domain.creatorPublication(created[2].document);
    assert.ok(fiction.includes('Fiction originale.'));
    const json = await exportRoute.GET(
      request(`/api/creator/${projectId}/exports?format=json`),
      context(projectId),
    );
    assert.equal((await json.json()).revision, 3);
    const preferences = await db.settings.findUniqueOrThrow({
      where: { id: 'default' },
    });
    assert.equal(preferences.defaultProvider, 'runway');
    assert.equal(preferences.providerEnabled, true);
    assert.equal(preferences.monthlyBudgetCents, 2000);
    passed.push('commercial-context-and-safe-exports');

    const copy = await duplicateProject(projectId);
    const copied = await domain.getCreatorDocument(copy.id);
    const copiedMediaId = copied.document.plan.scenes[0].mediaId;
    assert.ok(copiedMediaId && copiedMediaId !== media.id);
    const copiedMedia = await db.media.findUniqueOrThrow({
      where: { id: copiedMediaId },
    });
    assert.deepEqual(await readFile(resolveMediaPath(copiedMedia.path)), png);
    assert.equal(copied.document.plan.title, doc.document.plan.title);
    const archive = Buffer.from(
      await (await archiveProject(projectId)).arrayBuffer(),
    );
    const backup = JSON.parse(zipEntry(archive, 'project.json').toString());
    assert.equal(backup.project.parameters.creator.revision, 3);
    assert.ok(
      backup.media.some((item: { id: string }) => item.id === media.id),
    );
    assert.ok(!JSON.stringify(backup).includes('passwordHash'));
    passed.push('project-copy-and-archive-retain-creator-content');

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    listening = true;
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.OLLAMA_URL = `http://127.0.0.1:${address.port}`;
    process.env.OLLAMA_MODEL = 'creator-test';
    const modelInput = {
      ...input(),
      source: 'ollama',
      idempotencyKey: 'creator-model-contract',
    };
    const countBeforeModel = await db.project.count();
    modelPlan = { plan: { scenes: [] } };
    await assert.rejects(domain.createCreatorDocument(modelInput), {
      code: 'CREATOR_INVALID_MODEL_OUTPUT',
    });
    assert.equal(await db.project.count(), countBeforeModel);
    modelPlan = {
      plan: generateLocalCreatorPlan(validateCreatorBrief(input().brief)),
    };
    const model = await domain.createCreatorDocument(modelInput);
    assert.equal(model.document.plan.source, 'ollama');
    assert.ok(
      modelRequests.every(
        (line) => line === 'GET /api/tags' || line === 'POST /api/generate',
      ),
    );
    const requestCount = modelRequests.length;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    listening = false;
    const modelRetry = await domain.createCreatorDocument(modelInput);
    assert.equal(modelRetry.project.id, model.project.id);
    assert.equal(modelRequests.length, requestCount);
    assert.equal(await db.job.count(), 0);
    passed.push('optional-ollama-contract-and-acknowledged-retry');
    const replay = await domain.updateCreatorDocument(projectId, {
      expectedRevision: 2,
      plan: doc.document.plan,
      render: doc.document.render,
    });
    assert.equal(replay.document.revision, 3);
    assert.deepEqual(replay.document, doc.document);
    await assert.rejects(
      domain.updateCreatorDocument(projectId, {
        expectedRevision: 2,
        plan: { ...doc.document.plan, title: 'A conflicting replay' },
        render: doc.document.render,
      }),
      { code: 'CREATOR_REVISION_CONFLICT' },
    );
    passed.push(
      'lost-save-response-replays-identical-content-without-new-revision',
    );

    const youtube = created[3];
    const sourceBefore = await db.project.findUniqueOrThrow({
      where: { id: youtube.project.id },
    });
    const shortRequest = {
      expectedRevision: 1,
      idempotencyKey: 'youtube-short-local-copy',
    };
    await assert.rejects(
      domain.createCreatorShort(youtube.project.id, shortRequest),
      { code: 'CREATOR_APPROVAL_REQUIRED' },
    );
    await domain.approveCreatorDocument(youtube.project.id, {
      expectedRevision: 1,
    });
    const approvedBefore = await db.project.findUniqueOrThrow({
      where: { id: youtube.project.id },
    });
    const countBeforeShort = await db.project.count();
    const [short, shortRetry] = await Promise.all([
      domain.createCreatorShort(youtube.project.id, shortRequest),
      domain.createCreatorShort(youtube.project.id, shortRequest),
    ]);
    assert.equal(short.project.id, shortRetry.project.id);
    assert.equal(await db.project.count(), countBeforeShort + 1);
    assert.equal(short.document.plan.format, '9:16');
    assert.equal(short.document.render.format, '9:16');
    assert.equal(short.document.approvedRevision, null);
    assert.ok(short.document.plan.scenes.length <= 4);
    const shortDuration = short.document.plan.scenes.reduce(
      (sum, scene) => sum + scene.durationSeconds,
      0,
    );
    assert.ok(shortDuration >= 30 && shortDuration <= 60);
    assert.ok(
      short.document.plan.scenes.every(
        (scene) => scene.narration.length <= 241,
      ),
    );
    assert.equal(
      (
        await db.project.findUniqueOrThrow({
          where: { id: youtube.project.id },
        })
      ).parameters,
      approvedBefore.parameters,
    );
    assert.equal(
      JSON.parse(sourceBefore.parameters).creator.plan.format,
      '16:9',
    );
    await assert.rejects(
      domain.createCreatorShort(youtube.project.id, {
        ...shortRequest,
        expectedRevision: 2,
      }),
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    assert.equal(await db.job.count(), 0);
    passed.push(
      'reviewed-youtube-short-is-independent-vertical-and-idempotent',
    );
    process.stdout.write(JSON.stringify(passed));
  } finally {
    if (listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
