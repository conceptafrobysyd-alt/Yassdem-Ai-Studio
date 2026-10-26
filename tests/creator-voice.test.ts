import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  CreatorVoiceService,
  type CreatorVoiceRunner,
} from '@/lib/creator-voice';

const exec = promisify(execFile);
const realRun: CreatorVoiceRunner = async (binary, args, options) => {
  const result = await exec(binary, args, {
    cwd: options?.cwd,
    timeout: options?.timeout ?? 15_000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};
function toneWav() {
  const rate = 22_050,
    samples = rate / 2;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++)
    bytes.writeInt16LE(
      Math.round(8000 * Math.sin((2 * Math.PI * n * 440) / rate)),
      44 + n * 2,
    );
  return bytes;
}

describe('free local creator narration', () => {
  it('creates a real audible English WAV with the installed FFmpeg flite filter', async (context) => {
    const directory = await mkdtemp(join(tmpdir(), 'yassdem-voice-real-'));
    const service = new CreatorVoiceService({
      platform: 'linux',
      env: {
        NODE_ENV: 'test',
        FFMPEG_PATH: process.env.FFMPEG_PATH,
        FFPROBE_PATH: process.env.FFPROBE_PATH,
      },
    });
    try {
      const capabilities = await service.capabilities();
      expect(capabilities.fr).toEqual({ available: false });
      if (!capabilities.en.available) {
        context.skip();
        return;
      }
      expect(capabilities.en).toEqual({ available: true, engine: 'flite' });
      const outputPath = join(directory, 'real-narration.wav');
      const voice = await service.synthesize({
        language: 'en',
        text: 'A small idea can become a clear and useful story.',
        outputPath,
      });
      expect(voice.engine).toBe('flite');
      expect(voice.durationSeconds).toBeGreaterThan(1);
      expect(voice.durationSeconds).toBeLessThan(15);
      const bytes = await readFile(outputPath);
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      const decoded = await exec(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner',
        '-i',
        outputPath,
        '-af',
        'volumedetect',
        '-f',
        'null',
        '-',
      ]);
      const mean = decoded.stderr.match(/mean_volume: (-?[\d.]+) dB/);
      expect(mean).not.toBeNull();
      expect(Number(mean![1])).toBeGreaterThan(-45);
      const original = Buffer.from(bytes);
      await expect(
        service.synthesize({
          language: 'en',
          text: 'A different narration.',
          outputPath,
        }),
      ).rejects.toMatchObject({ code: 'CREATOR_VOICE_FAILED' });
      expect(await readFile(outputPath)).toEqual(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it('does not silently use an English voice for French and rejects malformed input before execution', async () => {
    const calls: string[][] = [];
    const service = new CreatorVoiceService({
      platform: 'linux',
      env: { NODE_ENV: 'test' },
      run: async (binary, args) => {
        calls.push([binary, ...args]);
        return {
          stdout: ' ... flite             |->A       Synthesize voice',
          stderr: '',
        };
      },
    });
    expect(await service.capabilities()).toEqual({
      fr: { available: false },
      en: { available: true, engine: 'flite' },
    });
    await expect(
      service.synthesize({
        text: 'Bonjour le monde.',
        language: 'fr',
        outputPath: '/tmp/unavailable-voice.wav',
      }),
    ).rejects.toMatchObject({ code: 'CREATOR_VOICE_UNAVAILABLE' });
    expect(calls.every((call) => call.includes('-filters'))).toBe(true);
    const previous = calls.length;
    for (const input of [
      { text: '', language: 'en', outputPath: '/tmp/a.wav' },
      { text: 'a'.repeat(2001), language: 'en', outputPath: '/tmp/a.wav' },
      { text: 'Bad\0text', language: 'en', outputPath: '/tmp/a.wav' },
      { text: 'Hello', language: 'de', outputPath: '/tmp/a.wav' },
      { text: 'Hello', language: 'en', outputPath: '../a.wav' },
    ])
      await expect(
        service.synthesize(input as Parameters<typeof service.synthesize>[0]),
      ).rejects.toMatchObject({
        code: 'CREATOR_VOICE_INVALID_INPUT',
        status: 400,
      });
    expect(calls).toHaveLength(previous);
  });

  it('uses installed Windows voices and passes narration in a UTF-8 file without shell interpolation', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'yassdem-voice-windows-contract-'),
    );
    const calls: string[][] = [],
      scripts: string[] = [],
      temporaryPaths: string[] = [];
    const text = 'Bonjour ! $(Start-Process calc) ; `texte` <speak> & fin.';
    const service = new CreatorVoiceService({
      platform: 'win32',
      env: { NODE_ENV: 'test' },
      run: async (binary, args, options) => {
        if (!binary.endsWith('powershell.exe'))
          return realRun(binary, args, options);
        calls.push([binary, ...args]);
        const script = args[args.indexOf('-File') + 1];
        temporaryPaths.push(script);
        scripts.push(await readFile(script, 'utf8'));
        if (args.includes('list'))
          return {
            stdout: JSON.stringify([
              { Name: 'Voix FR de test', Language: 'fr' },
              { Name: 'EN test voice', Language: 'en' },
            ]),
            stderr: '',
          };
        expect(
          await readFile(args[args.indexOf('-TextPath') + 1], 'utf8'),
        ).toBe(text);
        expect(args[args.indexOf('-Language') + 1]).toBe('fr');
        await writeFile(args[args.indexOf('-OutputPath') + 1], toneWav());
        return { stdout: '', stderr: '' };
      },
    });
    try {
      expect(await service.capabilities()).toEqual({
        fr: { available: true, engine: 'windows' },
        en: { available: true, engine: 'windows' },
      });
      expect(
        await service.synthesize({
          language: 'fr',
          text,
          outputPath: join(directory, 'windows-contract.wav'),
        }),
      ).toEqual({ durationSeconds: 0.5, engine: 'windows' });
      expect(
        calls.every(
          (call) =>
            call.includes('-NonInteractive') &&
            call.includes('-File') &&
            !call.includes('-ExecutionPolicy'),
        ),
      ).toBe(true);
      expect(
        calls.every(
          (call) => !call.some((argument) => argument.includes(text)),
        ),
      ).toBe(true);
      expect(
        scripts.every(
          (script) =>
            script.includes('$speech.Speak($text)') &&
            !script.includes('SpeakSsml') &&
            !script.includes(text),
        ),
      ).toBe(true);
      for (const temporary of temporaryPaths)
        await expect(stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('requires an explicit matching Piper model and sends all narration through stdin as one utterance', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'yassdem-voice-piper-contract-'),
    );
    const model = join(directory, 'french voice.onnx');
    await writeFile(model, Buffer.from('contract fixture, not a real model'));
    await writeFile(
      `${model}.json`,
      JSON.stringify({ language: { code: 'fr_FR' } }),
    );
    let syntheses = 0;
    const service = new CreatorVoiceService({
      platform: 'linux',
      env: {
        NODE_ENV: 'test',
        CREATOR_PIPER_PATH: '/configured tools/piper',
        CREATOR_PIPER_MODEL_FR: model,
        CREATOR_PIPER_MODEL_EN: model,
      },
      run: async (binary, args, options) => {
        if (binary === '/configured tools/piper') {
          if (args.includes('--help'))
            return { stdout: 'piper help', stderr: '' };
          syntheses++;
          expect(args).toEqual([
            '--model',
            model,
            '--output_file',
            expect.any(String),
          ]);
          expect(options?.input).toBe(
            'Une première phrase. Une deuxième phrase ; $(commande) reste du texte.\n',
          );
          await writeFile(args[3], toneWav());
          return { stdout: '', stderr: '' };
        }
        if (args.includes('-filters')) return { stdout: '', stderr: '' };
        return realRun(binary, args, options);
      },
    });
    try {
      expect(await service.capabilities()).toEqual({
        fr: { available: true, engine: 'piper' },
        en: { available: false },
      });
      const outputPath = join(directory, 'piper-contract.wav');
      expect(
        await service.synthesize({
          language: 'fr',
          text: 'Une première phrase.\n Une deuxième phrase ; $(commande) reste du texte.',
          outputPath,
        }),
      ).toEqual({ durationSeconds: 0.5, engine: 'piper' });
      expect(syntheses).toBe(1);
      expect((await stat(outputPath)).size).toBeGreaterThan(44);
      await rm(`${model}.json`);
      expect((await service.capabilities()).fr.available).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects a failed or invalid synthesis without creating the requested output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'yassdem-voice-invalid-'));
    const outputPath = join(directory, 'must-not-exist.wav');
    const service = new CreatorVoiceService({
      platform: 'linux',
      env: { NODE_ENV: 'test' },
      run: async (_binary, args) => {
        if (args.includes('-filters'))
          return { stdout: ' ... flite |->A Synthesize', stderr: '' };
        await writeFile(args.at(-1)!, 'not an audio file');
        return { stdout: '', stderr: '' };
      },
    });
    try {
      await expect(
        service.synthesize({
          language: 'en',
          text: 'A test narration.',
          outputPath,
        }),
      ).rejects.toMatchObject({ code: 'CREATOR_VOICE_FAILED' });
      await expect(stat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
