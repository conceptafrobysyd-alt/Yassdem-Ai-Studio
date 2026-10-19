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
import sharp from 'sharp';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'yassdem-fashion-'));
  process.env.DATABASE_URL = `file:${join(directory, 'test.db')}`;
  process.env.STORAGE_DIR = join(directory, 'storage');
  const sqlite = new DatabaseSync(join(directory, 'test.db'));
  const migrations = (
    await readdir(join(process.cwd(), 'prisma/migrations'), {
      withFileTypes: true,
    })
  )
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  for (const migration of migrations)
    sqlite.exec(
      await readFile(
        join(process.cwd(), 'prisma/migrations', migration, 'migration.sql'),
        'utf8',
      ),
    );
  sqlite.close();
  await mkdir(join(directory, 'storage/media'), { recursive: true });
  const { db } = await import('../../src/lib/db');
  const fashion = await import('../../src/lib/fashion');
  const fashionJobs = await import('../../src/lib/fashion-jobs');
  const passed: string[] = [];
  try {
    const project = await db.project.create({
      data: { name: 'Fashion test', type: 'lookbook' },
    });
    const product = await db.project.create({
      data: { name: 'Product test', type: 'product' },
    });
    const red = await sharp({
      create: { width: 80, height: 80, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer();
    const blue = await sharp({
      create: { width: 80, height: 80, channels: 3, background: '#0000ff' },
    })
      .png()
      .toBuffer();
    await writeFile(join(directory, 'storage/media/red.png'), red);
    await writeFile(join(directory, 'storage/media/blue.png'), blue);
    const media = await db.media.create({
      data: {
        name: 'Red garment',
        path: 'media/red.png',
        mimeType: 'image/png',
        size: red.length,
        width: 80,
        height: 80,
        role: 'SOURCE',
      },
    });
    const second = await db.media.create({
      data: {
        name: 'Blue garment',
        path: 'media/blue.png',
        mimeType: 'image/png',
        size: blue.length,
        width: 80,
        height: 80,
        role: 'SOURCE',
      },
    });
    const video = await db.media.create({
      data: {
        name: 'Not a garment',
        path: 'media/video.mp4',
        mimeType: 'video/mp4',
        size: 100,
        role: 'SOURCE',
      },
    });
    const mannequin = await fashion.createMannequin({
      name: 'Model A',
      parameters: {
        skinTone: 'deep brown',
        bodyType: 'curvy',
        heightCm: 176,
        hair: 'braids',
        hijab: true,
        pose: 'seated',
      },
    });
    assert.equal(mannequin.parameters.hijab, true);
    assert.equal(mannequin.parameters.hair, 'braids');
    const parameters = {
      styles: ['Streetwear', 'Evening'],
      fit: 'oversized',
      colors: ['red'],
      accessories: ['earrings'],
      coverage: 'open shoulders',
      mood: 'joyful',
      prompt: 'Natural window light',
    };
    const lookInput = {
      name: 'Look A',
      projectId: project.id,
      mannequinId: mannequin.id,
      garmentMediaIds: [media.id, second.id],
      parameters,
    };
    const look = await fashion.createLook(lookInput);
    assert.equal(look.parameters.coverage, 'open shoulders');
    assert.deepEqual(look.parameters.styles, ['Streetwear', 'Evening']);
    passed.push('independent-hijab-style-parameters');

    await assert.rejects(
      fashion.createLook({ ...lookInput, garmentMediaIds: [video.id] }),
      { code: 'INVALID_FASHION_IMAGE' },
    );
    await assert.rejects(
      fashion.createLook({
        ...lookInput,
        garmentMediaIds: [media.id, media.id],
      }),
      { code: 'INVALID_GARMENTS' },
    );
    await assert.rejects(
      fashion.createLook({
        ...lookInput,
        garmentMediaIds: Array(9).fill(media.id),
      }),
      { code: 'INVALID_GARMENTS' },
    );
    await assert.rejects(
      fashion.createLook({ ...lookInput, projectId: product.id }),
      { code: 'FASHION_PROJECT_REQUIRED' },
    );
    await assert.rejects(
      fashion.createMannequin({
        name: 'Invalid',
        parameters: { heightCm: 400 },
      }),
      { code: 'INVALID_HEIGHT' },
    );
    await assert.rejects(
      fashion.createMannequin({
        name: 'Invalid',
        parameters: { hijab: 'true' },
      }),
      { code: 'INVALID_PARAMETERS' },
    );
    await assert.rejects(
      fashion.createLook({ ...lookInput, parameters: { fit: '__proto__' } }),
      { code: 'INVALID_FIT' },
    );
    passed.push('strict-input-validation');

    const otherLook = await fashion.createLook({
      ...lookInput,
      name: 'Look B',
    });
    assert.equal(otherLook.mannequinId, mannequin.id);
    assert.equal((await fashion.listLooks(project.id)).length, 2);
    assert.equal((await fashion.listMannequins()).length, 1);
    assert.deepEqual(
      (await fashion.getLook(look.id)).sourceMedia.map((item) => item.id),
      [media.id, second.id],
    );
    passed.push('persistent-looks-and-reusable-mannequins');

    const variant = await fashion.duplicateLook(look.id);
    assert.notEqual(variant.id, look.id);
    assert.equal(variant.outputMediaId, null);
    assert.equal(variant.mannequinId, look.mannequinId);
    await fashion.updateLook(variant.id, {
      parameters: {
        ...variant.parameters,
        colors: ['blue'],
        styles: ['Sport'],
      },
    });
    assert.deepEqual((await fashion.getLook(look.id)).parameters.colors, [
      'red',
    ]);
    assert.deepEqual((await fashion.getLook(variant.id)).parameters.colors, [
      'blue',
    ]);
    passed.push('variants-have-independent-parameters');

    const output = join(directory, 'contact-sheet.png');
    const result = await fashion.composeLookCollage(look.id, output);
    assert.equal(result.aiGenerated, false);
    assert.equal(result.sourceKind, 'collage');
    assert.equal(result.width, 1600);
    assert.ok(result.bytes > 2000);
    const firstPixel = await sharp(output)
      .extract({ left: 200, top: 300, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    const secondPixel = await sharp(output)
      .extract({ left: 720, top: 300, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.deepEqual([...firstPixel], [255, 0, 0]);
    assert.deepEqual([...secondPixel], [0, 0, 255]);
    passed.push('actual-collage-preserves-original-colors');

    const queued = await fashionJobs.enqueueFashionJob({
      lookId: look.id,
      mode: 'collage',
      idempotencyKey: 'actual-collage-worker',
    });
    assert.equal(
      (
        await fashionJobs.enqueueFashionJob({
          lookId: look.id,
          mode: 'collage',
          idempotencyKey: 'actual-collage-worker',
        })
      ).id,
      queued.id,
    );
    assert.equal(queued.estimatedCostCents, 0);
    assert.equal(queued.reservedCents, 0);
    await fashionJobs.processFashionJobs();
    const completed = await db.job.findUniqueOrThrow({
      where: { id: queued.id },
    });
    assert.equal(completed.status, 'SUCCEEDED');
    assert.equal(completed.actualCostCents, 0);
    assert.ok(completed.outputMediaId);
    const renderedLook = await fashion.getLook(look.id);
    assert.equal(renderedLook.outputMediaId, completed.outputMediaId);
    const renderedMedia = await db.media.findUniqueOrThrow({
      where: { id: completed.outputMediaId! },
    });
    assert.equal(
      (
        await sharp(
          join(process.env.STORAGE_DIR!, renderedMedia.path),
        ).metadata()
      ).width,
      1600,
    );
    const updatedProject = await db.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    assert.ok(
      JSON.parse(updatedProject.parameters).fashionResultMediaIds.includes(
        completed.outputMediaId,
      ),
    );
    passed.push('queued-collage-worker-idempotence-zero-cost');

    const unchangedLook = await fashion.updateLook(look.id, {
      ...lookInput,
      // Key ordering differs from the stored JSON but values are unchanged.
      parameters: Object.fromEntries(Object.entries(parameters).reverse()),
    });
    assert.equal(unchangedLook.outputMediaId, renderedLook.outputMediaId);
    assert.equal(
      unchangedLook.updatedAt.getTime(),
      renderedLook.updatedAt.getTime(),
    );
    await fashion.updateMannequin(mannequin.id, {
      name: mannequin.name,
      description: mannequin.description,
      referenceMediaId: mannequin.referenceMediaId,
      parameters: Object.fromEntries(
        Object.entries(mannequin.parameters).reverse(),
      ),
    });
    assert.equal(
      (await fashion.getLook(look.id)).outputMediaId,
      renderedLook.outputMediaId,
    );
    assert.equal(
      (await fashion.getLook(look.id)).updatedAt.getTime(),
      renderedLook.updatedAt.getTime(),
    );
    const renamedLook = await fashion.updateLook(look.id, {
      name: 'New contact sheet title',
    });
    assert.equal(renamedLook.outputMediaId, null);
    assert.ok(
      renamedLook.updatedAt.getTime() > renderedLook.updatedAt.getTime(),
    );
    for (const update of [
      { name: 'Updated model name' },
      { description: 'Updated editorial profile' },
    ]) {
      await db.look.update({
        where: { id: look.id },
        data: { outputMediaId: renderedLook.outputMediaId },
      });
      const before = await fashion.getLook(look.id);
      await fashion.updateMannequin(mannequin.id, update);
      const after = await fashion.getLook(look.id);
      assert.equal(after.outputMediaId, null);
      assert.ok(after.updatedAt.getTime() > before.updatedAt.getTime());
    }
    passed.push('unchanged-save-preserves-results-profile-changes-invalidate');

    const active = await db.job.create({
      data: {
        projectId: project.id,
        sourceMediaId: media.id,
        provider: 'local',
        kind: 'lookbook_sheet',
        status: 'QUEUED',
        parameters: JSON.stringify({ lookId: look.id }),
        budgetMonth: '2026-10',
        idempotencyKey: 'active-look-test',
      },
    });
    await assert.rejects(
      fashion.updateLook(look.id, { name: 'Mutation during rendering' }),
      { code: 'LOOK_RENDER_ACTIVE' },
    );
    await assert.rejects(fashion.deleteLook(look.id), {
      code: 'LOOK_RENDER_ACTIVE',
    });
    await assert.rejects(
      fashion.updateMannequin(mannequin.id, {
        description: 'Changed during rendering',
      }),
      { code: 'LOOK_RENDER_ACTIVE' },
    );
    await db.job.update({
      where: { id: active.id },
      data: { status: 'SUCCEEDED' },
    });
    await fashion.updateLook(look.id, { name: 'After rendering' });
    passed.push('active-job-protects-look');

    await assert.rejects(fashion.deleteMannequin(mannequin.id), {
      code: 'MANNEQUIN_IN_USE',
    });
    assert.equal(
      'path' in (await fashion.getLook(look.id)).sourceMedia[0],
      false,
    );
    for (const item of await fashion.listLooks(project.id))
      await fashion.deleteLook(item.id);
    await fashion.deleteMannequin(mannequin.id);
    assert.equal((await fashion.listMannequins()).length, 0);
    passed.push('delete-references-and-private-paths');
    process.stdout.write(JSON.stringify(passed));
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
