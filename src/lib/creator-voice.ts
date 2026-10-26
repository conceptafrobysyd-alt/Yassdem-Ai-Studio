import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  copyFile,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export type CreatorVoiceLanguage = 'fr' | 'en';
export type CreatorVoiceEngine = 'windows' | 'piper' | 'flite';
export type CreatorVoiceCapabilities = Record<
  CreatorVoiceLanguage,
  { available: boolean; engine?: CreatorVoiceEngine }
>;
export class CreatorVoiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
    this.name = 'CreatorVoiceError';
  }
}
type Command = {
  input?: string;
  cwd?: string;
  timeout?: number;
};
export type CreatorVoiceRunner = (
  binary: string,
  args: string[],
  options?: Command,
) => Promise<{ stdout: string; stderr: string }>;

/** Administrator-owned executables only. Narration is stdin or a UTF-8 file,
 * never shell source, command arguments, SSML, or a filter expression. */
const run: CreatorVoiceRunner = (binary, args, options = {}) =>
  new Promise((resolveCommand, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '',
      rejected = false;
    const fail = () => {
      if (rejected) return;
      rejected = true;
      child.kill('SIGKILL');
      reject(new CreatorVoiceError('CREATOR_VOICE_FAILED'));
    };
    const timer = setTimeout(fail, options.timeout ?? 15_000);
    child.stdout.on('data', (bytes: Buffer) => {
      stdout += bytes.toString('utf8');
      if (Buffer.byteLength(stdout) > 256 * 1024) fail();
    });
    child.stderr.on('data', (bytes: Buffer) => {
      stderr += bytes.toString('utf8');
      if (Buffer.byteLength(stderr) > 64 * 1024) fail();
    });
    child.on('error', () => {
      clearTimeout(timer);
      fail();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) fail();
      else if (!rejected) resolveCommand({ stdout, stderr });
    });
    child.stdin.on('error', () => {
      /* The process result remains authoritative. */
    });
    child.stdin.end(options.input ?? '');
  });

// This original script never embeds user text. -File respects Windows policy;
// the service does not change execution policy or install a missing voice.
const windowsScript = `param([string]$Action,[string]$Language,[string]$TextPath,[string]$OutputPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($speech.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { @{ Name = $_.VoiceInfo.Name; Language = $_.VoiceInfo.Culture.TwoLetterISOLanguageName } })
  if ($Action -eq 'list') { ConvertTo-Json -InputObject @($voices) -Compress; exit 0 }
  if ($Action -ne 'speak' -or ($Language -ne 'fr' -and $Language -ne 'en')) { throw 'Invalid voice request' }
  $voice = @($voices | Where-Object { $_.Language -eq $Language }) | Select-Object -First 1
  if (-not $voice) { throw 'Requested language is not installed' }
  $text = [System.IO.File]::ReadAllText($TextPath, [System.Text.Encoding]::UTF8)
  $speech.SelectVoice($voice.Name)
  $speech.SetOutputToWaveFile($OutputPath)
  $speech.Speak($text)
  $speech.SetOutputToNull()
} finally { $speech.Dispose() }
`;
type VoiceConfiguration = {
  engine: CreatorVoiceEngine;
  binary: string;
  model?: string;
};

/** Injection is server-side only, to verify Windows/Piper contracts on Linux.
 * Incoming API requests never select executable paths or model files. */
