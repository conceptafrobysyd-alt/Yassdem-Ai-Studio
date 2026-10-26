import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('creator persistence and private routes with real SQLite', () => {
  it('keeps reviewed revisions, source files, advertising context and retry bindings', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/creator-runner.ts'],
      { cwd: process.cwd(), timeout: 60000, maxBuffer: 1024 * 1024 },
    );
    expect(JSON.parse(stdout)).toEqual([
      'private-api-and-origin-protection',
      'four-real-persisted-plans-and-stable-creation-retries',
      'validated-read-only-media-references-and-independent-ateliers',
      'optimistic-revisions-explicit-approval-and-conflicts',
      'commercial-context-and-safe-exports',
      'project-copy-and-archive-retain-creator-content',
      'optional-ollama-contract-and-acknowledged-retry',
      'lost-save-response-replays-identical-content-without-new-revision',
      'reviewed-youtube-short-is-independent-vertical-and-idempotent',
    ]);
  }, 65000);
});
