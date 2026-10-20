'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Check,
  CheckCircle2,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  Save,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Type,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  cn,
} from './ui/primitives';
import { editorMessages, type EditorMessageKey } from '@/messages/editor';
import type { EditorCaption, EditorClip, EditorTimeline } from '@/lib/editor';
import './editor.css';

export type EditorProject = {
  id: string;
  name: string;
  type?: string;
  parameters?: unknown;
};
export type EditorMedia = {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  url: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
};
export type EditorJob = {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  progress: number;
  parameters: Record<string, unknown>;
  outputMediaId?: string | null;
  errorCode?: string | null;
  createdAt: string;
  updatedAt?: string;
};
export type EditorStudioProps = {
  locale: 'fr' | 'en';
  projects: EditorProject[];
  media: EditorMedia[];
  jobs: EditorJob[];
  onRefresh: () => Promise<unknown>;
  initialProjectId?: string;
};
type Draft = { timeline: EditorTimeline; saved: string; rights: boolean };
const ACTIVE = ['QUEUED', 'PROCESSING', 'EXPORTING', 'RUNNING', 'SUBMITTING'];
const emptyTimeline = (): EditorTimeline => ({
  version: 1,
  clips: [],
  captions: [],
  transition: 'cut',
  musicMediaId: null,
  musicVolume: 0.25,
  format: '9:16',
  resolution: 1080,
  codec: 'h264',
  quality: 21,
  logoId: null,
  logoSize: 15,
  logoOpacity: 0.8,
  logoPosition: 'bottom-right',
  logoFade: false,
  logoTiming: 'all',
});
const totalDuration = (timeline: EditorTimeline) =>
  Math.max(
    0,
    timeline.clips.reduce(
      (sum, clip) => sum + clip.endSeconds - clip.startSeconds,
      0,
    ) -
      (timeline.transition === 'fade'
        ? Math.max(0, timeline.clips.length - 1) * 0.35
        : 0),
  );
class EditorRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function request(path: string, method = 'GET', body?: unknown) {
  try {
    const response = await fetch(path, {
      method,
      headers:
        body instanceof FormData
          ? undefined
          : body
            ? { 'Content-Type': 'application/json' }
            : undefined,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
    const data = await response.json();
    if (!response.ok)
      throw new EditorRequestError(data.error?.code || 'UNKNOWN');
    return data;
  } catch (error) {
    if (error instanceof EditorRequestError) throw error;
    throw new EditorRequestError('NETWORK');
  }
}
export function EditorStudio({
  locale,
  projects,
  media,
  jobs,
  onRefresh,
  initialProjectId,
}: EditorStudioProps) {
  const t = (key: EditorMessageKey) => editorMessages[locale][key];
  const [projectId, setProjectId] = useState(
    initialProjectId || projects[0]?.id || '',
  );
  const [timeline, setTimeline] = useState<EditorTimeline>(emptyTimeline);
  const [saved, setSaved] = useState(JSON.stringify(emptyTimeline()));
  const [rights, setRights] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [extraProjects, setExtraProjects] = useState<EditorProject[]>([]);
  const [extraMedia, setExtraMedia] = useState<EditorMedia[]>([]);
  const [localJobs, setLocalJobs] = useState<EditorJob[]>([]);
  const [picker, setPicker] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [clipIndex, setClipIndex] = useState(0);
  const [previewKind, setPreviewKind] = useState<
    'source' | 'composition' | 'output'
  >('source');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [videoFailed, setVideoFailed] = useState(false);
  const drafts = useRef(new Map<string, Draft>());
  const videoUpload = useRef<HTMLInputElement>(null),
    musicUpload = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const pendingRender = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const allProjects = useMemo(
    () => [
      ...new Map(
        [...projects, ...extraProjects].map((item) => [item.id, item]),
      ).values(),
    ],
    [projects, extraProjects],
  );
  const allMedia = useMemo(
    () => [
      ...new Map(
        [...media, ...extraMedia].map((item) => [item.id, item]),
      ).values(),
    ],
    [media, extraMedia],
  );
  const videos = allMedia.filter(
    (item) => item.mimeType === 'video/mp4' && item.role !== 'PREVIEW',
  );
  const music = allMedia.filter(
    (item) =>
      item.role !== 'PREVIEW' &&
      (item.mimeType.startsWith('audio/') || item.mimeType === 'video/mp4'),
  );
  const logos = allMedia.filter(
    (item) => item.role === 'LOGO' && item.mimeType.startsWith('image/'),
  );
  const allJobs = useMemo(() => {
    const map = new Map(jobs.map((job) => [job.id, job]));
    for (const local of localJobs) {
      const remote = map.get(local.id);
      if (
        !remote ||
        Date.parse(local.updatedAt || local.createdAt) >=
          Date.parse(remote.updatedAt || remote.createdAt)
      )
        map.set(local.id, local);
    }
    return [...map.values()]
      .filter((job) => job.kind === 'edit' || job.kind === 'edit-preview')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [jobs, localJobs]);
  const projectJobs = allJobs.filter((job) => job.projectId === projectId);
  const outputJobs = projectJobs.filter(
    (job) =>
      job.kind === 'edit' && job.status === 'SUCCEEDED' && job.outputMediaId,
  );
  const outputJob =
    outputJobs.find((job) => job.id === selectedJobId) || outputJobs[0];
  const previewJobs = projectJobs.filter(
    (job) =>
      job.kind === 'edit-preview' &&
      job.status === 'SUCCEEDED' &&
      job.outputMediaId,
  );
  const previewJob =
    previewJobs.find((job) => job.id === selectedJobId) || previewJobs[0];
  const previewMatchesDraft = Boolean(
    previewJob &&
    JSON.stringify(previewJob.parameters.timeline) === JSON.stringify(timeline),
  );
  const selectedClip = timeline.clips[clipIndex] || timeline.clips[0];
  const source = selectedClip
    ? allMedia.find((item) => item.id === selectedClip.mediaId)
    : undefined;
  const duration = totalDuration(timeline);
  const sourceDuration = timeline.clips.reduce(
    (sum, clip) => sum + clip.endSeconds - clip.startSeconds,
    0,
  );
  const dirty = JSON.stringify(timeline) !== saved;
  const activeIds = allJobs
    .filter((job) => ACTIVE.includes(job.status))
    .map((job) => job.id)
    .join(',');
  function errorMessage(error: unknown) {
    const code =
      error instanceof EditorRequestError
        ? error.code
        : typeof error === 'string'
          ? error
          : 'UNKNOWN';
    if (code === 'NETWORK') return t('errorNetwork');
    if (/AUTH_REQUIRED|UNAUTH/.test(code)) return t('errorAuth');
    if (/MUSIC_RIGHTS/.test(code)) return t('errorRights');
    if (/FONT/.test(code)) return t('errorFont');
    if (/EDITOR_(TRIM|VIDEO)|MEDIA|MUSIC_NOT_FOUND/.test(code))
      return t('errorMedia');
    if (/FILE|UPLOAD|UNSUPPORTED|INVALID_AUDIO/.test(code))
      return t('errorFile');
    if (/INVALID|EDITOR_(CLIP|DURATION|CAPTION)/.test(code))
      return t('errorTimeline');
    if (/FFMPEG|RENDER|EXPORT|CODEC/.test(code)) return t('errorExport');
    return t('errorGeneric');
  }
  function notify(text: string, error = false) {
    setNotice({ text, error });
  }
  function remember() {
    if (projectId) drafts.current.set(projectId, { timeline, saved, rights });
  }
  function changeProject(id: string) {
    remember();
    setProjectId(id);
    setClipIndex(0);
    setSelectedJobId('');
    setPreviewKind('source');
    pendingRender.current = null;
  }
  function updateTimeline(
    updater: EditorTimeline | ((previous: EditorTimeline) => EditorTimeline),
  ) {
    setTimeline((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      if (projectId)
        drafts.current.set(projectId, { timeline: next, saved, rights });
      return next;
    });
  }
  function patch<K extends keyof EditorTimeline>(
    key: K,
    value: EditorTimeline[K],
  ) {
    updateTimeline((previous) => ({ ...previous, [key]: value }));
  }
  async function act(key: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setBusy('');
      busyRef.current = false;
    }
  }
  useEffect(() => {
    if (!projectId) return;
    const cached = drafts.current.get(projectId);
    if (cached) {
      setTimeline(cached.timeline);
      setSaved(cached.saved);
      setRights(cached.rights);
      setLoading(false);
      setLoadFailed(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    request(`/api/editor/${projectId}`)
      .then((data) => {
        if (!active) return;
        const next = data.timeline as EditorTimeline;
        const fingerprint = JSON.stringify(next);
        setTimeline(next);
        setSaved(fingerprint);
        setRights(false);
        drafts.current.set(projectId, {
          timeline: next,
          saved: fingerprint,
          rights: false,
        });
      })
      .catch((error) => {
        if (active) {
          setLoadFailed(true);
          notify(errorMessage(error), true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!projectId && allProjects.length) setProjectId(allProjects[0].id);
  }, [projectId, allProjects]);
  useEffect(() => {
    if (initialProjectId && initialProjectId !== projectId)
      changeProject(initialProjectId);
  }, [initialProjectId]);
  useEffect(() => {
    if (!activeIds) return;
    let active = true;
    const poll = async () => {
      const results = await Promise.allSettled(
        activeIds.split(',').map((id) => request(`/api/jobs/${id}`)),
      );
      if (!active) return;
      const refreshed = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value.job as EditorJob] : [],
      );
      if (refreshed.length)
        setLocalJobs((previous) => [
          ...refreshed,
          ...previous.filter(
            (job) => !refreshed.some((item) => item.id === job.id),
          ),
        ]);
      if (refreshed.some((job) => !ACTIVE.includes(job.status)))
        onRefreshRef.current().catch(() => {});
    };
    const timer = setInterval(() => {
      void poll();
    }, 2500);
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [activeIds]);
  useEffect(() => {
    setVideoFailed(false);
  }, [source?.id, outputJob?.id, previewJob?.id, previewKind]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function createProject(name: string, reset = false) {
    remember();
    const result = await request('/api/projects', 'POST', {
      name,
      type: 'product',
      description: '',
      parameters: {},
    });
    const project = result.project as EditorProject;
    const next = reset ? emptyTimeline() : timeline;
    const fingerprint = JSON.stringify(emptyTimeline());
    drafts.current.set(project.id, {
      timeline: next,
      saved: fingerprint,
      rights: reset ? false : rights,
    });
    setExtraProjects((previous) => [...previous, project]);
    setProjectId(project.id);
    setTimeline(next);
    setSaved(fingerprint);
    if (reset) setRights(false);
    setClipIndex(0);
    setSelectedJobId('');
    setPreviewKind('source');
    onRefreshRef.current().catch(() => {});
    return project.id;
  }
  async function ensureProject() {
    return projectId || createProject(t('newProject'));
  }
  function addClip(item: EditorMedia) {
    if (
      timeline.clips.length >= 12 ||
      sourceDuration >= 119.5 ||
      !item.duration ||
      item.duration < 0.5
    ) {
      notify(t('errorTimeline'), true);
      return;
    }
    const endSeconds =
      Math.round(Math.min(item.duration, 15, 120 - sourceDuration) * 1000) /
      1000;
    patch('clips', [
      ...timeline.clips,
      { mediaId: item.id, startSeconds: 0, endSeconds },
    ]);
    setClipIndex(timeline.clips.length);
    setPreviewKind('source');
    setPicker(false);
  }
  function editClip(
    index: number,
    key: keyof Omit<EditorClip, 'mediaId'>,
    value: number,
  ) {
    patch(
      'clips',
      timeline.clips.map((clip, i) =>
        i === index ? { ...clip, [key]: value } : clip,
      ),
    );
  }
  function moveClip(index: number, offset: number) {
    const next = [...timeline.clips];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    patch('clips', next);
    setClipIndex(index + offset);
    setPreviewKind('source');
  }
  function editCaption<K extends keyof EditorCaption>(
    index: number,
    key: K,
    value: EditorCaption[K],
  ) {
    patch(
      'captions',
      timeline.captions.map((caption, i) =>
        i === index ? { ...caption, [key]: value } : caption,
      ),
    );
  }
  async function upload(file: File, kind: 'video' | 'music') {
    if (file.size > 100 * 1024 * 1024)
      throw new EditorRequestError('FILE_TOO_LARGE');
    const id = await ensureProject();
    const body = new FormData();
    body.set('file', file);
    body.set('role', 'SOURCE');
    body.set('projectId', id);
    const result = await request('/api/media', 'POST', body);
    const item = result.media as EditorMedia;
    setExtraMedia((previous) => [...previous, item]);
    if (kind === 'music') {
      patch('musicMediaId', item.id);
      setRights(false);
    } else if (item.mimeType === 'video/mp4') addClip(item);
    else throw new EditorRequestError('UNSUPPORTED_MEDIA');
    notify(t('uploadDone'));
    onRefreshRef.current().catch(() => {});
  }
  async function persist(announce = true) {
    const id = await ensureProject();
    const result = await request(`/api/editor/${id}`, 'PUT', { timeline });
    const next = result.timeline as EditorTimeline,
      fingerprint = JSON.stringify(next);
    setTimeline(next);
    setSaved(fingerprint);
    drafts.current.set(id, { timeline: next, saved: fingerprint, rights });
    if (announce) notify(t('saveDone'));
    onRefreshRef.current().catch(() => {});
    return { id, timeline: next };
  }
  async function render(mode: 'preview' | 'export' = 'export') {
    if (timeline.musicMediaId && !rights)
      throw new EditorRequestError('MUSIC_RIGHTS_REQUIRED');
    const result = await persist(false);
    const fingerprint = JSON.stringify({
      projectId: result.id,
      timeline: result.timeline,
      rights,
      mode,
    });
    if (pendingRender.current?.fingerprint !== fingerprint)
      pendingRender.current = { fingerprint, key: crypto.randomUUID() };
    const response = await request(`/api/editor/${result.id}/render`, 'POST', {
      idempotencyKey: pendingRender.current.key,
      musicRightsConfirmed: rights,
      mode,
    });
    pendingRender.current = null;
    setLocalJobs((previous) => [
      response.job,
      ...previous.filter((job) => job.id !== response.job.id),
    ]);
    if (mode === 'preview') {
      setSelectedJobId(response.job.id);
      setPreviewKind('composition');
    }
    notify(t(mode === 'preview' ? 'previewStarted' : 'renderStarted'));
    onRefreshRef.current().catch(() => {});
  }
  const statusKey = (status: string): EditorMessageKey =>
    (
      ({
        QUEUED: 'queued',
        PROCESSING: 'processing',
        EXPORTING: 'processing',
        RUNNING: 'processing',
        SUBMITTING: 'processing',
        SUCCEEDED: 'done',
        FAILED: 'failed',
        CANCELLED: 'cancelled',
      }) as Record<string, EditorMessageKey>
    )[status] || 'unknown';
  const positionOptions = [
    { value: 'top-left', label: 'topLeft' },
    { value: 'top-right', label: 'topRight' },
    { value: 'bottom-left', label: 'bottomLeft' },
    { value: 'bottom-right', label: 'bottomRight' },
    { value: 'center', label: 'center' },
  ] as const;
  const renderedJob = previewKind === 'composition' ? previewJob : outputJob;
  const previewUrl =
    previewKind === 'source'
      ? source?.url
      : renderedJob?.outputMediaId
        ? `/api/media/${renderedJob.outputMediaId}`
        : undefined;
  const coverId =
    typeof renderedJob?.parameters.coverMediaId === 'string'
      ? renderedJob.parameters.coverMediaId
      : undefined;
  return (
    <div className="editor-module">
      <input
        className="visually-hidden"
        ref={videoUpload}
        type="file"
        accept=".mp4,video/mp4"
        aria-label={t('import')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void act('upload', () => upload(file, 'video'));
          event.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        ref={musicUpload}
        type="file"
        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
        aria-label={t('importMusic')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void act('upload-music', () => upload(file, 'music'));
          event.target.value = '';
        }}
      />
      <section className="editor-hero">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {t('eyebrow')}
          </span>
          <h2>{t('title')}</h2>
          <p>{t('description')}</p>
          <span className="editor-local">
            <ShieldCheck size={13} />
            {t('local')}
          </span>
        </div>
        <div className="editor-hero-art" aria-hidden="true">
          <span className="editor-art-grid" />
          <div className="editor-art-frame">
            <Play size={31} fill="currentColor" strokeWidth={1} />
            <span>YASSDEM / MOTION</span>
          </div>
          <div className="editor-art-track">
            <i />
            <i />
            <i />
          </div>
          <span className="editor-art-time">00:12 / 00:24</span>
        </div>
      </section>
      <div className="editor-toolbar">
        <div className="editor-project">
          <Field label={t('project')}>
            <Select
              value={projectId}
              disabled={!!busy || loading}
              onChange={(event) => changeProject(event.target.value)}
            >
              <option value="" disabled>
                {t('chooseProject')}
              </option>
              {allProjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="secondary"
            size="icon"
            title={t('newProject')}
            aria-label={t('newProject')}
            disabled={!!busy || loading}
            onClick={() => {
              setProjectName('');
              setNewProject(true);
            }}
          >
            <Plus size={17} />
          </Button>
        </div>
        <div className="editor-save">
          <span className={cn('editor-save-state', dirty && 'is-dirty')}>
            {dirty ? <span /> : <Check size={12} />}{' '}
            {t(dirty ? 'unsaved' : 'saved')}
          </span>
          <Button
            variant="secondary"
            disabled={!!busy || loading || loadFailed || !timeline.clips.length}
            onClick={() =>
              void act('save', async () => {
                await persist();
              })
            }
          >
            {busy === 'save' ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Save size={15} />
            )}{' '}
            {t('save')}
          </Button>
        </div>
      </div>
      {loading && (
        <div className="editor-loading" role="status">
          <LoaderCircle size={20} className="spin" />
          {t('loading')}
        </div>
      )}
      {loadFailed && (
        <div className="editor-alert" role="alert">
          <p>{t('errorNetwork')}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void act('reload', async () => {
                const data = await request(`/api/editor/${projectId}`);
                setTimeline(data.timeline);
                setSaved(JSON.stringify(data.timeline));
                drafts.current.set(projectId, {
                  timeline: data.timeline,
                  saved: JSON.stringify(data.timeline),
                  rights: false,
                });
                setLoadFailed(false);
              })
            }
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <div className="editor-workspace">
        <fieldset
          className="editor-controls"
          disabled={!!busy || loading || loadFailed}
        >
          <section className="panel editor-sequence">
            <div className="panel-heading">
              <h2>
                <Scissors size={17} />
                {t('timeline')}
              </h2>
              <Badge>{timeline.clips.length} / 12</Badge>
            </div>
            <div className="panel-body">
              <p className="section-description">{t('timelineHelp')}</p>
              {!timeline.clips.length ? (
                <div className="editor-empty">
                  <span>
                    <Film size={30} strokeWidth={1} />
                  </span>
                  <h3>{t('emptyTitle')}</h3>
                  <p>{t('emptyDescription')}</p>
                  <div>
                    <Button
                      size="sm"
                      onClick={() => videoUpload.current?.click()}
                    >
                      <UploadCloud size={15} />
                      {t('import')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPicker(true)}
                    >
                      <Layers3 size={15} />
                      {t('library')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="editor-time-track" aria-label={t('timeline')}>
                    {timeline.clips.map((clip, index) => (
                      <button
                        key={`${clip.mediaId}-${index}`}
                        style={{
                          flex: Math.max(
                            0.5,
                            clip.endSeconds - clip.startSeconds,
                          ),
                        }}
                        className={cn(index === clipIndex && 'selected')}
                        onClick={() => {
                          setClipIndex(index);
                          setPreviewKind('source');
                        }}
                        title={
                          allMedia.find((item) => item.id === clip.mediaId)
                            ?.name
                        }
                      >
                        <Film size={13} />
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </button>
                    ))}
                  </div>
                  <div className="editor-clips">
                    {timeline.clips.map((clip, index) => {
                      const item = allMedia.find(
                        (media) => media.id === clip.mediaId,
                      );
                      return (
                        <article
                          className={cn(
                            'editor-clip',
                            index === clipIndex && 'selected',
                          )}
                          key={`${clip.mediaId}-${index}`}
                        >
                          <div className="editor-clip-heading">
                            <button
                              className="editor-clip-label"
                              onClick={() => {
                                setClipIndex(index);
                                setPreviewKind('source');
                              }}
                            >
                              <span>{String(index + 1).padStart(2, '0')}</span>
                              <strong>{item?.name || t('source')}</strong>
                              <small>
                                {Math.max(
                                  0,
                                  clip.endSeconds - clip.startSeconds,
                                ).toFixed(2)}{' '}
                                {t('seconds')}
                              </small>
                            </button>
                            <div>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`${t('moveUp')} ${index + 1}`}
                                disabled={index === 0 || !!busy}
                                onClick={() => moveClip(index, -1)}
                              >
                                <ArrowUp size={14} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`${t('moveDown')} ${index + 1}`}
                                disabled={
                                  index === timeline.clips.length - 1 || !!busy
                                }
                                onClick={() => moveClip(index, 1)}
                              >
                                <ArrowDown size={14} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`${t('remove')} ${index + 1}`}
                                onClick={() => {
                                  patch(
                                    'clips',
                                    timeline.clips.filter(
                                      (_, i) => i !== index,
                                    ),
                                  );
                                  setClipIndex(0);
                                }}
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                          <div className="field-pair">
                            <Field label={t('start')}>
                              <Input
                                type="number"
                                min={0}
                                max={Math.max(0, clip.endSeconds - 0.5)}
                                step={0.05}
                                value={clip.startSeconds}
                                onChange={(event) =>
                                  editClip(
                                    index,
                                    'startSeconds',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </Field>
                            <Field label={t('end')}>
                              <Input
                                type="number"
                                min={clip.startSeconds + 0.5}
                                max={item?.duration || 86400}
                                step={0.05}
                                value={clip.endSeconds}
                                onChange={(event) =>
                                  editClip(
                                    index,
                                    'endSeconds',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </Field>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="editor-add-row">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={timeline.clips.length >= 12}
                      onClick={() => setPicker(true)}
                    >
                      <Plus size={14} />
                      {t('addClip')}
                    </Button>
                    <button
                      className="text-link"
                      onClick={() => videoUpload.current?.click()}
                    >
                      <UploadCloud size={14} />
                      {t('import')}
                    </button>
                    <span>
                      {t('duration')}{' '}
                      <strong>
                        {duration.toFixed(2)} {t('seconds')}
                      </strong>
                    </span>
                  </div>
                </>
              )}
              <Field label={t('transition')}>
                <Select
                  value={timeline.transition}
                  onChange={(event) =>
                    patch(
                      'transition',
                      event.target.value as EditorTimeline['transition'],
                    )
                  }
                >
                  <option value="cut">{t('cut')}</option>
                  <option value="fade">{t('fade')} · 0,35 s</option>
                </Select>
              </Field>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <Type size={17} />
                {t('captions')}
              </h2>
              <Badge>{timeline.captions.length} / 40</Badge>
            </div>
            <div className="panel-body">
              <p className="section-description">{t('captionsHelp')}</p>
              {!timeline.captions.length && (
                <p className="editor-muted">{t('noCaptions')}</p>
              )}
              {timeline.captions.map((caption, index) => (
                <div className="editor-caption" key={index}>
                  <div className="editor-caption-heading">
                    <span>
                      {String(index + 1).padStart(2, '0')} / {t('captionText')}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${t('remove')} ${t('captionText')} ${index + 1}`}
                      onClick={() =>
                        patch(
                          'captions',
                          timeline.captions.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <textarea
                    className="input"
                    aria-label={`${t('captionText')} ${index + 1}`}
                    rows={2}
                    maxLength={500}
                    placeholder={t('captionPlaceholder')}
                    value={caption.text}
                    onChange={(event) =>
                      editCaption(index, 'text', event.target.value)
                    }
                  />
                  <div className="editor-caption-timing">
                    <Field label={t('start')}>
                      <Input
                        type="number"
                        min={0}
                        max={duration}
                        step={0.05}
                        value={caption.startSeconds}
                        onChange={(event) =>
                          editCaption(
                            index,
                            'startSeconds',
                            Number(event.target.value),
                          )
                        }
                      />
                    </Field>
                    <Field label={t('end')}>
                      <Input
                        type="number"
                        min={0}
                        max={duration}
                        step={0.05}
                        value={caption.endSeconds}
                        onChange={(event) =>
                          editCaption(
                            index,
                            'endSeconds',
                            Number(event.target.value),
                          )
                        }
                      />
                    </Field>
                    <Field label={t('position')}>
                      <Select
                        value={caption.position}
                        onChange={(event) =>
                          editCaption(
                            index,
                            'position',
                            event.target.value as EditorCaption['position'],
                          )
                        }
                      >
                        {(['top', 'center', 'bottom'] as const).map(
                          (position) => (
                            <option value={position} key={position}>
                              {t(position)}
                            </option>
                          ),
                        )}
                      </Select>
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !timeline.clips.length || timeline.captions.length >= 40
                }
                onClick={() =>
                  patch('captions', [
                    ...timeline.captions,
                    {
                      text: '',
                      startSeconds: 0,
                      endSeconds:
                        Math.round(Math.min(3, duration) * 1000) / 1000,
                      position: 'bottom',
                    },
                  ])
                }
              >
                <Plus size={14} />
                {t('addCaption')}
              </Button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <Music2 size={17} />
                {t('sound')}
              </h2>
            </div>
            <div className="panel-body">
              <Field label={t('music')}>
                <Select
                  value={timeline.musicMediaId || ''}
                  onChange={(event) => {
                    patch('musicMediaId', event.target.value || null);
                    setRights(false);
                  }}
                >
                  <option value="">{t('noMusic')}</option>
                  {music.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <button
                className="text-link editor-import-music"
                onClick={() => musicUpload.current?.click()}
              >
                <UploadCloud size={14} />
                {t('importMusic')}
              </button>
              <p className="field-hint">{t('originalAudio')}</p>
              {timeline.musicMediaId && (
                <>
                  <Field
                    label={`${t('volume')} · ${Math.round(timeline.musicVolume * 100)}%`}
                  >
                    <input
                      className="editor-range"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={timeline.musicVolume}
                      onChange={(event) =>
                        patch('musicVolume', Number(event.target.value))
                      }
                    />
                  </Field>
                  <label className="editor-rights">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(event) => {
                        setRights(event.target.checked);
                        if (projectId)
                          drafts.current.set(projectId, {
                            timeline,
                            saved,
                            rights: event.target.checked,
                          });
                      }}
                    />
                    <span>
                      {t('rights')}
                      <small>{t('rightsHelp')}</small>
                    </span>
                  </label>
                </>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <SlidersHorizontal size={17} />
                {t('output')}
              </h2>
            </div>
            <div className="panel-body">
              <div className="field-pair">
                <Field label={t('format')}>
                  <Select
                    value={timeline.format}
                    onChange={(event) =>
                      patch(
                        'format',
                        event.target.value as EditorTimeline['format'],
                      )
                    }
                  >
                    {['9:16', '4:5', '1:1', '16:9'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('resolution')}>
                  <Select
                    value={timeline.resolution}
                    onChange={(event) =>
                      patch(
                        'resolution',
                        Number(
                          event.target.value,
                        ) as EditorTimeline['resolution'],
                      )
                    }
                  >
                    {[720, 1080, 1440, 2160].map((value) => (
                      <option key={value} value={value}>
                        {value === 2160 ? '4K · 2160p' : `${value}p`}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={t('codec')}>
                <Select
                  value={timeline.codec}
                  onChange={(event) =>
                    patch(
                      'codec',
                      event.target.value as EditorTimeline['codec'],
                    )
                  }
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265 / HEVC</option>
                </Select>
              </Field>
              <Field label={t('quality')} hint={t('qualityHelp')}>
                <Select
                  value={timeline.quality}
                  onChange={(event) =>
                    patch('quality', Number(event.target.value))
                  }
                >
                  <option value={18}>{t('qualityHigh')}</option>
                  <option value={21}>{t('qualityBalanced')}</option>
                  <option value={28}>{t('qualitySmall')}</option>
                </Select>
              </Field>
              <Field label={t('logo')}>
                <Select
                  value={timeline.logoId || ''}
                  onChange={(event) =>
                    patch('logoId', event.target.value || null)
                  }
                >
                  <option value="">{t('noLogo')}</option>
                  {logos.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {timeline.logoId && (
                <>
                  <div className="field-pair">
                    <Field label={t('logoSize')}>
                      <Input
                        type="number"
                        min={3}
                        max={50}
                        value={timeline.logoSize}
                        onChange={(event) =>
                          patch('logoSize', Number(event.target.value))
                        }
                      />
                    </Field>
                    <Field label={t('logoOpacity')}>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={timeline.logoOpacity}
                        onChange={(event) =>
                          patch('logoOpacity', Number(event.target.value))
                        }
                      />
                    </Field>
                  </div>
                  <Field label={t('logoPosition')}>
                    <Select
                      value={timeline.logoPosition}
                      onChange={(event) =>
                        patch(
                          'logoPosition',
                          event.target.value as EditorTimeline['logoPosition'],
                        )
                      }
                    >
                      {positionOptions.map((item) => (
                        <option value={item.value} key={item.value}>
                          {t(item.label)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('logoTiming')} hint={t('logoTimingHelp')}>
                    <Select
                      value={timeline.logoTiming}
                      onChange={(event) =>
                        patch(
                          'logoTiming',
                          event.target.value as EditorTimeline['logoTiming'],
                        )
                      }
                    >
                      <option value="all">{t('logoAll')}</option>
                      <option value="start">{t('logoStart')}</option>
                      <option value="end">{t('logoEnd')}</option>
                    </Select>
                  </Field>
                  <label className="editor-checkbox">
                    <input
                      type="checkbox"
                      checked={timeline.logoFade}
                      onChange={(event) =>
                        patch('logoFade', event.target.checked)
                      }
                    />
                    {t('logoFade')}
                  </label>
                </>
              )}
            </div>
          </section>
        </fieldset>
        <aside className="editor-preview-column">
          <section className="panel editor-preview">
            <div className="panel-heading">
              <h2>
                <Clapperboard size={17} />
                {t('preview')}
              </h2>
              <Badge tone="brand">{timeline.format}</Badge>
            </div>
            <div className="editor-preview-tabs">
              <button
                className={cn(previewKind === 'source' && 'active')}
                onClick={() => setPreviewKind('source')}
                disabled={!source}
              >
                {t('sourcePreview')}
              </button>
              <button
                className={cn(previewKind === 'composition' && 'active')}
                onClick={() => setPreviewKind('composition')}
                disabled={!previewJob}
              >
                {t('compositionPreview')}
              </button>
              <button
                className={cn(previewKind === 'output' && 'active')}
                onClick={() => setPreviewKind('output')}
                disabled={!outputJob}
              >
                {t('outputPreview')}
              </button>
            </div>
            <div className="editor-preview-stage">
              {previewUrl ? (
                <video
                  key={previewUrl + previewKind + clipIndex}
                  src={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={
                    previewKind !== 'source' && coverId
                      ? `/api/media/${coverId}`
                      : undefined
                  }
                  onError={() => setVideoFailed(true)}
                  onLoadedMetadata={(event) => {
                    if (previewKind === 'source' && selectedClip)
                      event.currentTarget.currentTime =
                        selectedClip.startSeconds;
                  }}
                  onTimeUpdate={(event) => {
                    if (
                      previewKind === 'source' &&
                      selectedClip &&
                      event.currentTarget.currentTime >
                        selectedClip.endSeconds + 0.05 &&
                      !event.currentTarget.paused
                    ) {
                      event.currentTarget.pause();
                      event.currentTarget.currentTime =
                        selectedClip.startSeconds;
                    }
                  }}
                />
              ) : (
                <div className="editor-preview-placeholder">
                  <span>
                    <Play size={35} strokeWidth={1} />
                  </span>
                  <p>{t('noPreview')}</p>
                  <small>YASSDEM AI STUDIO</small>
                </div>
              )}
            </div>
            <div className="panel-body">
              <p className={cn('field-hint', videoFailed && 'editor-error')}>
                {t(videoFailed ? 'previewError' : 'previewHelp')}
              </p>
              {previewKind === 'composition' &&
                previewJob &&
                !previewMatchesDraft && (
                  <p className="inline-notice">{t('previewStale')}</p>
                )}
              {previewKind === 'composition' && (
                <p className="field-hint">{t('previewQuality')}</p>
              )}
              <div className="editor-export-stats">
                <div>
                  <span>{t('duration')}</span>
                  <strong>
                    {duration.toFixed(2)} <small>{t('seconds')}</small>
                  </strong>
                </div>
                <div>
                  <span>
                    {t(
                      previewKind === 'composition'
                        ? 'previewResolution'
                        : 'resolution',
                    )}
                  </span>
                  <strong>
                    {previewKind === 'composition'
                      ? '360p'
                      : timeline.resolution === 2160
                        ? '4K'
                        : `${timeline.resolution}p`}
                  </strong>
                </div>
                <div>
                  <span>MP4</span>
                  <strong>
                    {previewKind !== 'composition' && timeline.codec === 'h265'
                      ? 'H.265'
                      : 'H.264'}
                  </strong>
                </div>
              </div>
              <Button
                variant="secondary"
                className="editor-export-button"
                disabled={
                  !!busy ||
                  loading ||
                  loadFailed ||
                  !timeline.clips.length ||
                  (Boolean(timeline.musicMediaId) && !rights)
                }
                onClick={() => void act('preview', () => render('preview'))}
              >
                {busy === 'preview' ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Play size={16} />
                )}
                {t('renderPreview')}
              </Button>
              <p className="field-hint">{t('previewQuality')}</p>
              <Button
                className="editor-export-button"
                disabled={
                  !!busy ||
                  loading ||
                  loadFailed ||
                  !timeline.clips.length ||
                  (Boolean(timeline.musicMediaId) && !rights)
                }
                onClick={() => void act('render', () => render())}
              >
                {busy === 'render' ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <ArrowDownToLine size={16} />
                )}{' '}
                {t('render')}
              </Button>
              <p className="editor-export-note">
                <ShieldCheck size={12} />
                {t('renderHelp')}
              </p>
            </div>
          </section>
          <section className="panel editor-history">
            <div className="panel-heading">
              <h2>
                <Film size={17} />
                {t('history')}
              </h2>
              <Badge>{projectJobs.length}</Badge>
            </div>
            <div className="panel-body">
              {!projectJobs.length ? (
                <p className="editor-muted">{t('noExports')}</p>
              ) : (
                projectJobs.slice(0, 8).map((job) => {
                  const jobCover =
                    typeof job.parameters.coverMediaId === 'string'
                      ? job.parameters.coverMediaId
                      : null;
                  return (
                    <article
                      className={cn(
                        'editor-job',
                        job.status === 'FAILED' && 'is-failed',
                      )}
                      key={job.id}
                    >
                      <div className="editor-job-row">
                        <span
                          className={cn(
                            'editor-job-icon',
                            job.status === 'SUCCEEDED' && 'is-complete',
                          )}
                        >
                          {ACTIVE.includes(job.status) ? (
                            <LoaderCircle size={17} className="spin" />
                          ) : job.status === 'SUCCEEDED' ? (
                            <CheckCircle2 size={17} />
                          ) : (
                            <Film size={17} />
                          )}
                        </span>
                        <div>
                          <strong>
                            {job.kind === 'edit-preview'
                              ? `${t('compositionPreview')} · `
                              : ''}
                            {t(statusKey(job.status))}
                          </strong>
                          <small>
                            {new Intl.DateTimeFormat(
                              locale === 'fr' ? 'fr-FR' : 'en-GB',
                              { dateStyle: 'short', timeStyle: 'short' },
                            ).format(new Date(job.createdAt))}
                          </small>
                        </div>
                        {ACTIVE.includes(job.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!!busy}
                            onClick={() =>
                              void act('cancel', async () => {
                                const result = await request(
                                  `/api/jobs/${job.id}`,
                                  'DELETE',
                                );
                                setLocalJobs((previous) => [
                                  result.job,
                                  ...previous.filter(
                                    (item) => item.id !== job.id,
                                  ),
                                ]);
                                notify(t('cancelledNotice'));
                                onRefreshRef.current().catch(() => {});
                              })
                            }
                          >
                            {t('cancel')}
                          </Button>
                        )}
                      </div>
                      {ACTIVE.includes(job.status) && (
                        <div
                          className="editor-progress"
                          role="progressbar"
                          aria-label={t('processing')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={job.progress}
                        >
                          <span
                            style={{
                              width: `${Math.max(2, Math.min(100, job.progress))}%`,
                            }}
                          />
                        </div>
                      )}
                      {job.status === 'FAILED' && (
                        <p className="editor-error">
                          {errorMessage(
                            job.errorCode || 'EDITOR_RENDER_FAILED',
                          )}
                        </p>
                      )}
                      {job.outputMediaId && job.status === 'SUCCEEDED' && (
                        <>
                          <button
                            className="editor-output-thumb"
                            onClick={() => {
                              setSelectedJobId(job.id);
                              setPreviewKind(
                                job.kind === 'edit-preview'
                                  ? 'composition'
                                  : 'output',
                              );
                            }}
                          >
                            {jobCover ? (
                              <img
                                src={`/api/media/${jobCover}`}
                                alt={t('cover')}
                              />
                            ) : (
                              <Film size={28} />
                            )}
                            <span>
                              <Play size={19} />
                            </span>
                          </button>
                          <div className="editor-downloads">
                            <a
                              href={`/api/media/${job.outputMediaId}`}
                              download={`yassdem-${job.id}.mp4`}
                            >
                              <ArrowDownToLine size={13} />
                              {t(
                                job.kind === 'edit-preview'
                                  ? 'downloadPreview'
                                  : 'download',
                              )}
                            </a>
                            {jobCover && (
                              <a
                                href={`/api/media/${jobCover}`}
                                download={`yassdem-${job.id}-cover.jpg`}
                              >
                                <ImageIcon size={13} />
                                {t('downloadCover')}
                              </a>
                            )}
                          </div>
                        </>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </aside>
      </div>
      {notice && (
        <div
          className={cn('toast', notice.error && 'toast-error')}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.error ? <X size={17} /> : <CheckCircle2 size={17} />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label={t('close')}>
            <X size={15} />
          </button>
        </div>
      )}
      {picker && (
        <Dialog
          title={t('library')}
          closeLabel={t('close')}
          onClose={() => setPicker(false)}
        >
          <div className="editor-media-picker">
            {!videos.length ? (
              <p className="editor-muted">{t('noVideos')}</p>
            ) : (
              videos.map((item) => (
                <button
                  key={item.id}
                  disabled={!!busy}
                  onClick={() => addClip(item)}
                >
                  <span>
                    <Film size={25} strokeWidth={1} />
                  </span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.duration
                        ? `${item.duration.toFixed(1)} ${t('seconds')}`
                        : 'MP4'}
                    </small>
                  </div>
                  <Plus size={16} />
                </button>
              ))
            )}
          </div>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setPicker(false)}>
              {t('close')}
            </Button>
            <Button
              onClick={() => {
                setPicker(false);
                videoUpload.current?.click();
              }}
            >
              <UploadCloud size={15} />
              {t('import')}
            </Button>
          </div>
        </Dialog>
      )}
      {newProject && (
        <Dialog
          title={t('newProject')}
          closeLabel={t('close')}
          onClose={() => setNewProject(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act('project', async () => {
                await createProject(projectName.trim(), true);
                setNewProject(false);
                notify(t('projectCreated'));
              });
            }}
          >
            <Field label={t('projectName')}>
              <Input
                autoFocus
                required
                maxLength={150}
                placeholder={t('projectPlaceholder')}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </Field>
            <div className="dialog-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setNewProject(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!!busy || !projectName.trim()}>
                {busy === 'project' ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Plus size={15} />
                )}{' '}
                {t('create')}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
