import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('reusable brand identities in real SQLite', () => {
  it('protects private identities, validates real logo references and preserves applied project settings', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/brand-presets-runner.ts'],
      {
        cwd: process.cwd(),
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(JSON.parse(stdout)).toEqual([
      'private-api-and-origin-protection',
      'multiple-persisted-identities-and-public-dates',
      'strict-validation-and-independent-edits',
      'applied-preferences-and-existing-project-snapshots',
      'referential-logo-protection-and-nondestructive-preset-deletion',
    ]);
  }, 35000);
});
