'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  ImagePlus,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Shirt,
  UploadCloud,
} from 'lucide-react';
import { Button, cn } from './ui/primitives';
import { quickCreateMessages } from '@/messages/quick-create';
import './quick-create.css';

export type QuickMedia = {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  url: string;
};
export type QuickProject = {
  id: string;
  name: string;
  description: string;
  type: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export type QuickJob = {
  id: string;
  projectId: string;
  sourceMediaId: string;
  provider: string;
  status: string;
  kind: string;
  progress: number;
  outputMediaId?: string;
  outputUrl?: string;
  estimatedCostCents: number;
  actualCostCents?: number;
  parameters: Record<string, unknown>;
  errorCode?: string;
  createdAt: string;
};
export type QuickCreateQueued = {
  project: QuickProject;
  job: QuickJob;
  lookId?: string;
};
type Action = 'video' | 'model';
type Props = {
  locale: 'fr' | 'en';
  media: QuickMedia[];
  jobs: QuickJob[];
  settings: {
    activeLogoId: string | null;
    logoSize: number;
    logoOpacity: number;
    logoPosition: string;
  };
  onReload: () => Promise<unknown>;
  onQueued: (result: QuickCreateQueued) => void;
  onOpenProject: (id: string) => void;
  onConfigure: () => void;
};
const activeStatuses = [
  'QUEUED',
  'PROCESSING',
  'SUBMITTING',
  'RUNNING',
  'EXPORTING',
];
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
class QuickError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function request<T>(
  url: string,
  body?: FormData | Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? 'POST' : 'GET',
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
    throw new QuickError('NETWORK');
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new QuickError('NETWORK');
  }
  if (!response.ok) throw new QuickError(result.error?.code || 'UNKNOWN');
  return result as T;
}

