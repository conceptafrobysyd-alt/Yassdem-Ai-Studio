import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import type { CreatorDocument } from '../../src/lib/creator';
import type { CreatorMode } from '../../src/lib/creator-script';

const execute = promisify(execFile);
function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-creator-jobs-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  process.env.APP_ORIGIN = 'http://127.0.0.1:3000';
  process.env.OLLAMA_MODEL = '';
  process.env.CREATOR_PIPER_PATH = '';
  process.env.CREATOR_PIPER_MODEL_FR = '';
  process.env.CREATOR_PIPER_MODEL_EN = '';
  process.env.RUNWAY_API_KEY = '';
  process.env.REPLICATE_API_TOKEN = '';
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
  const { enqueueCreatorJob, processCreatorJobs } =
    await import('../../src/lib/creator-jobs');
  const { getCreatorVoiceCapabilities } =
    await import('../../src/lib/creator-voice');
  const { deleteMedia, resolveMediaPath } = await import('../../src/lib/media');
  const { hashPassword, setSession } = await import('../../src/lib/auth');
  const { cancelJob, getBudget, processPendingJobs } =
    await import('../../src/lib/jobs');
  const renderRoute =
    await import('../../src/app/api/creator/[projectId]/render/route');
  const mediaRoute = await import('../../src/app/api/media/[id]/route');
  const origin = 'http://127.0.0.1:3000';
  let cookie = '';
  let serial = 0;
  let voiceEngine = 'unavailable';
  let youtubeSeconds = 0;
  const checks: string[] = [];
  function request(
    path: string,
    body?: unknown,
    extras: Record<string, string> = {},
    anonymous = false,
  ) {
    return new Request(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(anonymous ? {} : { cookie }),
        ...(body === undefined
          ? {}
          : { origin, 'content-type': 'application/json' }),
        ...extras,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function create(
    mode: CreatorMode = 'ugc',
    language: 'fr' | 'en' = 'fr',
    durationSeconds = 5,
  ) {
    return domain.createCreatorDocument({
      brief: {
        mode,
        language,
        subject: 'Produit de démonstration',
        facts: ['Coloris bleu'],
        durationSeconds,
        ...(mode === 'affiliate'
          ? { affiliateUrl: 'https://shop.example/item?ref=studio' }
          : {}),
      },
      source: 'local',
      idempotencyKey: `creator-job-document-${++serial}`,
    });
  }
  async function save(
    projectId: string,
    document: CreatorDocument,
    plan = document.plan,
    render = document.render,
  ) {
    return domain.updateCreatorDocument(projectId, {
      expectedRevision: document.revision,
      plan,
      render,
    });
  }
  const renderInput = (
    revision: number,
    key: string,
    mode: 'preview' | 'export' = 'preview',
    rights = false,
  ) => ({
    expectedRevision: revision,
    idempotencyKey: key,
    mode,
    musicRightsConfirmed: rights,
  });
  async function probe(path: string) {
    const { stdout } = await execute(
      process.env.FFPROBE_PATH || 'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
      { timeout: 15000 },
    );
    return JSON.parse(stdout) as {
      streams: {
        codec_type: string;
        codec_name: string;
        width?: number;
        height?: number;
      }[];
      format: { duration: string };
    };
  }
  async function finalJob(id: string) {
    await processCreatorJobs();
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    assert.equal(job.status, 'SUCCEEDED', job.errorCode || job.status);
    assert.equal(job.provider, 'local');
    assert.equal(job.providerRequested, false);
    assert.equal(job.estimatedCostCents, 0);
    assert.equal(job.actualCostCents, 0);
    assert.equal(job.reservedCents, 0);
    return job;
  }
  try {
    const initial = await create('affiliate');
    const projectId = initial.project.id;
    const context = { params: Promise.resolve({ projectId }) };
    const firstInput = renderInput(1, 'creator-review-gate');
    assert.equal(
      (
        await renderRoute.POST(
          request(`/api/creator/${projectId}/render`, firstInput),
          context,
        )
      ).status,
      401,
    );
    const passwordHash = await hashPassword('creator-jobs-private-test');
    await db.settings.update({
      where: { id: 'default' },
      data: {
        passwordHash,
        defaultProvider: 'runway',
        providerEnabled: true,
        replicateEnabled: true,
        monthlyBudgetCents: 2000,
      },
    });
    const session = NextResponse.json({});
    await setSession(session, new Request(origin), passwordHash);
    cookie = session.headers.get('set-cookie')!.split(';')[0];
    assert.equal(
      (
        await renderRoute.POST(
          request(`/api/creator/${projectId}/render`, firstInput, {
            origin: 'https://foreign.example',
          }),
          context,
        )
      ).status,
      403,
    );
    const unapproved = await renderRoute.POST(
      request(`/api/creator/${projectId}/render`, firstInput),
      context,
    );
    assert.equal(unapproved.status, 409);
    assert.equal(
      (await unapproved.json()).error.code,
      'CREATOR_APPROVAL_REQUIRED',
    );
    await assert.rejects(
      enqueueCreatorJob(projectId, renderInput(2, 'creator-stale-gate')),
      { code: 'CREATOR_REVISION_CONFLICT' },
    );
    assert.equal(await db.job.count(), 0);
    checks.push('private-render-api-and-review-gates');

    await mkdir(join(process.env.STORAGE_DIR!, 'media'), { recursive: true });
    const original = await sharp({
      create: { width: 400, height: 400, channels: 3, background: '#3050b0' },
    })
      .png()
      .toBuffer();
    await writeFile(resolveMediaPath('media/blue.png'), original);
    const source = await db.media.create({
      data: {
        id: 'creator-source-blue',
        name: 'blue.png',
        path: 'media/blue.png',
        mimeType: 'image/png',
        size: original.length,
        width: 400,
        height: 400,
        role: 'SOURCE',
      },
    });
    const musicPath = resolveMediaPath('media/music.wav');
    await execute(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      '1',
      '-n',
      musicPath,
    ]);
    const music = await db.media.create({
      data: {
        id: 'creator-test-music',
        name: 'music.wav',
        path: 'media/music.wav',
        mimeType: 'audio/wav',
        size: (await stat(musicPath)).size,
        duration: 1,
        role: 'SOURCE',
      },
    });
    const prepared = await save(
      projectId,
      initial.document,
      {
        ...initial.document.plan,
        scenes: initial.document.plan.scenes.map((scene) => ({
          ...scene,
          narration: '',
          onScreenText: '',
          mediaId: source.id,
        })),
      },
      { ...initial.document.render, musicMediaId: music.id, logoId: null },
    );
    await domain.approveCreatorDocument(projectId, {
      expectedRevision: prepared.document.revision,
    });
    await assert.rejects(deleteMedia(source.id), { code: 'MEDIA_IN_USE' });
    await assert.rejects(deleteMedia(music.id), { code: 'MEDIA_IN_USE' });
    await assert.rejects(
      enqueueCreatorJob(
        projectId,
        renderInput(prepared.document.revision, 'creator-no-music-rights'),
      ),
      { code: 'MUSIC_RIGHTS_REQUIRED' },
    );
    const invalid = await create();
    await assert.rejects(
      save(invalid.project.id, invalid.document, {
        ...invalid.document.plan,
        scenes: invalid.document.plan.scenes.map((scene) => ({
          ...scene,
          mediaId: 'missing-source',
        })),
      }),
      { code: 'CREATOR_VISUAL_NOT_FOUND' },
    );
    assert.equal(await db.job.count(), 0);
    checks.push('music-rights-and-media-reference-protection');

    const input = renderInput(
      prepared.document.revision,
      'creator-approved-preview',
      'preview',
      true,
    );
    const [first, duplicate] = await Promise.all([
      enqueueCreatorJob(projectId, input),
      enqueueCreatorJob(projectId, input),
    ]);
    assert.equal(first.id, duplicate.id);
    assert.equal(await db.job.count(), 1);
    await assert.rejects(
      enqueueCreatorJob(projectId, { ...input, mode: 'export' }),
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    await assert.rejects(
      enqueueCreatorJob(invalid.project.id, { ...input, expectedRevision: 1 }),
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
    await assert.rejects(
      enqueueCreatorJob(projectId, {
        ...input,
        idempotencyKey: 'creator-second-active',
      }),
      { code: 'CREATOR_RENDER_ACTIVE' },
    );
    const laterNarration = 'Ce brouillon a été modifié après la mise en file.';
    const later = await save(
      projectId,
      prepared.document,
      {
        ...prepared.document.plan,
        title: 'Brouillon suivant',
        scenes: prepared.document.plan.scenes.map((scene) => ({
          ...scene,
          narration: laterNarration,
        })),
      },
      prepared.document.render,
    );
    assert.equal(later.document.approvedRevision, null);
    assert.equal((await enqueueCreatorJob(projectId, input)).id, first.id);
    await assert.rejects(
      enqueueCreatorJob(
        projectId,
        renderInput(
          later.document.revision,
          'creator-unreviewed-change',
          'preview',
          true,
        ),
      ),
      { code: 'CREATOR_APPROVAL_REQUIRED' },
    );
    const frozen = record(
      record(JSON.parse(first.parameters).creator).document,
    );
    assert.equal(frozen.revision, prepared.document.revision);
    assert.equal(record(frozen.plan).title, initial.document.plan.title);
    checks.push('stable-retries-conflicts-and-frozen-approved-snapshot');

    await processPendingJobs();
    assert.equal(
      (await db.job.findUniqueOrThrow({ where: { id: first.id } })).status,
      'QUEUED',
      'Other worker families must not claim creator jobs',
    );
    await db.job.update({
      where: { id: first.id },
      data: { status: 'PROCESSING', progress: 73 },
    });
    const preview = await finalJob(first.id);
    const previewVideo = await db.media.findUniqueOrThrow({
      where: { id: preview.outputMediaId! },
    });
    assert.equal(previewVideo.role, 'PREVIEW');
    const previewProbe = await probe(resolveMediaPath(previewVideo.path));
    assert.equal(
      previewProbe.streams.find((stream) => stream.codec_type === 'video')
        ?.codec_name,
      'h264',
    );
    assert.equal(previewVideo.width, 360);
    assert.equal(previewVideo.height, 640);
    assert.ok(Math.abs(Number(previewProbe.format.duration) - 5) < 0.1);
    checks.push('startup-recovery-and-real-360p-preview');

    const previewParameters = JSON.parse(preview.parameters);
    const previewSrt = await db.media.findUniqueOrThrow({
      where: { id: previewParameters.outputSubtitleMediaId },
    });
    const srt = await readFile(resolveMediaPath(previewSrt.path), 'utf8');
    assert.ok(srt.includes(initial.document.plan.adDisclosure));
    assert.ok(!srt.includes(laterNarration));
    const frame = await execute(
      process.env.FFMPEG_PATH || 'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        '1',
        '-i',
        resolveMediaPath(previewVideo.path),
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
    );
    const pixels = await sharp(frame.stdout)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let white = 0;
    for (let y = 0; y < 80; y++)
      for (let x = 0; x < pixels.info.width; x++) {
        const offset = (y * pixels.info.width + x) * pixels.info.channels;
        if (
          pixels.data[offset] > 180 &&
          pixels.data[offset + 1] > 180 &&
          pixels.data[offset + 2] > 180
        )
          white++;
      }
    assert.ok(
      white > 30,
      'Canonical disclosure must be visible even when all editable text was cleared',
    );
    checks.push('canonical-affiliate-label-survives-blank-editable-text');

    const restored = await save(
      projectId,
      later.document,
      prepared.document.plan,
      prepared.document.render,
    );
    await domain.approveCreatorDocument(projectId, {
      expectedRevision: restored.document.revision,
    });
    const exporting = await enqueueCreatorJob(
      projectId,
      renderInput(
        restored.document.revision,
        'creator-approved-export',
        'export',
        true,
      ),
    );
    await db.job.update({
      where: { id: exporting.id },
      data: { status: 'PROCESSING', progress: 67 },
    });
    await processCreatorJobs();
    assert.equal(
      (await db.job.findUniqueOrThrow({ where: { id: exporting.id } }))
        .progress,
      67,
      'Startup recovery must run once, not reset a live task',
    );
    await db.job.update({
      where: { id: exporting.id },
      data: { status: 'QUEUED', progress: 0 },
    });
    const exported = await finalJob(exporting.id);
    const exportParameters = JSON.parse(exported.parameters);
    const output = await db.media.findUniqueOrThrow({
      where: { id: exported.outputMediaId! },
    });
    const cover = await db.media.findUniqueOrThrow({
      where: { id: exportParameters.outputCoverMediaId },
    });
    const subtitles = await db.media.findUniqueOrThrow({
      where: { id: exportParameters.outputSubtitleMediaId },
    });
    assert.equal(output.role, 'EXPORT');
    assert.equal(output.width, 720);
    assert.equal(output.height, 1280);
    assert.ok(
      Math.abs(
        Number((await probe(resolveMediaPath(output.path))).format.duration) -
          5,
      ) < 0.1,
    );
    assert.equal(cover.mimeType, 'image/jpeg');
    assert.equal(
      (await sharp(resolveMediaPath(cover.path)).metadata()).width,
      720,
    );
    assert.equal(subtitles.mimeType, 'application/x-subrip');
    const subtitleContext = { params: Promise.resolve({ id: subtitles.id }) };
    const download = await mediaRoute.GET(
      request(`/api/media/${subtitles.id}`),
      subtitleContext,
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/x-subrip');
    assert.match(
      download.headers.get('content-disposition') || '',
      /attachment; filename=".*\.srt"/,
    );
    assert.equal(
      await download.text(),
      await readFile(resolveMediaPath(subtitles.path), 'utf8'),
    );
    assert.equal(
      (
        await mediaRoute.GET(
          request(`/api/media/${subtitles.id}`, undefined, {}, true),
          subtitleContext,
        )
      ).status,
      401,
    );
    const partial = await mediaRoute.GET(
      request(`/api/media/${subtitles.id}`, undefined, { range: 'bytes=0-11' }),
      subtitleContext,
    );
    assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 12);
    checks.push('single-recovery-real-720p-export-and-private-subtitles');

    await domain.approveCreatorDocument(invalid.project.id, {
      expectedRevision: invalid.document.revision,
    });
    const cancelled = await enqueueCreatorJob(
      invalid.project.id,
      renderInput(invalid.document.revision, 'creator-cancelled-before-work'),
    );
    const mediaBeforeCancel = await db.media.count();
    await cancelJob(cancelled.id);
    await processCreatorJobs();
    const cancelledState = await db.job.findUniqueOrThrow({
      where: { id: cancelled.id },
    });
    assert.equal(cancelledState.status, 'CANCELLED');
    assert.equal(cancelledState.outputMediaId, null);
    assert.equal(await db.media.count(), mediaBeforeCancel);
    checks.push('queued-cancellation-is-never-rendered');

    const voices = await getCreatorVoiceCapabilities();
    const english = await create('ugc', 'en');
    if (voices.en.available) {
      voiceEngine = voices.en.engine!;
      const voiced = await save(
        english.project.id,
        english.document,
        {
          ...english.document.plan,
          scenes: english.document.plan.scenes.map((scene, index) => ({
            ...scene,
            narration: index ? 'A clear view.' : 'Hello there.',
            onScreenText: '',
            mediaId: source.id,
          })),
        },
        { ...english.document.render, voice: 'system', logoId: null },
      );
      await domain.approveCreatorDocument(english.project.id, {
        expectedRevision: voiced.document.revision,
      });
      const voiceJob = await enqueueCreatorJob(
        english.project.id,
        renderInput(voiced.document.revision, 'creator-system-english'),
      );
      const finalVoice = await finalJob(voiceJob.id);
      const voiceOutput = await db.media.findUniqueOrThrow({
        where: { id: finalVoice.outputMediaId! },
      });
      const audio = await execute(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-hide_banner',
          '-i',
          resolveMediaPath(voiceOutput.path),
          '-af',
          'volumedetect',
          '-f',
          'null',
          '-',
        ],
        { timeout: 15000 },
      );
      const mean = audio.stderr.match(/mean_volume: (-?[\d.]+) dB/);
      assert.ok(
        mean && Number(mean[1]) > -45,
        'System narration must be audible in the actual exported video',
      );
      assert.deepEqual(JSON.parse(finalVoice.parameters).voiceEngines, [
        voiceEngine,
      ]);
    } else {
      await assert.rejects(
        save(english.project.id, english.document, english.document.plan, {
          ...english.document.render,
          voice: 'system',
        }),
        { code: 'CREATOR_VOICE_UNAVAILABLE' },
      );
    }
    if (!voices.fr.available) {
      const french = await create();
      const count = await db.job.count();
      await assert.rejects(
        save(french.project.id, french.document, french.document.plan, {
          ...french.document.render,
          voice: 'system',
        }),
        { code: 'CREATOR_VOICE_UNAVAILABLE' },
      );
      const raw = record(
        JSON.parse(
          (
            await db.project.findUniqueOrThrow({
              where: { id: french.project.id },
            })
          ).parameters,
        ),
      );
      const previous = record(raw.creator);
      await db.project.update({
        where: { id: french.project.id },
        data: {
          parameters: JSON.stringify({
            ...raw,
            creator: {
              ...previous,
              approvedRevision: french.document.revision,
              render: { ...french.document.render, voice: 'system' },
            },
          }),
        },
      });
      await assert.rejects(
        enqueueCreatorJob(
          french.project.id,
          renderInput(french.document.revision, 'creator-unavailable-french'),
        ),
        { code: 'CREATOR_VOICE_UNAVAILABLE' },
      );
      assert.equal(await db.job.count(), count);
    }
    checks.push('system-voice-audibility-and-explicit-language-unavailability');

    const youtube = await create('youtube', 'fr', 130);
    const long = await save(youtube.project.id, youtube.document, {
      ...youtube.document.plan,
      scenes: youtube.document.plan.scenes
        .slice(0, 3)
        .map((scene, index) => ({
          ...scene,
          narration: '',
          onScreenText: `Chapitre ${index + 1}`,
          durationSeconds: index === 2 ? 40 : 45,
          mediaId: null,
        })),
    });
    await domain.approveCreatorDocument(youtube.project.id, {
      expectedRevision: long.document.revision,
    });
    const longJob = await enqueueCreatorJob(
      youtube.project.id,
      renderInput(long.document.revision, 'creator-youtube-130-seconds'),
    );
    const longFinal = await finalJob(longJob.id);
    const longOutput = await db.media.findUniqueOrThrow({
      where: { id: longFinal.outputMediaId! },
    });
    youtubeSeconds = Number(
      (await probe(resolveMediaPath(longOutput.path))).format.duration,
    );
    assert.ok(Math.abs(youtubeSeconds - 130) < 0.1);
    assert.equal(longOutput.width, 640);
    assert.equal(longOutput.height, 360);
    const longParameters = JSON.parse(longFinal.parameters);
    assert.equal(longParameters.sceneTimings.length, 3);
    assert.equal(longParameters.sceneTimings.at(-1).endSeconds, 130);
    const emptySubtitle = await db.media.findUniqueOrThrow({
      where: { id: longParameters.outputSubtitleMediaId },
    });
    assert.equal(emptySubtitle.size, 0);
    const emptyContext = { params: Promise.resolve({ id: emptySubtitle.id }) };
    const emptyDownload = await mediaRoute.GET(
      request(`/api/media/${emptySubtitle.id}`),
      emptyContext,
    );
    assert.equal(emptyDownload.status, 200);
    assert.equal(emptyDownload.headers.get('content-length'), '0');
    assert.equal((await emptyDownload.arrayBuffer()).byteLength, 0);
    assert.equal(
      (
        await mediaRoute.GET(
          request(`/api/media/${emptySubtitle.id}`, undefined, {
            range: 'bytes=0-0',
          }),
          emptyContext,
        )
      ).status,
      416,
    );
    checks.push('actual-130-second-youtube-preview-and-empty-subtitle');

    const budget = await getBudget();
    assert.equal(budget.actualCostCents, 0);
    assert.equal(budget.reservedCents, 0);
    assert.equal(budget.committedCents, 0);
    assert.ok(
      (await db.job.findMany()).every(
        (job) =>
          job.provider === 'local' &&
          !job.providerRequested &&
          job.estimatedCostCents === 0 &&
          job.reservedCents === 0 &&
          job.actualCostCents === 0,
      ),
    );
    assert.equal(
      (await db.settings.findUniqueOrThrow({ where: { id: 'default' } }))
        .defaultProvider,
      'runway',
    );
    assert.deepEqual(await readFile(resolveMediaPath(source.path)), original);
    assert.equal(
      (await db.media.findUniqueOrThrow({ where: { id: source.id } }))
        .projectId,
      null,
    );
    assert.ok(
      !(await readdir(join(process.env.STORAGE_DIR!, 'media'))).some((name) =>
        name.startsWith('.creator-'),
      ),
    );
    checks.push('zero-local-budget-and-unchanged-original-source');
    process.stdout.write(
      JSON.stringify({ checks, voiceEngine, youtubeSeconds }),
    );
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