export class CreatorVoiceService {
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly execute: CreatorVoiceRunner;
  constructor(
    options: {
      platform?: NodeJS.Platform;
      env?: NodeJS.ProcessEnv;
      run?: CreatorVoiceRunner;
    } = {},
  ) {
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? process.env;
    this.execute = options.run ?? run;
  }
  private ffmpeg() {
    return this.env.FFMPEG_PATH || 'ffmpeg';
  }
  private ffprobe() {
    return this.env.FFPROBE_PATH || 'ffprobe';
  }
  private powershell() {
    return this.env.SystemRoot
      ? join(
          this.env.SystemRoot,
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        )
      : 'powershell.exe';
  }
  private async withWindowsScript<T>(
    action: (script: string, directory: string) => Promise<T>,
  ) {
    const directory = await mkdtemp(join(tmpdir(), 'yassdem-voice-check-'));
    try {
      const script = join(directory, 'voice.ps1');
      await writeFile(script, windowsScript, { mode: 0o600 });
      return await action(script, directory);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  private async configurations(): Promise<
    Partial<Record<CreatorVoiceLanguage, VoiceConfiguration>>
  > {
    const found: Partial<Record<CreatorVoiceLanguage, VoiceConfiguration>> = {};
    const piper = this.env.CREATOR_PIPER_PATH;
    if (piper) {
      let executableReady = false;
      for (const language of ['fr', 'en'] as const) {
        const configured =
          this.env[`CREATOR_PIPER_MODEL_${language.toUpperCase()}`];
        if (!configured) continue;
        const model = resolve(configured);
        try {
          const modelInfo = await stat(model);
          const configInfo = await stat(`${model}.json`);
          if (
            !modelInfo.isFile() ||
            !modelInfo.size ||
            !configInfo.isFile() ||
            configInfo.size > 256 * 1024
          )
            continue;
          const config: unknown = JSON.parse(
            await readFile(`${model}.json`, 'utf8'),
          );
          const data = config as {
            language?: { code?: unknown };
            espeak?: { voice?: unknown };
          };
          const modelLanguage = data?.language?.code ?? data?.espeak?.voice;
          if (
            typeof modelLanguage !== 'string' ||
            !new RegExp(`^${language}(?:[_-]|$)`, 'i').test(modelLanguage)
          )
            continue;
          if (!executableReady) {
            await this.execute(piper, ['--help'], { timeout: 5000 });
            executableReady = true;
          }
          found[language] = { engine: 'piper', binary: piper, model };
        } catch {
          /* A missing executable/model is unavailable, never downloaded. */
        }
      }
    }
    if (this.platform === 'win32' && (!found.fr || !found.en)) {
      try {
        const result = await this.withWindowsScript((script) =>
          this.execute(
            this.powershell(),
            [
              '-NoLogo',
              '-NoProfile',
              '-NonInteractive',
              '-File',
              script,
              '-Action',
              'list',
            ],
            { timeout: 10_000 },
          ),
        );
        const voices: unknown = JSON.parse(
          result.stdout.replace(/^\uFEFF/, '').trim(),
        );
        if (Array.isArray(voices))
          for (const language of ['fr', 'en'] as const) {
            if (
              !found[language] &&
              voices.some(
                (voice) =>
                  voice &&
                  typeof voice === 'object' &&
                  voice.Language === language,
              )
            )
              found[language] = {
                engine: 'windows',
                binary: this.powershell(),
              };
          }
      } catch {
        /* Honor local Windows execution policy and installed voice list. */
      }
    }
    if (!found.en) {
      try {
        const result = await this.execute(
          this.ffmpeg(),
          ['-hide_banner', '-filters'],
          { timeout: 5000 },
        );
        if (/\bflite\s+\|->A/.test(result.stdout))
          found.en = { engine: 'flite', binary: this.ffmpeg() };
      } catch {
        /* No voice is preferable to silently speaking the wrong language. */
      }
    }
    return found;
  }
  async capabilities(): Promise<CreatorVoiceCapabilities> {
    const found = await this.configurations();
    return {
      fr: found.fr
        ? { available: true, engine: found.fr.engine }
        : { available: false },
      en: found.en
        ? { available: true, engine: found.en.engine }
        : { available: false },
    };
  }
  async synthesize(input: {
    text: string;
    language: CreatorVoiceLanguage;
    outputPath: string;
  }) {
    if (
      !input ||
      typeof input.text !== 'string' ||
      !input.text.trim() ||
      input.text.length > 2000 ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.text) ||
      !['fr', 'en'].includes(input.language) ||
      typeof input.outputPath !== 'string' ||
      !isAbsolute(input.outputPath)
    )
      throw new CreatorVoiceError('CREATOR_VOICE_INVALID_INPUT', 400);
    const configuration = (await this.configurations())[input.language];
    if (!configuration)
      throw new CreatorVoiceError('CREATOR_VOICE_UNAVAILABLE');
    const directory = await mkdtemp(join(tmpdir(), 'yassdem-voice-'));
    let copied = false;
    try {
      const wav = join(directory, 'voice.wav');
      if (configuration.engine === 'windows') {
        const script = join(directory, 'voice.ps1');
        const text = join(directory, 'narration.txt');
        await writeFile(script, windowsScript, { mode: 0o600 });
        await writeFile(text, input.text, { mode: 0o600 });
        await this.execute(
          configuration.binary,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-File',
            script,
            '-Action',
            'speak',
            '-Language',
            input.language,
            '-TextPath',
            text,
            '-OutputPath',
            wav,
          ],
          { timeout: 180_000 },
        );
      } else if (configuration.engine === 'piper') {
        await this.execute(
          configuration.binary,
          ['--model', configuration.model!, '--output_file', wav],
          {
            input: `${input.text.replace(/\s+/g, ' ').trim()}\n`,
            timeout: 180_000,
          },
        );
      } else {
        await writeFile(join(directory, 'narration.txt'), input.text, {
          mode: 0o600,
        });
        await this.execute(
          configuration.binary,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-f',
            'lavfi',
            '-i',
            'flite=textfile=narration.txt:voice=slt',
            '-c:a',
            'pcm_s16le',
            '-ar',
            '22050',
            '-ac',
            '1',
            '-y',
            wav,
          ],
          { cwd: directory, timeout: 180_000 },
        );
      }
      const info = await stat(wav);
      if (!info.isFile() || info.size < 44 || info.size > 50 * 1024 * 1024)
        throw new Error();
      const header = (await readFile(wav)).subarray(0, 12);
      if (
        header.toString('ascii', 0, 4) !== 'RIFF' ||
        header.toString('ascii', 8, 12) !== 'WAVE'
      )
        throw new Error();
      const result = await this.execute(
        this.ffprobe(),
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          'stream=codec_type:format=duration',
          '-of',
          'json',
          wav,
        ],
        { timeout: 10_000 },
      );
      const data = JSON.parse(result.stdout) as {
        streams?: { codec_type?: string }[];
        format?: { duration?: string };
      };
      const durationSeconds = Number(data.format?.duration);
      if (
        !data.streams?.some((stream) => stream.codec_type === 'audio') ||
        data.streams.some((stream) => stream.codec_type !== 'audio') ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        durationSeconds > 300
      )
        throw new Error();
      // Do not overwrite an existing path, including a symlink to another file.
      await copyFile(wav, input.outputPath, constants.COPYFILE_EXCL);
      copied = true;
      return { durationSeconds, engine: configuration.engine };
    } catch (error) {
      if (copied)
        await rm(input.outputPath, { force: true }).catch(() => undefined);
      if (error instanceof CreatorVoiceError) throw error;
      throw new CreatorVoiceError('CREATOR_VOICE_FAILED');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function getCreatorVoiceCapabilities() {
  return new CreatorVoiceService().capabilities();
}
export function synthesizeCreatorVoice(input: {
  text: string;
  language: CreatorVoiceLanguage;
  outputPath: string;
}) {
  return new CreatorVoiceService().synthesize(input);
}