export function QuickCreatePanel({
  locale,
  media,
  jobs,
  settings,
  onReload,
  onQueued,
  onOpenProject,
  onConfigure,
}: Props) {
  const t = quickCreateMessages[locale];
  const [sourceId, setSourceId] = useState('');
  const [imported, setImported] = useState<QuickMedia | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState<'upload' | 'photo' | Action | ''>('');
  const [dragging, setDragging] = useState(false);
  const [errorKey, setErrorKey] = useState<keyof typeof t | ''>('');
  const [notice, setNotice] = useState<keyof typeof t | ''>('');
  const [queued, setQueued] = useState<QuickCreateQueued | null>(null);
  const [photo, setPhoto] = useState<QuickMedia | null>(null);
  const [capability, setCapability] = useState<{
    available: boolean;
    code?: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const submission = useRef<{
    sourceId: string;
    action: Action;
    key: string;
  } | null>(null);
  const source =
    media.find((item) => item.id === sourceId) ||
    (imported?.id === sourceId ? imported : null);
  const sources = media.filter(
    (item) => item.role === 'SOURCE' && imageTypes.includes(item.mimeType),
  );
  const job = queued
    ? jobs.find((item) => item.id === queued.job.id) || queued.job
    : null;
  const active = Boolean(job && activeStatuses.includes(job.status));
  const locked = Boolean(busy) || active;
  const completed = job?.status === 'SUCCEEDED';
  const output =
    photo?.url ||
    (completed
      ? job.outputUrl ||
        (job.outputMediaId ? `/api/media/${job.outputMediaId}` : '')
      : '');
  const video = !photo && job?.kind === 'generation';
  const failed = Boolean(
    job && ['FAILED', 'CANCELLED', 'UNKNOWN'].includes(job.status),
  );
  const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0));

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    if (job && !activeStatuses.includes(job.status)) lock.current = false;
  }, [job?.status, job?.id]);
  async function checkCapability() {
    setChecking(true);
    try {
      const result = await request<{
        model: { available: boolean; code?: string };
      }>('/api/quick-create');
      setCapability(result.model);
    } catch {
      setCapability({ available: false, code: 'CAPABILITY_UNAVAILABLE' });
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void checkCapability();
  }, []);

  function errorFor(error: unknown, photoAction = false): keyof typeof t {
    const code = error instanceof QuickError ? error.code : 'UNKNOWN';
    if (code === 'NETWORK') return photoAction ? 'photoNetwork' : 'network';
    if (/UNAUTH|SESSION|AUTH_REQUIRED/.test(code)) return 'auth';
    if (code === 'INVALID_ORIGIN') return 'origin';
    if (/FFMPEG|FFPROBE|ENCOD/.test(code)) return 'ffmpeg';
    if (/BUSY|CONCURRENT|RATE/.test(code)) return 'busy';
    if (/COMFYUI.*WORKFLOW_REQUIRED/.test(code)) return 'modelMissing';
    if (/COMFYUI/.test(code))
      return /WORKFLOW|PORTRAIT|GARMENT|SLOT/.test(code)
        ? 'modelWorkflow'
        : 'modelUnavailable';
    if (/SOURCE|IMAGE|MEDIA|FILE|UPLOAD/.test(code)) return 'invalidPhoto';
    return 'genericError';
  }
  function selectSource(id: string, uploaded?: QuickMedia) {
    setSourceId(id);
    if (uploaded) setImported(uploaded);
    setQueued(null);
    setPhoto(null);
    setErrorKey('');
    setNotice('');
    submission.current = null;
  }
  async function upload(files: FileList | File[]) {
    if (locked || lock.current) return;
    if (files.length !== 1) {
      setErrorKey('chooseOne');
      return;
    }
    const file = files[0];
    if (
      !imageTypes.includes(file.type) ||
      !file.size ||
      file.size > 5 * 1024 * 1024
    ) {
      setErrorKey('invalidFile');
      return;
    }
    lock.current = true;
    setBusy('upload');
    setErrorKey('');
    setNotice('');
    setPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('role', 'SOURCE');
      const result = await request<{ media: QuickMedia }>('/api/media', form);
      selectSource(result.media.id, result.media);
      void onReload().catch(() => setNotice('refreshFailed'));
    } catch (error) {
      setErrorKey(errorFor(error));
    } finally {
      setPreview('');
      setBusy('');
      lock.current = false;
    }
  }
  async function create(action: Action) {
    if (locked || lock.current || !source) return;
    if (action === 'model' && !capability?.available) return;
    lock.current = true;
    setBusy(action);
    setErrorKey('');
    setNotice('');
    setPhoto(null);
    setQueued(null);
    if (
      !submission.current ||
      submission.current.sourceId !== source.id ||
      submission.current.action !== action
    ) {
      submission.current = {
        sourceId: source.id,
        action,
        key: crypto.randomUUID(),
      };
    }
    let accepted = false;
    try {
      const result = await request<QuickCreateQueued>('/api/quick-create', {
        sourceMediaId: source.id,
        action,
        idempotencyKey: submission.current.key,
        locale,
      });
      // Keep the acknowledgement even when the following refresh fails.
      accepted = true;
      setQueued(result);
      submission.current = null;
      onQueued(result);
      void onReload().catch(() => setNotice('refreshFailed'));
    } catch (error) {
      setErrorKey(errorFor(error));
      if (error instanceof QuickError && /COMFYUI/.test(error.code)) {
        setCapability({ available: false, code: error.code });
      }
    } finally {
      setBusy('');
      if (!accepted) lock.current = false;
    }
  }
  async function preparePhoto() {
    if (locked || lock.current || !source) return;
    lock.current = true;
    setBusy('photo');
    setErrorKey('');
    setNotice('');
    try {
      const result = await request<{ media: QuickMedia }>(
        `/api/media/${source.id}/export`,
        {
          format: 'png',
          resolution: 'native',
          ratio: '4:5',
          quality: 90,
          logoId: settings.activeLogoId,
          logoSize: settings.logoSize,
          logoOpacity: settings.logoOpacity,
          logoPosition: settings.logoPosition,
        },
      );
      setPhoto(result.media);
      setQueued(null);
      void onReload().catch(() => setNotice('refreshFailed'));
    } catch (error) {
      setErrorKey(errorFor(error, true));
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  const modelReason =
    !capability ||
    !capability.code ||
    /NOT_CONFIGURED|WORKFLOW_MISSING|WORKFLOW_REQUIRED/.test(capability.code)
      ? t.modelMissing
      : /WORKFLOW|PORTRAIT|GARMENT|SLOT/.test(capability.code)
        ? t.modelWorkflow
        : t.modelUnavailable;

  return (
    <section className="quick-create" aria-labelledby="quick-create-title">
      <div className="quick-create-heading">
        <span className="eyebrow">
          <span className="eyebrow-line" />
          {t.eyebrow}
        </span>
        <h2 id="quick-create-title">{t.title}</h2>
        <p>{t.description}</p>
      </div>
      <div className="quick-create-layout">
        <div className="quick-photo-column">
          <h3 className="quick-step">
            <span>1</span>
            {t.stepPhoto}
          </h3>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={t.importPhoto}
            hidden
            disabled={locked}
            onChange={(event) => {
              if (event.target.files?.length) void upload(event.target.files);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            className={cn(
              'quick-photo-drop',
              dragging && 'is-dragging',
              (source || preview) && 'has-photo',
            )}
            disabled={locked}
            aria-label={source ? t.replacePhoto : t.importPhoto}
            onClick={() => input.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              if (!locked) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!locked) void upload(event.dataTransfer.files);
            }}
          >
            {source || preview ? (
              <>
                <img
                  src={preview || source?.url}
                  alt={source?.name || t.importing}
                />
                <span className="quick-photo-overlay">
                  <ImagePlus size={16} />
                  {busy === 'upload' ? t.importing : t.replacePhoto}
                </span>
              </>
            ) : (
              <>
                <span className="quick-upload-icon">
                  <UploadCloud size={30} strokeWidth={1.5} />
                </span>
                <strong>{t.dropPhoto}</strong>
                <span>{t.fileHint}</span>
                <span className="quick-upload-label">
                  <ImagePlus size={16} />
                  {t.importPhoto}
                </span>
              </>
            )}
            {busy === 'upload' && (
              <span className="quick-upload-busy">
                <LoaderCircle className="quick-spin" size={25} />
                <span>{t.importing}</span>
              </span>
            )}
          </button>
          {source && (
            <p className="quick-photo-name">
              <CheckCircle2 size={15} />
              <span>{source.name}</span>
            </p>
          )}
          {sources.length > 0 && (
            <details className="quick-library">
              <summary>{t.library}</summary>
              <label>
                <span className="sr-only">{t.selectPhoto}</span>
                <select
                  className="input select"
                  value={
                    sources.some((item) => item.id === sourceId) ? sourceId : ''
                  }
                  disabled={locked}
                  onChange={(event) => selectSource(event.target.value)}
                >
                  <option value="">{t.selectPhoto}</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          )}
        </div>
        <div className="quick-actions-column">
          <h3 className="quick-step">
            <span>2</span>
            {t.stepResult}
          </h3>
          <div className="quick-actions-grid">
            <button
              type="button"
              className="quick-action quick-action-video"
              onClick={() => void create('video')}
              disabled={!source || locked}
            >
              <span className="quick-action-icon">
                <Clapperboard size={23} />
              </span>
              <span className="quick-action-copy">
                <strong>
                  {busy === 'video' || (active && video)
                    ? t.working
                    : t.videoTitle}
                </strong>
                <span>{t.videoDescription}</span>
                <small>{t.videoTag}</small>
              </span>
              {busy === 'video' ? (
                <LoaderCircle className="quick-spin" size={19} />
              ) : (
                <ArrowRight className="quick-action-arrow" size={19} />
              )}
            </button>
            <button
              type="button"
              className="quick-action"
              onClick={() => void preparePhoto()}
              disabled={!source || locked}
            >
              <span className="quick-action-icon">
                <ImageIcon size={23} />
              </span>
              <span className="quick-action-copy">
                <strong>{busy === 'photo' ? t.working : t.photoTitle}</strong>
                <span>{t.photoDescription}</span>
                <small>{t.photoTag}</small>
              </span>
              {busy === 'photo' ? (
                <LoaderCircle className="quick-spin" size={19} />
              ) : (
                <ArrowRight className="quick-action-arrow" size={19} />
              )}
            </button>
            <div className="quick-model-option">
              <button
                type="button"
                className="quick-action"
                onClick={() => void create('model')}
                disabled={
                  !source || locked || !capability?.available || checking
                }
              >
                <span className="quick-action-icon">
                  <Shirt size={23} />
                </span>
                <span className="quick-action-copy">
                  <strong>
                    {busy === 'model' || (active && !video)
                      ? t.working
                      : t.modelTitle}
                  </strong>
                  <span>{t.modelDescription}</span>
                  <small>
                    {capability?.available ? t.modelReadyTag : t.modelTag}
                  </small>
                </span>
                {busy === 'model' ? (
                  <LoaderCircle className="quick-spin" size={19} />
                ) : (
                  <ArrowRight className="quick-action-arrow" size={19} />
                )}
              </button>
              {!capability?.available && (
                <div className="quick-model-setup">
                  <p>{checking ? t.checking : modelReason}</p>
                  <div>
                    <button
                      type="button"
                      onClick={onConfigure}
                      disabled={locked}
                    >
                      <Settings2 size={13} />
                      {t.configureModel}
                    </button>
                    <button
                      type="button"
                      onClick={() => void checkCapability()}
                      disabled={checking || locked}
                    >
                      <RefreshCw
                        className={checking ? 'quick-spin' : ''}
                        size={13}
                      />
                      {t.recheck}
                    </button>
                  </div>
                </div>
              )}
              {capability?.available && (
                <p className="quick-model-note">{t.modelNote}</p>
              )}
            </div>
          </div>
          <p className="quick-automatic">
            {source ? t.automatic : t.pickFirst}
          </p>
        </div>
      </div>
      {errorKey && (
        <div className="quick-message quick-message-error" role="alert">
          {t[errorKey]}
        </div>
      )}
      {notice && (
        <p className="quick-message" role="status">
          {t[notice]}
        </p>
      )}
      {(active || busy === 'photo') && (
        <div className="quick-progress" role="status" aria-live="polite">
          <LoaderCircle className="quick-spin" size={21} />
          <div>
            <strong>
              {busy === 'photo'
                ? t.preparingPhoto
                : job?.status === 'QUEUED'
                  ? t.queued
                  : t.processing}
            </strong>
            <progress
              max={100}
              value={busy === 'photo' || !progress ? undefined : progress}
              aria-label={t.working}
            />
          </div>
        </div>
      )}
      {failed && (
        <div className="quick-message quick-message-error" role="alert">
          <p>
            {job?.status === 'CANCELLED'
              ? t.cancelled
              : job?.status === 'UNKNOWN'
                ? t.unknown
                : t.failed}
          </p>
          {queued && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenProject(queued.project.id)}
            >
              {t.customize}
              <ArrowRight size={15} />
            </Button>
          )}
        </div>
      )}
      {(photo || completed) && (
        <div className="quick-result" aria-label={t.result}>
          <div className="quick-result-preview">
            {output ? (
              video ? (
                <video
                  src={output}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={t.result}
                />
              ) : (
                <img src={output} alt={photo?.name || t.result} />
              )
            ) : (
              <p>{t.noResult}</p>
            )}
          </div>
          <div className="quick-result-copy">
            <span className="quick-ready">
              <CheckCircle2 size={18} />
              {t.done}
            </span>
            <h3>{photo?.name || queued?.project.name}</h3>
            <div className="quick-result-buttons">
              {output && (
                <a
                  href={`${output}${output.includes('?') ? '&' : '?'}download=1`}
                  download
                  className="button button-primary button-md"
                >
                  <ArrowDownToLine size={17} />
                  {video ? t.downloadVideo : t.downloadPhoto}
                </a>
              )}
              {queued && (
                <Button
                  variant="secondary"
                  onClick={() => onOpenProject(queued.project.id)}
                >
                  <Settings2 size={16} />
                  {t.customize}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
