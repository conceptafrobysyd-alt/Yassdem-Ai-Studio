import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RunwayProvider,
  downloadRunwayVideo,
  estimateRunwayCost,
  validateRunwayArtifactUrl,
} from '../src/lib/providers/runway';
import {
  createLocalAnimation,
  getExportDimensions,
  probeMedia,
} from '../src/lib/export';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jAjYAAAAASUVORK5CYII=',
  'base64',
);
const sourceData = `data:image/png;base64,${png.toString('base64')}`;

describe('Runway adapter — no paid requests', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calculates explicit currency assumptions and rounds upward', () => {
    expect(estimateRunwayCost(5)).toEqual({
      credits: 25,
      usdCents: 25,
      eurCents: 25,
      exchangeRate: 1,
    });
    expect(estimateRunwayCost(10, 0.91).eurCents).toBe(46);
    expect(() => estimateRunwayCost(15 as 5)).toThrow('INVALID_DURATION');
    expect(() => estimateRunwayCost(5, NaN)).toThrow('INVALID_EXCHANGE_RATE');
  });

  it('checks the connection with a read-only authenticated GET', async () => {
    const fake = vi
      .fn()
      .mockResolvedValue(Response.json({ creditBalance: 100 }));
    const provider = new RunwayProvider({
      apiKey: 'test-only-secret',
      fetchImpl: fake,
    });
    expect(await provider.checkConnection()).toEqual({ ok: true });
    expect(fake.mock.calls[0][0]).toBe(
      'https://api.dev.runwayml.com/v1/organization',
    );
    expect(fake.mock.calls[0][1].method).toBeUndefined();
    expect(fake.mock.calls[0][1].headers['X-Runway-Version']).toBe(
      '2024-11-06',
    );
  });

  it('does not request a generation on malformed input', async () => {
    const fake = vi.fn();
    const provider = new RunwayProvider({
      apiKey: 'test-key',
      fetchImpl: fake,
    });
    await expect(
      provider.createVideo({
        imageDataUri: 'https://127.0.0.1/a.png',
        prompt: 'Rotate',
        durationSeconds: 5,
        ratio: '720:1280',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_IMAGE' });
    await expect(
      provider.createVideo({
        imageDataUri: sourceData,
        prompt: 'Rotate',
        durationSeconds: 5,
        ratio: '__proto__' as '720:1280',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FORMAT' });
    expect(fake).not.toHaveBeenCalled();
  });

  it('uses the official image-to-video shape with an explicit uploaded image', async () => {
    const fake = vi.fn().mockResolvedValue(Response.json({ id: 'task-123' }));
    const provider = new RunwayProvider({
      apiKey: 'test-key',
      fetchImpl: fake,
    });
    await expect(
      provider.createVideo({
        imageDataUri: sourceData,
        prompt: 'Rotate',
        durationSeconds: 5,
        ratio: '720:1280',
      }),
    ).resolves.toEqual({ id: 'task-123' });
    expect(JSON.parse(fake.mock.calls[0][1].body)).toEqual({
      model: 'gen4_turbo',
      promptImage: sourceData,
      promptText: 'Rotate',
      duration: 5,
      ratio: '720:1280',
    });
    expect(fake.mock.calls[0][1].redirect).toBe('error');
  });

  it('retains actual terminal credits and never exposes provider error prose', async () => {
    const fake = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          status: 'FAILED',
          cost: { credits: 0 },
          failure: 'secret-token',
        }),
      );
    expect(
      await new RunwayProvider({ apiKey: 'test-key', fetchImpl: fake }).getTask(
        'task-123',
      ),
    ).toMatchObject({
      costCredits: 0,
      failureCode: 'RUNWAY_GENERATION_FAILED',
    });
    fake.mockResolvedValue(
      Response.json({ message: 'secret-token' }, { status: 401 }),
    );
    expect(
      await new RunwayProvider({
        apiKey: 'test-key',
        fetchImpl: fake,
      }).checkConnection(),
    ).toEqual({ ok: false, code: 'RUNWAY_AUTH_FAILED' });
  });

  it.each([
    'http://dnznrvs05pmza.cloudfront.net/a.mp4',
    'https://127.0.0.1/a.mp4',
    'https://[::1]/a.mp4',
    'https://runwayml.com.evil.test/a.mp4',
    'https://evil.cloudfront.net/a.mp4',
    'https://user:secret@artifacts.runwayml.com/a.mp4',
    'https://artifacts.runwayml.com:3000/a.mp4',
  ])('rejects an unsafe artifact URL: %s', (url) => {
    expect(() => validateRunwayArtifactUrl(url)).toThrow('UNSAFE_ARTIFACT_URL');
  });

  it('downloads MP4 with a byte limit and removes incomplete output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yassdem-download-'));
    try {
      const data = Buffer.concat([
        Buffer.from([0, 0, 0, 20]),
        Buffer.from('ftypisom'),
        Buffer.alloc(20),
      ]);
      const fake = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(data, { headers: { 'content-type': 'video/mp4' } }),
          ),
        );
      const destination = join(dir, 'video.mp4');
      await expect(
        downloadRunwayVideo(
          'https://dnznrvs05pmza.cloudfront.net/a.mp4',
          destination,
          { fetchImpl: fake, maxBytes: 12 },
        ),
      ).rejects.toMatchObject({ code: 'ARTIFACT_TOO_LARGE' });
      await expect(stat(destination)).rejects.toThrow();
      await expect(
        downloadRunwayVideo(
          'https://dnznrvs05pmza.cloudfront.net/a.mp4',
          destination,
          { fetchImpl: fake },
        ),
      ).resolves.toMatchObject({ bytes: data.length });
      expect(fake.mock.calls[0][1].redirect).toBe('error');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Persisted budget and single-submission job queue', () => {
  it('passes all ten financial and crash-recovery checks in the real Node runtime', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/budget-runner.ts'],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(JSON.parse(stdout)).toEqual([
      'zero-budget',
      'activation-confirmation-price',
      'free-local-fifteen-seconds',
      'concurrent-cap-idempotency',
      'worker-revalidates-budget',
      'ambiguous-post-never-retried',
      'verified-refund-reconciliation',
      'actual-cost-uses-reserved-exchange-rate',
      'queued-cancellation',
      'restart-does-not-resubmit',
    ]);
  }, 35_000);
});

