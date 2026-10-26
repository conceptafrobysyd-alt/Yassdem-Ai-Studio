'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Clapperboard,
  FileText,
  Film,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { Badge, Button, Field, Input, Select, cn } from './ui/primitives';
import { creatorMessages } from '@/messages/creator';
import {
  MAX_CREATOR_SCENES,
  validateCreatorBrief,
  validateCreatorPlan,
  type CreatorBrief,
  type CreatorFormat,
  type CreatorMode,
  type CreatorPlan,
  type CreatorScene,
} from '@/lib/creator-script';
import type { CreatorDocument, CreatorRenderSettings } from '@/lib/creator';
import './creator-studio.css';

export type CreatorMedia = {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  url: string;
};
export type CreatorJob = {
  id: string;
  projectId: string;
  sourceMediaId: string;
  provider: string;
  kind: string;
  status: string;
  progress: number;
  parameters: Record<string, unknown>;
  estimatedCostCents: number;
  actualCostCents?: number;
  createdAt: string;
  outputMediaId?: string;
  outputUrl?: string;
  errorCode?: string;
};
type CreatorProject = {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
type Entry = { project: CreatorProject; document: CreatorDocument };
type Capabilities = {
  voices: {
    fr: { available: boolean; engine?: string };
    en: { available: boolean; engine?: string };
  };
  ollama: boolean;
};
export type CreatorStudioProps = {
  locale: 'fr' | 'en';
  media: CreatorMedia[];
  jobs: CreatorJob[];
  initialProjectId?: string;
  initialMode?: CreatorMode;
  startToken?: number;
  onRefresh: () => Promise<unknown>;
  onQueued: (job: CreatorJob) => void;
};
const ACTIVE = ['QUEUED', 'PROCESSING', 'SUBMITTING', 'RUNNING', 'EXPORTING'];
const VISUAL_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'];
const MODES: CreatorMode[] = ['ugc', 'affiliate', 'story', 'youtube'];
const emptyCapabilities: Capabilities = {
  voices: { fr: { available: false }, en: { available: false } },
  ollama: false,
};
function newBrief(mode: CreatorMode, language: 'fr' | 'en'): CreatorBrief {
  return {
    mode,
    language,
    subject: '',
    facts: [],
    audience: '',
    tone: 'clear',
    durationSeconds: mode === 'youtube' ? 180 : mode === 'story' ? 60 : 30,
    format: mode === 'youtube' ? '16:9' : '9:16',
    affiliateUrl: '',
    characters: [],
    episode: 1,
  };
}
class CreatorRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function request<T>(
  path: string,
  method = 'GET',
  body?: Record<string, unknown> | FormData,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers:
        body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : undefined,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
  } catch {
    throw new CreatorRequestError('NETWORK');
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new CreatorRequestError('NETWORK');
  }
  if (!response.ok)
    throw new CreatorRequestError(data.error?.code || 'UNKNOWN');
  return data as T;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function mediaDownload(id: string) {
  return `/api/media/${encodeURIComponent(id)}?download=1`;
}

export function CreatorStudio({
  locale,
  media,
  jobs,
  initialProjectId = '',
  initialMode = 'ugc',
  startToken = 0,
  onRefresh,
  onQueued,
}: CreatorStudioProps) {
  const t = creatorMessages[locale];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [capabilities, setCapabilities] =
    useState<Capabilities>(emptyCapabilities);
  const [brief, setBrief] = useState<CreatorBrief>(() =>
    newBrief(initialMode, locale),
  );
  const [factsText, setFactsText] = useState('');
  const [charactersText, setCharactersText] = useState('');
  const [source, setSource] = useState<'local' | 'ollama'>('local');
  const [saved, setSaved] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<CreatorDocument | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{
    key: keyof typeof t;
    error?: boolean;
  } | null>(null);
  const [importedMedia, setImportedMedia] = useState<CreatorMedia[]>([]);
  const [selectedVisuals, setSelectedVisuals] = useState<string[]>([]);
  const [musicRights, setMusicRights] = useState(false);
  const [acceptedJob, setAcceptedJob] = useState<CreatorJob | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const createSubmission = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const renderSubmission = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const shortSubmission = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const starterRef = useRef({ initialMode, startToken });
  const allMedia = [
    ...new Map(
      [...media, ...importedMedia].map((item) => [item.id, item]),
    ).values(),
  ];
  const visuals = allMedia.filter(
    (item) =>
      VISUAL_TYPES.includes(item.mimeType) &&
      !['LOGO', 'PREVIEW', 'PREVIEW_COVER'].includes(item.role),
  );
  const audio = allMedia.filter((item) => item.mimeType.startsWith('audio/'));
  const logos = allMedia.filter(
    (item) => item.role === 'LOGO' && item.mimeType.startsWith('image/'),
  );
  const dirty = Boolean(
    saved &&
    draft &&
    JSON.stringify({ plan: draft.plan, render: draft.render }) !==
      JSON.stringify({
        plan: saved.document.plan,
        render: saved.document.render,
      }),
  );
  const briefDirty =
    !saved &&
    (factsText.trim().length > 0 ||
      charactersText.trim().length > 0 ||
      source !== 'local' ||
      JSON.stringify(brief) !==
        JSON.stringify(newBrief(brief.mode, brief.language)));
  const projectId = saved?.project.id || '';
  const projectJobs = jobs.filter(
    (item) =>
      item.projectId === projectId &&
      ['creator', 'creator-preview'].includes(item.kind),
  );
  const job =
    acceptedJob?.projectId === projectId
      ? projectJobs.find((item) => item.id === acceptedJob.id) || acceptedJob
      : projectJobs[0] || null;
  const active = Boolean(job && ACTIVE.includes(job.status));
  const disabled = Boolean(busy) || active;
  const approved = Boolean(
    draft && !dirty && draft.approvedRevision === draft.revision,
  );
  const duration =
    draft?.plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) ||
    0;
  const resultUrl =
    job?.status === 'SUCCEEDED'
      ? job.outputUrl ||
        (job.outputMediaId ? `/api/media/${job.outputMediaId}` : '')
      : '';
  const coverId =
    typeof job?.parameters.outputCoverMediaId === 'string'
      ? job.parameters.outputCoverMediaId
      : '';
  const subtitleId =
    typeof job?.parameters.outputSubtitleMediaId === 'string'
      ? job.parameters.outputSubtitleMediaId
      : '';
  const snapshotRevision = object(
    object(job?.parameters.creator).document,
  ).revision;
  const resultOld = Boolean(
    job &&
    draft &&
    typeof snapshotRevision === 'number' &&
    snapshotRevision !== draft.revision,
  );
  const voiceAvailable = Boolean(
    draft && capabilities.voices[draft.plan.language]?.available,
  );

  function errorKey(error: unknown): keyof typeof t {
    const code =
      error instanceof CreatorRequestError
        ? error.code
        : error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'UNKNOWN';
    if (code === 'NETWORK') return 'network';
    if (/UNAUTH|SESSION|AUTH_REQUIRED/.test(code)) return 'auth';
    if (code === 'INVALID_ORIGIN') return 'origin';
    if (/REVISION|CONFLICT/.test(code)) return 'conflict';
    if (/AFFILIATE|DISCLOSURE/.test(code)) return 'affiliateError';
    if (/VOICE|NARRATION/.test(code)) return 'voiceError';
    if (/RIGHTS/.test(code)) return 'musicError';
    if (/APPROV/.test(code)) return 'approvalError';
    if (/OLLAMA/.test(code)) return 'ollamaError';
    if (/FFMPEG|FFPROBE|ENCOD/.test(code)) return 'engineError';
    if (/MEDIA|FILE|SOURCE|UPLOAD|MIME/.test(code)) return 'mediaError';
    if (/INVALID|DURATION|LIMIT|TOO_LARGE|CHARACTER/.test(code))
      return 'invalid';
    return 'genericError';
  }
  async function refreshList() {
    const result = await request<{
      projects: Entry[];
      capabilities: Capabilities;
    }>('/api/creator');
    setEntries(result.projects);
    setCapabilities(result.capabilities);
  }
  useEffect(() => {
    void refreshList().catch((error) =>
      setMessage({ key: errorKey(error), error: true }),
    );
  }, []);
  useEffect(() => {
    if (!job || !ACTIVE.includes(job.status)) lock.current = false;
  }, [job?.status, job?.id]);

  function canLeave() {
    return (!dirty && !briefDirty) || window.confirm(t.discard);
  }
  function reset(mode: CreatorMode) {
    if (busy || lock.current || active) {
      setMessage({ key: 'waitBusy' });
      return;
    }
    if (!canLeave()) return;
    setBrief(newBrief(mode, locale));
    setFactsText('');
    setCharactersText('');
    setSaved(null);
    setDraft(null);
    setStep(1);
    setMessage(null);
    setMusicRights(false);
    setAcceptedJob(null);
    setSelectedVisuals([]);
    setSource('local');
    createSubmission.current = null;
    renderSubmission.current = null;
    shortSubmission.current = null;
  }
  useEffect(() => {
    if (initialProjectId) {
      starterRef.current = { initialMode, startToken };
      return;
    }
    if (
      starterRef.current.startToken !== startToken ||
      starterRef.current.initialMode !== initialMode
    ) {
      starterRef.current = { initialMode, startToken };
      reset(initialMode);
    }
  }, [initialMode, startToken, initialProjectId]);

  function acceptEntry(entry: Entry, nextStep: 2 | 3 = 2) {
    setSaved(entry);
    setDraft(entry.document);
    setStep(nextStep);
    setEntries((current) => [
      entry,
      ...current.filter((item) => item.project.id !== entry.project.id),
    ]);
  }
  async function loadProject(id: string) {
    if (!id) return;
    if (lock.current || busy || active) {
      setMessage({ key: 'waitBusy' });
      return;
    }
    if (!canLeave()) return;
    lock.current = true;
    setBusy('load');
    setMessage(null);
    try {
      const entry = await request<Entry>(
        `/api/creator/${encodeURIComponent(id)}`,
      );
      acceptEntry(entry);
      setAcceptedJob(null);
      setMusicRights(false);
      setBrief(entry.document.brief);
      setFactsText(entry.document.brief.facts.join('\n'));
      setCharactersText(
        entry.document.brief.characters
          .map((character) => `${character.name} : ${character.description}`)
          .join('\n'),
      );
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  useEffect(() => {
    if (initialProjectId) void loadProject(initialProjectId);
  }, [initialProjectId, startToken]);

  function patchPlan(patch: Partial<CreatorPlan>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            plan: { ...current.plan, ...patch },
            approvedRevision: null,
          }
        : current,
    );
    setMessage(null);
  }
  function patchRender(patch: Partial<CreatorRenderSettings>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            render: { ...current.render, ...patch },
            approvedRevision: null,
          }
        : current,
    );
    setMessage(null);
    if ('musicMediaId' in patch) setMusicRights(false);
  }
  function patchScene(index: number, patch: Partial<CreatorScene>) {
    if (!draft) return;
    patchPlan({
      scenes: draft.plan.scenes.map((scene, i) =>
        i === index ? { ...scene, ...patch } : scene,
      ),
    });
  }
  function moveScene(index: number, delta: number) {
    if (
      !draft ||
      index + delta < 0 ||
      index + delta >= draft.plan.scenes.length
    )
      return;
    const scenes = [...draft.plan.scenes];
    [scenes[index], scenes[index + delta]] = [
      scenes[index + delta],
      scenes[index],
    ];
    patchPlan({ scenes });
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (busy || lock.current) return;
    lock.current = true;
    setBusy('prepare');
    setMessage(null);
    try {
      const characters = charactersText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const index = line.indexOf(':');
          return {
            name: index < 0 ? line : line.slice(0, index).trim(),
            description: index < 0 ? '' : line.slice(index + 1).trim(),
          };
        });
      const input = validateCreatorBrief({
        ...brief,
        facts: factsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        characters,
      });
      const fingerprint = JSON.stringify({ brief: input, source });
      if (createSubmission.current?.fingerprint !== fingerprint)
        createSubmission.current = { fingerprint, key: crypto.randomUUID() };
      const entry = await request<Entry>('/api/creator', 'POST', {
        brief: input,
        source,
        idempotencyKey: createSubmission.current.key,
      });
      createSubmission.current = null;
      acceptEntry(entry);
      setMusicRights(false);
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  async function save() {
    if (!draft || !saved || disabled || lock.current) return;
    lock.current = true;
    setBusy('save');
    setMessage(null);
    try {
      const plan = validateCreatorPlan(draft.plan, draft.brief);
      const entry = await request<Entry>(`/api/creator/${projectId}`, 'PUT', {
        plan,
        render: draft.render,
        expectedRevision: saved.document.revision,
      });
      acceptEntry(entry, step === 3 ? 3 : 2);
      setMessage({ key: 'saved' });
      renderSubmission.current = null;
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  async function approve() {
    if (!draft || !saved || dirty || disabled || lock.current) return;
    lock.current = true;
    setBusy('approve');
    setMessage(null);
    try {
      const entry = await request<Entry>(
        `/api/creator/${projectId}/approve`,
        'POST',
        { expectedRevision: draft.revision },
      );
      acceptEntry(entry, 3);
      renderSubmission.current = null;
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  async function render(mode: 'preview' | 'export') {
    if (!draft || !approved || disabled || lock.current) return;
    if (draft.render.musicMediaId && !musicRights) {
      setMessage({ key: 'musicError', error: true });
      return;
    }
    lock.current = true;
    setBusy(mode);
    setMessage(null);
    const fingerprint = JSON.stringify({
      projectId,
      expectedRevision: draft.revision,
      mode,
      musicRights,
    });
    if (renderSubmission.current?.fingerprint !== fingerprint)
      renderSubmission.current = { fingerprint, key: crypto.randomUUID() };
    let accepted = false;
    try {
      const result = await request<{ job: CreatorJob }>(
        `/api/creator/${projectId}/render`,
        'POST',
        {
          expectedRevision: draft.revision,
          idempotencyKey: renderSubmission.current.key,
          mode,
          musicRightsConfirmed: musicRights,
        },
      );
      accepted = true;
      setAcceptedJob(result.job);
      onQueued(result.job);
      renderSubmission.current = null;
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      if (!accepted) lock.current = false;
    }
  }
  function nextEpisode() {
    if (!draft || disabled || lock.current || !canLeave()) return;
    const next: CreatorBrief = {
      ...draft.brief,
      characters: draft.plan.characters.map((character) => ({ ...character })),
      episode: draft.plan.episode + 1,
      facts: [],
    };
    setBrief(next);
    setFactsText('');
    setCharactersText(
      next.characters
        .map((character) => `${character.name} : ${character.description}`)
        .join('\n'),
    );
    setSaved(null);
    setDraft(null);
    setStep(1);
    setMessage({ key: 'nextEpisodeHint' });
    setAcceptedJob(null);
    setMusicRights(false);
    setSelectedVisuals([]);
    createSubmission.current = null;
    renderSubmission.current = null;
    shortSubmission.current = null;
  }
  async function createShort() {
    if (
      !draft ||
      !approved ||
      draft.plan.mode !== 'youtube' ||
      disabled ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy('short');
    setMessage(null);
    const fingerprint = `${projectId}:${draft.revision}`;
    if (shortSubmission.current?.fingerprint !== fingerprint)
      shortSubmission.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const entry = await request<Entry>(
        `/api/creator/${projectId}/shorts`,
        'POST',
        {
          expectedRevision: draft.revision,
          idempotencyKey: shortSubmission.current.key,
        },
      );
      acceptEntry(entry);
      setBrief(entry.document.brief);
      setFactsText(entry.document.brief.facts.join('\n'));
      setCharactersText(
        entry.document.plan.characters
          .map((character) => `${character.name} : ${character.description}`)
          .join('\n'),
      );
      setAcceptedJob(null);
      setMusicRights(false);
      setMessage({ key: 'shortHint' });
      shortSubmission.current = null;
      renderSubmission.current = null;
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length || disabled || lock.current) return;
    lock.current = true;
    setBusy('upload');
    setMessage(null);
    const added: CreatorMedia[] = [];
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set('file', file);
        form.set('role', 'SOURCE');
        const result = await request<{ media: CreatorMedia }>(
          '/api/media',
          'POST',
          form,
        );
        added.push(result.media);
        setImportedMedia((current) => [
          result.media,
          ...current.filter((item) => item.id !== result.media.id),
        ]);
      }
      const ids = added
        .filter((item) => VISUAL_TYPES.includes(item.mimeType))
        .map((item) => item.id);
      if (ids.length && draft) {
        setSelectedVisuals(ids);
        patchPlan({
          scenes: draft.plan.scenes.map((scene, index) => ({
            ...scene,
            mediaId: ids[index % ids.length],
          })),
        });
      }
      void onRefresh().catch(() => setMessage({ key: 'refreshFailed' }));
    } catch (error) {
      setMessage({ key: errorKey(error), error: true });
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  function assignVisuals() {
    if (!draft || !selectedVisuals.length) return;
    patchPlan({
      scenes: draft.plan.scenes.map((scene, index) => ({
        ...scene,
        mediaId: selectedVisuals[index % selectedVisuals.length],
      })),
    });
  }
  const modeHint = {
    ugc: t.ugcHint,
    affiliate: t.affiliateHint,
    story: t.storyHint,
    youtube: t.youtubeHint,
  }[draft?.plan.mode || brief.mode];
  const formatOptions = (
    <>
      <option value="9:16">{t.vertical}</option>
      <option value="16:9">{t.landscape}</option>
      <option value="1:1">{t.square}</option>
      <option value="4:5">{t.portrait}</option>
    </>
  );
  const exportLinks = projectId ? (
    <div className="creator-export-links">
      <a href={`/api/creator/${projectId}/exports?format=json`} download>
        <FileText size={14} />
        {t.downloadScript}
      </a>
      <a href={`/api/creator/${projectId}/exports?format=srt`} download>
        {t.draftSrt}
      </a>
      <a href={`/api/creator/${projectId}/exports?format=publication`} download>
        {t.publication}
      </a>
    </div>
  ) : null;

  return (
    <section className="creator-workspace" aria-label={t.title}>
      <div className="creator-toolbar">
        <Field label={t.savedProjects}>
          <Select
            value={projectId}
            disabled={disabled}
            onChange={(event) => void loadProject(event.target.value)}
          >
            <option value="">{t.chooseProject}</option>
            {entries.map((entry) => (
              <option key={entry.project.id} value={entry.project.id}>
                {entry.project.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="creator-toolbar-actions">
          {draft?.plan.mode === 'story' && (
            <Button
              variant="secondary"
              disabled={disabled || draft.plan.episode >= 9999}
              onClick={nextEpisode}
            >
              <Plus size={16} />
              {t.nextEpisode}
            </Button>
          )}
          {draft?.plan.mode === 'youtube' && (
            <Button
              variant="secondary"
              disabled={disabled || !approved}
              onClick={() => void createShort()}
            >
              {busy === 'short' ? (
                <LoaderCircle className="creator-spin" size={16} />
              ) : (
                <Film size={16} />
              )}
              {t.shortVersion}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.refresh}
            disabled={!!busy}
            onClick={() =>
              void refreshList().catch((error) =>
                setMessage({ key: errorKey(error), error: true }),
              )
            }
          >
            <RefreshCw size={17} />
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => reset(brief.mode)}
          >
            <Plus size={16} />
            {t.newCreation}
          </Button>
        </div>
      </div>
      <nav className="creator-steps" aria-label={t.title}>
        {([1, 2, 3] as const).map((number, index) => (
          <button
            type="button"
            key={number}
            aria-current={step === number ? 'step' : undefined}
            className={cn(
              step === number && 'active',
              step > number && 'complete',
            )}
            disabled={
              !!busy ||
              (number !== 1 && !draft) ||
              (number === 1 && Boolean(draft))
            }
            onClick={() => setStep(number)}
          >
            <span>{step > number ? <Check size={14} /> : number}</span>
            {[t.idea, t.storyboard, t.create][index]}
          </button>
        ))}
      </nav>
      {message && (
        <p
          className={cn('creator-message', message.error && 'error')}
          role={message.error ? 'alert' : 'status'}
        >
          {t[message.key]}
        </p>
      )}
      {step === 1 && (
        <form
          className="creator-panel creator-brief"
          onSubmit={(event) => void prepare(event)}
        >
          <div className="creator-mode-grid">
            {MODES.map((mode) => (
              <button
                type="button"
                key={mode}
                disabled={!!busy}
                className={cn('creator-mode', brief.mode === mode && 'active')}
                aria-pressed={brief.mode === mode}
                onClick={() => {
                  setBrief((current) => ({
                    ...current,
                    mode,
                    durationSeconds:
                      mode === 'youtube' ? 180 : mode === 'story' ? 60 : 30,
                    format: mode === 'youtube' ? '16:9' : '9:16',
                  }));
                  setMessage(null);
                }}
              >
                {mode === 'story' ? (
                  <Users size={20} />
                ) : mode === 'youtube' ? (
                  <Film size={20} />
                ) : mode === 'affiliate' ? (
                  <Sparkles size={20} />
                ) : (
                  <Clapperboard size={20} />
                )}
                <span>{t[mode]}</span>
              </button>
            ))}
          </div>
          <p className="creator-intro">{modeHint}</p>
          <Field label={t.subject}>
            <Input
              value={brief.subject}
              onChange={(event) =>
                setBrief((current) => ({
                  ...current,
                  subject: event.target.value,
                }))
              }
              placeholder={t.subjectPlaceholder}
              maxLength={500}
              required
              disabled={!!busy}
            />
          </Field>
          <Field label={t.facts} hint={t.factsHint}>
            <textarea
              className="input creator-textarea"
              value={factsText}
              onChange={(event) => setFactsText(event.target.value)}
              placeholder={t.factsPlaceholder}
              rows={4}
              maxLength={6500}
              disabled={!!busy}
            />
          </Field>
          <Field label={t.audience}>
            <Input
              value={brief.audience}
              onChange={(event) =>
                setBrief((current) => ({
                  ...current,
                  audience: event.target.value,
                }))
              }
              placeholder={t.audiencePlaceholder}
              maxLength={160}
              disabled={!!busy}
            />
          </Field>
          <div className="creator-field-grid">
            <Field label={t.language}>
              <Select
                value={brief.language}
                disabled={!!busy}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    language: event.target.value as 'fr' | 'en',
                  }))
                }
              >
                <option value="fr">{t.french}</option>
                <option value="en">{t.english}</option>
              </Select>
            </Field>
            <Field label={t.tone}>
              <Select
                value={brief.tone}
                disabled={!!busy}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    tone: event.target.value as CreatorBrief['tone'],
                  }))
                }
              >
                <option value="clear">{t.clear}</option>
                <option value="warm">{t.warm}</option>
                <option value="energetic">{t.energetic}</option>
              </Select>
            </Field>
            <Field label={t.duration}>
              <Select
                value={brief.durationSeconds}
                disabled={!!busy}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    durationSeconds: Number(event.target.value),
                  }))
                }
              >
                {(brief.mode === 'youtube'
                  ? [30, 60, 180, 300, 600]
                  : [15, 30, 60, 90, 120]
                ).map((value) => (
                  <option key={value} value={value}>
                    {value < 60
                      ? `${value} ${t.seconds}`
                      : `${value / 60} ${t.minutes}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.format}>
              <Select
                value={brief.format}
                disabled={!!busy}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    format: event.target.value as CreatorFormat,
                  }))
                }
              >
                {formatOptions}
              </Select>
            </Field>
          </div>
          {brief.mode === 'affiliate' && (
            <Field label={t.affiliateUrl} hint={t.affiliateHintUrl}>
              <Input
                type="url"
                value={brief.affiliateUrl}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    affiliateUrl: event.target.value,
                  }))
                }
                placeholder="https://…"
                required
                maxLength={2048}
                disabled={!!busy}
              />
            </Field>
          )}
          {brief.mode === 'story' && (
            <div className="creator-story-brief">
              <Field label={t.characters} hint={t.charactersHint}>
                <textarea
                  className="input creator-textarea"
                  value={charactersText}
                  onChange={(event) => setCharactersText(event.target.value)}
                  placeholder={t.charactersPlaceholder}
                  rows={3}
                  maxLength={3500}
                  disabled={!!busy}
                />
              </Field>
              <Field label={t.episode}>
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  value={brief.episode}
                  onChange={(event) =>
                    setBrief((current) => ({
                      ...current,
                      episode: Number(event.target.value),
                    }))
                  }
                  disabled={!!busy}
                />
              </Field>
            </div>
          )}
          <details className="creator-details">
            <summary>
              <Settings2 size={15} />
              {t.source}
            </summary>
            <Field
              label={t.source}
              hint={source === 'local' ? t.localHint : undefined}
            >
              <Select
                value={source}
                disabled={!!busy}
                onChange={(event) =>
                  setSource(event.target.value as 'local' | 'ollama')
                }
              >
                <option value="local">{t.localSource}</option>
                <option value="ollama" disabled={!capabilities.ollama}>
                  {t.ollamaSource}
                </option>
              </Select>
            </Field>
            {!capabilities.ollama && (
              <p className="creator-hint">{t.ollamaUnavailable}</p>
            )}
          </details>
          <div className="creator-panel-actions">
            <Button type="submit" disabled={!!busy || !brief.subject.trim()}>
              {busy === 'prepare' ? (
                <LoaderCircle className="creator-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {busy === 'prepare' ? t.preparing : t.prepare}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
      {draft && step === 2 && (
        <div className="creator-script-layout">
          <section className="creator-panel creator-script-header">
            <div className="creator-section-heading">
              <div>
                <Badge tone="brand">{t[draft.plan.mode]}</Badge>
                {draft.plan.mode === 'story' && (
                  <Badge>
                    {t.fiction} · {draft.plan.episode}
                  </Badge>
                )}
              </div>
              <span className="creator-hint">
                {t.total} : {Math.round(duration * 10) / 10} s
              </span>
            </div>
            <Field label={t.scriptTitle}>
              <Input
                value={draft.plan.title}
                maxLength={180}
                disabled={disabled}
                onChange={(event) => patchPlan({ title: event.target.value })}
              />
            </Field>
            <Field label={t.hook}>
              <textarea
                className="input creator-textarea"
                rows={2}
                maxLength={300}
                value={draft.plan.hook}
                disabled={disabled}
                onChange={(event) => patchPlan({ hook: event.target.value })}
              />
            </Field>
            <details className="creator-details">
              <summary>{t.description}</summary>
              <Field label={t.description}>
                <textarea
                  className="input creator-textarea"
                  rows={4}
                  maxLength={3500}
                  value={draft.plan.description}
                  disabled={disabled}
                  onChange={(event) =>
                    patchPlan({ description: event.target.value })
                  }
                />
              </Field>
              <Field label={t.cta}>
                <Input
                  value={draft.plan.cta}
                  maxLength={300}
                  disabled={disabled}
                  onChange={(event) => patchPlan({ cta: event.target.value })}
                />
              </Field>
            </details>
            {draft.plan.adDisclosure && (
              <p className="creator-disclosure">
                <CheckCircle2 size={16} />
                <strong>{t.disclosure} :</strong> {draft.plan.adDisclosure}
              </p>
            )}
            {draft.plan.characters.length > 0 && (
              <details className="creator-details">
                <summary>
                  <Users size={15} />
                  {t.characterBible}
                </summary>
                <dl className="creator-character-list">
                  {draft.plan.characters.map((character) => (
                    <div key={character.name}>
                      <dt>{character.name}</dt>
                      <dd>{character.description}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </section>
          <section className="creator-panel creator-assets">
            <h3>
              <ImagePlus size={18} />
              {t.storyboard}
            </h3>
            <p className="creator-hint">{t.visualHelp}</p>
            <input
              ref={uploadInput}
              hidden
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,video/mp4,audio/mpeg,audio/wav,audio/mp4,.m4a"
              aria-label={t.upload}
              disabled={disabled}
              onChange={(event) => {
                void upload(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => uploadInput.current?.click()}
            >
              {busy === 'upload' ? (
                <LoaderCircle className="creator-spin" size={16} />
              ) : (
                <UploadCloud size={16} />
              )}
              {busy === 'upload' ? t.uploading : t.upload}
            </Button>
            <p className="creator-hint">{t.uploadHint}</p>
            <details className="creator-details">
              <summary>{t.visualsToUse}</summary>
              <p className="creator-hint">{t.autoAssignHint}</p>
              {visuals.length ? (
                <>
                  <div className="creator-select-actions">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        setSelectedVisuals(visuals.map((item) => item.id))
                      }
                    >
                      {t.selectAll}
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedVisuals([])}
                    >
                      {t.clearSelection}
                    </button>
                  </div>
                  <div className="creator-asset-grid">
                    {visuals.map((item) => (
                      <label
                        key={item.id}
                        className={cn(
                          'creator-asset-option',
                          selectedVisuals.includes(item.id) && 'selected',
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={selectedVisuals.includes(item.id)}
                          onChange={(event) =>
                            setSelectedVisuals((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        {item.mimeType.startsWith('image/') ? (
                          <img src={item.url} alt="" />
                        ) : (
                          <Film size={25} />
                        )}
                        <span>{item.name}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || !selectedVisuals.length}
                    onClick={assignVisuals}
                  >
                    {t.applyMedia}
                  </Button>
                </>
              ) : (
                <p className="creator-hint">{t.noVisuals}</p>
              )}
            </details>
          </section>
          <div className="creator-scenes">
            {draft.plan.scenes.map((scene, index) => {
              const visual = allMedia.find((item) => item.id === scene.mediaId);
              return (
                <section
                  key={scene.id}
                  className="creator-panel creator-scene"
                  aria-label={`${t.scene} ${index + 1}`}
                >
                  <div className="creator-section-heading">
                    <h3>
                      <span className="creator-scene-number">{index + 1}</span>
                      {t.scene} {index + 1}
                    </h3>
                    <div className="creator-scene-tools">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.moveUp} ${index + 1}`}
                        disabled={disabled || index === 0}
                        onClick={() => moveScene(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.moveDown} ${index + 1}`}
                        disabled={
                          disabled || index === draft.plan.scenes.length - 1
                        }
                        onClick={() => moveScene(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${t.removeScene} ${index + 1}`}
                        disabled={disabled || draft.plan.scenes.length < 2}
                        onClick={() =>
                          patchPlan({
                            scenes: draft.plan.scenes.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                  <div className="creator-scene-layout">
                    <div className="creator-scene-visual">
                      {visual?.mimeType.startsWith('image/') ? (
                        <img src={visual.url} alt={visual.name} />
                      ) : visual ? (
                        <>
                          <Film size={30} />
                          <span>{visual.name}</span>
                        </>
                      ) : (
                        <>
                          <FileText size={30} />
                          <span>{t.textCard}</span>
                        </>
                      )}
                      <Field label={`${t.sceneVisual} ${index + 1}`}>
                        <Select
                          value={scene.mediaId || ''}
                          disabled={disabled}
                          onChange={(event) =>
                            patchScene(index, {
                              mediaId: event.target.value || null,
                            })
                          }
                        >
                          <option value="">{t.textCard}</option>
                          {visuals.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="creator-scene-copy">
                      <div className="creator-scene-top-fields">
                        <Field label={t.sceneTitle}>
                          <Input
                            value={scene.title}
                            maxLength={160}
                            disabled={disabled}
                            onChange={(event) =>
                              patchScene(index, { title: event.target.value })
                            }
                          />
                        </Field>
                        <Field label={t.sceneDuration}>
                          <Input
                            type="number"
                            min={2}
                            max={60}
                            step={0.1}
                            value={scene.durationSeconds}
                            disabled={disabled}
                            onChange={(event) =>
                              patchScene(index, {
                                durationSeconds: Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Field label={t.narration} hint={t.narrationHint}>
                        <textarea
                          className="input creator-textarea"
                          rows={3}
                          maxLength={2000}
                          value={scene.narration}
                          disabled={disabled}
                          onChange={(event) =>
                            patchScene(index, { narration: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t.onScreen}>
                        <textarea
                          className="input creator-textarea"
                          rows={2}
                          maxLength={500}
                          value={scene.onScreenText}
                          disabled={disabled}
                          onChange={(event) =>
                            patchScene(index, {
                              onScreenText: event.target.value,
                            })
                          }
                        />
                      </Field>
                      <details className="creator-details">
                        <summary>{t.direction}</summary>
                        <Field label={t.direction} hint={t.directionHint}>
                          <textarea
                            className="input creator-textarea"
                            rows={2}
                            maxLength={600}
                            value={scene.visualDirection}
                            disabled={disabled}
                            onChange={(event) =>
                              patchScene(index, {
                                visualDirection: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </details>
                    </div>
                  </div>
                </section>
              );
            })}
            <Button
              variant="secondary"
              disabled={
                disabled || draft.plan.scenes.length >= MAX_CREATOR_SCENES
              }
              onClick={() =>
                patchPlan({
                  scenes: [
                    ...draft.plan.scenes,
                    {
                      id: `scene_${crypto.randomUUID()}`,
                      title: t.newSceneTitle,
                      narration: '',
                      onScreenText: '',
                      visualDirection: '',
                      durationSeconds: 5,
                      mediaId: null,
                    },
                  ],
                })
              }
            >
              <Plus size={16} />
              {t.addScene}
            </Button>
          </div>
          <section className="creator-panel creator-render-settings">
            <h3>
              <Settings2 size={18} />
              {t.exportSettings}
            </h3>
            <div className="creator-field-grid">
              <Field label={t.voice}>
                <Select
                  value={draft.render.voice}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({
                      voice: event.target
                        .value as CreatorRenderSettings['voice'],
                      narrationMediaId: null,
                    })
                  }
                >
                  <option value="none">{t.voiceNone}</option>
                  <option value="system" disabled={!voiceAvailable}>
                    {t.voiceSystem}
                  </option>
                  <option value="imported">{t.voiceImported}</option>
                </Select>
              </Field>
              <Field label={t.format}>
                <Select
                  value={draft.render.format}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({ format: event.target.value as CreatorFormat })
                  }
                >
                  {formatOptions}
                </Select>
              </Field>
              <Field label={t.resolution}>
                <Select
                  value={draft.render.resolution}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({
                      resolution: Number(event.target.value) as 720 | 1080,
                    })
                  }
                >
                  <option value={720}>720p</option>
                  <option value={1080}>1080p</option>
                </Select>
              </Field>
            </div>
            {!voiceAvailable && (
              <p className="creator-hint">{t.voiceUnavailable}</p>
            )}
            {draft.render.voice === 'imported' && (
              <Field label={t.narrationFile}>
                <Select
                  value={draft.render.narrationMediaId || ''}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({
                      narrationMediaId: event.target.value || null,
                    })
                  }
                >
                  <option value="">{t.chooseAudio}</option>
                  {audio.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <p className="creator-hint">{t.voiceHint}</p>
            <div className="creator-field-grid">
              <Field label={t.music}>
                <Select
                  value={draft.render.musicMediaId || ''}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({ musicMediaId: event.target.value || null })
                  }
                >
                  <option value="">{t.noMusic}</option>
                  {audio.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.render.musicMediaId && (
                <Field
                  label={`${t.musicVolume} · ${Math.round(draft.render.musicVolume * 100)}%`}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.render.musicVolume}
                    disabled={disabled}
                    onChange={(event) =>
                      patchRender({ musicVolume: Number(event.target.value) })
                    }
                  />
                </Field>
              )}
            </div>
            <details className="creator-details">
              <summary>{t.logo}</summary>
              <Field label={t.logo}>
                <Select
                  value={draft.render.logoId || ''}
                  disabled={disabled}
                  onChange={(event) =>
                    patchRender({ logoId: event.target.value || null })
                  }
                >
                  <option value="">{t.noLogo}</option>
                  {logos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.render.logoId && (
                <>
                  <div className="creator-field-grid">
                    <Field label={t.logoSize}>
                      <Input
                        type="number"
                        min={3}
                        max={50}
                        value={draft.render.logoSize}
                        disabled={disabled}
                        onChange={(event) =>
                          patchRender({ logoSize: Number(event.target.value) })
                        }
                      />
                    </Field>
                    <Field label={t.logoOpacity}>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draft.render.logoOpacity}
                        disabled={disabled}
                        onChange={(event) =>
                          patchRender({
                            logoOpacity: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label={t.logoPosition}>
                      <Select
                        value={draft.render.logoPosition}
                        disabled={disabled}
                        onChange={(event) =>
                          patchRender({
                            logoPosition: event.target
                              .value as CreatorRenderSettings['logoPosition'],
                          })
                        }
                      >
                        <option value="bottom-right">{t.bottomRight}</option>
                        <option value="bottom-left">{t.bottomLeft}</option>
                        <option value="top-right">{t.topRight}</option>
                        <option value="top-left">{t.topLeft}</option>
                        <option value="center">{t.center}</option>
                      </Select>
                    </Field>
                  </div>
                  <label className="creator-check">
                    <input
                      type="checkbox"
                      checked={draft.render.logoFade}
                      disabled={disabled}
                      onChange={(event) =>
                        patchRender({ logoFade: event.target.checked })
                      }
                    />
                    {t.logoFade}
                  </label>
                </>
              )}
            </details>
          </section>
          <section className="creator-panel creator-approval">
            <p className="creator-hint">{t.approvalHint}</p>
            {dirty && <p className="creator-unsaved">{t.unsaved}</p>}
            <div className="creator-panel-actions">
              <Button
                variant="secondary"
                onClick={() => void save()}
                disabled={disabled || !dirty}
              >
                {busy === 'save' ? (
                  <LoaderCircle className="creator-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                {t.save}
              </Button>
              <Button
                onClick={() => void approve()}
                disabled={disabled || dirty}
              >
                {busy === 'approve' ? (
                  <LoaderCircle className="creator-spin" size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {approved ? t.approved : t.approve}
                <ArrowRight size={16} />
              </Button>
            </div>
            {exportLinks}
          </section>
        </div>
      )}
      {draft && step === 3 && (
        <section className="creator-panel creator-final">
          <div className="creator-section-heading">
            <div>
              <Badge tone={approved ? 'success' : 'muted'}>
                {approved ? t.approved : t.unsaved}
              </Badge>
              <h2>{draft.plan.title}</h2>
            </div>
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => setStep(2)}
            >
              <ArrowLeft size={15} />
              {t.editScript}
            </Button>
          </div>
          <p className="creator-hint">{modeHint}</p>
          <div className="creator-render-summary">
            <span>{Math.round(duration)} s</span>
            <span>{draft.render.format}</span>
            <span>{draft.render.resolution}p</span>
            <span>
              {draft.render.voice === 'system'
                ? t.voiceSystem
                : draft.render.voice === 'imported'
                  ? t.voiceImported
                  : t.voiceNone}
            </span>
          </div>
          {draft.plan.adDisclosure && (
            <p className="creator-disclosure">
              <CheckCircle2 size={16} />
              {draft.plan.adDisclosure}
            </p>
          )}
          {draft.render.musicMediaId && (
            <label className="creator-check creator-music-rights">
              <input
                type="checkbox"
                checked={musicRights}
                disabled={disabled}
                onChange={(event) => setMusicRights(event.target.checked)}
              />
              {t.musicRights}
            </label>
          )}
          {!approved && (
            <p className="creator-message">{t.renderSettingsDirty}</p>
          )}
          <div className="creator-panel-actions">
            <Button
              variant="secondary"
              onClick={() => void render('preview')}
              disabled={
                disabled ||
                !approved ||
                Boolean(draft.render.musicMediaId && !musicRights)
              }
            >
              {busy === 'preview' ? (
                <LoaderCircle className="creator-spin" size={17} />
              ) : (
                <Film size={17} />
              )}
              {t.preview}
            </Button>
            <Button
              onClick={() => void render('export')}
              disabled={
                disabled ||
                !approved ||
                Boolean(draft.render.musicMediaId && !musicRights)
              }
            >
              {busy === 'export' ? (
                <LoaderCircle className="creator-spin" size={17} />
              ) : (
                <Clapperboard size={17} />
              )}
              {t.render}
            </Button>
          </div>
          <p className="creator-hint">
            {t.previewHint} {t.free}
          </p>
          {active && (
            <div className="creator-progress" role="status">
              <LoaderCircle className="creator-spin" size={22} />
              <div>
                <strong>
                  {job?.status === 'QUEUED' ? t.queued : t.processing}
                </strong>
                <progress
                  max={100}
                  value={job?.progress || undefined}
                  aria-label={t.waiting}
                />
              </div>
            </div>
          )}
          {job && ['FAILED', 'CANCELLED', 'UNKNOWN'].includes(job.status) && (
            <p className="creator-message error" role="alert">
              {job.status === 'CANCELLED'
                ? t.cancelled
                : job.status === 'UNKNOWN'
                  ? t.unknown
                  : `${t.failed} ${job.errorCode ? t[errorKey(new CreatorRequestError(job.errorCode))] : ''}`}
            </p>
          )}
          {resultUrl && (
            <div className="creator-result" aria-label={t.result}>
              <div className="creator-section-heading">
                <h3>
                  <CheckCircle2 size={18} />
                  {job?.kind === 'creator-preview' ? t.previewReady : t.ready}
                </h3>
                {resultOld && (
                  <span className="creator-hint">{t.resultOld}</span>
                )}
              </div>
              <video
                controls
                playsInline
                preload="metadata"
                src={resultUrl}
                aria-label={t.result}
              />
              <div className="creator-result-links">
                <a
                  className="button button-primary button-md"
                  href={`${resultUrl}${resultUrl.includes('?') ? '&' : '?'}download=1`}
                  download
                >
                  <ArrowDownToLine size={16} />
                  {t.download}
                </a>
                {coverId && (
                  <a
                    className="button button-secondary button-md"
                    href={mediaDownload(coverId)}
                    download
                  >
                    {t.downloadCover}
                  </a>
                )}
                {subtitleId && (
                  <a
                    className="button button-secondary button-md"
                    href={mediaDownload(subtitleId)}
                    download
                  >
                    {t.downloadSubtitles}
                  </a>
                )}
              </div>
            </div>
          )}
          {exportLinks}
        </section>
      )}
    </section>
  );
}
