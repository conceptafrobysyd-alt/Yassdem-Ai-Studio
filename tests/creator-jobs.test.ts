import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

describe('approved creator jobs with real SQLite, FFmpeg and private downloads', () => {
  it('freezes reviewed plans, resumes local jobs and encodes real short and long videos', async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'tests/helpers/creator-jobs-runner.ts'],
      { cwd: process.cwd(), timeout: 180000, maxBuffer: 1024 * 1024 },
    );
    const result = JSON.parse(stdout);
    expect(result.checks).toEqual([
      'private-render-api-and-review-gates',
      'music-rights-and-media-reference-protection',
      'stable-retries-conflicts-and-frozen-approved-snapshot',
      'startup-recovery-and-real-360p-preview',
      'canonical-affiliate-label-survives-blank-editable-text',
      'single-recovery-real-720p-export-and-private-subtitles',
      'queued-cancellation-is-never-rendered',
      'system-voice-audibility-and-explicit-language-unavailability',
      'actual-130-second-youtube-preview-and-empty-subtitle',
      'zero-local-budget-and-unchanged-original-source',
    ]);
    expect(result.youtubeSeconds).toBeCloseTo(130, 1);
    expect(['flite', 'windows', 'piper', 'unavailable']).toContain(
      result.voiceEngine,
    );
  }, 190000);
});
