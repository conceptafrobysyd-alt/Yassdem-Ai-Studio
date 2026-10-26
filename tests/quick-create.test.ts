import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('one-photo quick creation with real SQLite and FFmpeg', () => {
  it('keeps private, free, resumable defaults and rejects unavailable model generation', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/quick-create-runner.ts'],
      { cwd: process.cwd(), timeout: 90000, maxBuffer: 1024 * 1024 },
    );
    expect(JSON.parse(stdout)).toEqual([
      'private-api-and-origin-protection',
      'strict-source-validation-without-project-side-effects',
      'one-click-video-is-local-with-saved-brand-defaults',
      'retries-concurrency-and-key-conflicts-preserve-one-job',
      'real-worker-encodes-five-second-branded-mp4',
      'missing-model-service-and-incompatible-workflows-create-nothing',
      'configured-model-shortcut-preserves-source-and-preferences',
      'acknowledged-model-retry-needs-no-running-service',
    ]);
  }, 95000);
});