describe('Real local animation and honest export metadata', () => {
  it('maps all requested aspect ratios through 4K dimensions', () => {
    expect(getExportDimensions('9:16', 2160)).toEqual({
      width: 2160,
      height: 3840,
    });
    expect(getExportDimensions('16:9', 2160)).toEqual({
      width: 3840,
      height: 2160,
    });
    expect(getExportDimensions('4:5', 1080)).toEqual({
      width: 1080,
      height: 1350,
    });
    expect(() => getExportDimensions('__proto__' as '1:1', 720)).toThrow(
      'INVALID_FORMAT',
    );
  });

  it('creates an actual five-second MP4 from a still and marks local animation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'yassdem-animation-'));
    try {
      const imagePath = join(dir, 'source.png');
      const outputPath = join(dir, 'animation.mp4');
      await writeFile(imagePath, png);
      const result = await createLocalAnimation({
        imagePath,
        outputPath,
        durationSeconds: 5,
        format: '1:1',
        resolution: 720,
      });
      expect(result).toMatchObject({
        width: 720,
        height: 720,
        sourceKind: 'local-animation',
        aiUpscaling: false,
        upscaled: true,
        nativeWidth: 1,
        nativeHeight: 1,
      });
      expect((await probeMedia(outputPath)).durationSeconds).toBeCloseTo(5, 1);
      expect(result.bytes).toBeGreaterThan(1000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
