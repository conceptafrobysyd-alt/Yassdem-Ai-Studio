import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('Fashion studio persistence and actual local contact sheet', () => {
  it('validates images, preserves independent style choices, reuses models and renders actual image tiles', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/fashion-runner.ts'],
      {
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    expect(JSON.parse(stdout)).toEqual([
      'independent-hijab-style-parameters',
      'strict-input-validation',
      'persistent-looks-and-reusable-mannequins',
      'variants-have-independent-parameters',
      'actual-collage-preserves-original-colors',
      'queued-collage-worker-idempotence-zero-cost',
      'unchanged-save-preserves-results-profile-changes-invalidate',
      'active-job-protects-look',
      'delete-references-and-private-paths',
    ]);
  }, 35_000);
});
