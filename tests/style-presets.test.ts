import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('reusable fashion styles in real SQLite', () => {
  it('persists validated presets, combines explicit choices and keeps independent snapshots', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/style-presets-runner.ts'],
      { cwd: process.cwd(), timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    expect(JSON.parse(stdout)).toEqual([
      'private-api-and-origin-protection',
      'strict-reusable-parameters-and-independent-edits',
      'explicit-combination-preserves-model-hijab-and-prompt',
      'look-job-and-project-copy-keep-independent-snapshots',
      'legacy-look-defaults-preserve-existing-results',
    ]);
  }, 35000);
});
