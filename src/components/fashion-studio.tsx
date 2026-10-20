'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  FolderOpen,
  ImagePlus,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Palette,
  Plus,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  UsersRound,
  WandSparkles,
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
import { fashionMessages, type FashionMessageKey } from '@/messages/fashion';
import './fashion.css';
export type FashionProject = {
  id: string;
  name: string;
  type: string;
  description?: string;
  parameters?: Record<string, unknown>;
};
export type FashionMedia = {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  url: string;
  width?: number | null;
  height?: number | null;
  size?: number;
  projectId?: string | null;
};
export type FashionJob = {
  id: string;
  projectId: string;
  kind: string;
  status: string;
  progress: number;
  parameters: Record<string, unknown>;
  outputMediaId?: string | null;
  errorCode?: string | null;
  createdAt: string;
};
type ModelParameters = {
  skinTone: string;
  bodyType: string;
  heightCm: number;
  hair: string;
  hijab: boolean;
  pose: string;
};
type Mannequin = {
  id: string;
  name: string;
  description: string;
  parameters: ModelParameters;
  referenceMediaId: string | null;
  createdAt: string;
  updatedAt: string;
};
type LookParameters = {
  styles: string[];
  fit: 'regular' | 'fitted' | 'relaxed' | 'oversized' | 'custom';
  colors: string[];
  accessories: string[];
  coverage: string;
  mood: string;
  prompt: string;
};
type Look = {
  id: string;
  name: string;
  projectId: string;
  mannequinId: string | null;
  garmentMediaIds: string[];
  parameters: LookParameters;
  outputMediaId: string | null;
  mannequin: Mannequin | null;
  sourceMedia: FashionMedia[];
  outputMedia: FashionMedia | null;
  createdAt: string;
  updatedAt: string;
};
type ComfyStatus = {
  connected: boolean;
  code?: string;
  fashionImage: {
    configured: boolean;
    code?: string;
    garmentSlots?: number | 'array';
    requiresPortrait?: boolean;
  };
  tryOn: {
    configured: boolean;
    code?: string;
    garmentSlots?: number | 'array';
    requiresPortrait?: boolean;
  };
};
type RenderMode = 'collage' | 'fashion-image' | 'try-on';
type ModelForm = {
  id?: string;
  name: string;
  description: string;
  referenceMediaId: string | null;
  parameters: ModelParameters;
};
type Props = {
  locale: 'fr' | 'en';
  defaultStyles?: string[];
  defaultHijab?: boolean;
  view: 'fashion' | 'lookbook';
  projects: FashionProject[];
  media: FashionMedia[];
  jobs: FashionJob[];
  initialProjectId?: string;
  onRefresh: () => Promise<unknown>;
  onAnimate?: (mediaId: string, projectId: string) => void;
};
const ACTIVE = ['QUEUED', 'RUNNING', 'SUBMITTING', 'PROCESSING', 'EXPORTING'];
const STYLE_OPTIONS = [
  'Modest Fashion',
  'Casual Chic',
  'Streetwear',
  'Minimalist',
  'Luxury / Elegant',
  'Business / Office',
  'Edgy / Grunge',
  'Bohemian',
  'Vintage / Retro',
  'Colorful & Funky',
  'Sporty Chic',
  'Avant-Garde',
  'Editorial / High Fashion',
];
const DEFAULT_LOOK: LookParameters = {
  styles: [],
  fit: 'regular',
  colors: [],
  accessories: [],
  coverage: '',
  mood: '',
  prompt: '',
};
const emptyModel = (): ModelForm => ({
  name: '',
  description: '',
  referenceMediaId: null,
  parameters: {
    skinTone: '',
    bodyType: '',
    heightCm: 170,
    hair: '',
    hijab: false,
    pose: '',
  },
});
class FashionError extends Error {
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
    if (!response.ok) throw new FashionError(data.error?.code || 'UNKNOWN');
    return data;
  } catch (error) {
    if (error instanceof FashionError) throw error;
    throw new FashionError('NETWORK');
  }
}
const listFromText = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
];
export function FashionStudio({
  locale,
  defaultStyles = [],
  defaultHijab = false,
  view,
  projects,
  media,
  jobs,
  initialProjectId,
  onRefresh,
  onAnimate,
}: Props) {
  const text = fashionMessages[locale];
  const t = (key: FashionMessageKey) => text[key];
  const [tab, setTab] = useState(
    view === 'lookbook' ? 'collection' : 'compose',
  );
  const [projectId, setProjectId] = useState(
    projects.some(
      (project) =>
        project.id === initialProjectId &&
        ['fashion', 'lookbook'].includes(project.type),
    )
      ? initialProjectId || ''
      : '',
  );
  const [models, setModels] = useState<Mannequin[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  const [extraMedia, setExtraMedia] = useState<FashionMedia[]>([]);
  const [localJobs, setLocalJobs] = useState<FashionJob[]>([]);
  const [comfy, setComfy] = useState<ComfyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);
  const [dialogId, setDialogId] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [lookId, setLookId] = useState('');
  const [name, setName] = useState('');
  const [mannequinId, setMannequinId] = useState('');
  const [garmentIds, setGarmentIds] = useState<string[]>([]);
  const [parameters, setParameters] = useState<LookParameters>({
    ...DEFAULT_LOOK,
    styles: [...defaultStyles],
  });
  const [colorsText, setColorsText] = useState('');
  const [accessoriesText, setAccessoriesText] = useState('');
  const [customStyle, setCustomStyle] = useState('');
  const [mode, setMode] = useState<RenderMode>('collage');
  const [modelForm, setModelForm] = useState<ModelForm>(() => {
    const model = emptyModel();
    model.parameters.hijab = defaultHijab;
    return model;
  });
  const [pickerIds, setPickerIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<'garments' | 'portrait'>(
    'garments',
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const renderRequestRef = useRef<{
    fingerprint: string;
    key: string;
    lookId: string;
  } | null>(null);
  const collections = projects.filter((project) =>
    ['fashion', 'lookbook'].includes(project.type),
  );
  const collection = collections.find((project) => project.id === projectId);
  const allMedia = useMemo(
    () => [
      ...new Map(
        [
          ...media,
          ...extraMedia,
          ...looks.flatMap((look) => [
            ...look.sourceMedia,
            ...(look.outputMedia ? [look.outputMedia] : []),
          ]),
        ].map((item) => [item.id, item]),
      ).values(),
    ],
    [media, extraMedia, looks],
  );
  const wardrobe = allMedia.filter(
    (item) => item.mimeType.startsWith('image/') && item.role === 'SOURCE',
  );
  const portraits = allMedia.filter(
    (item) => item.mimeType.startsWith('image/') && item.role !== 'LOGO',
  );
  const selectedMedia = garmentIds.flatMap((id) => {
    const item = allMedia.find((media) => media.id === id);
    return item ? [item] : [];
  });
  const selectedModel = models.find((item) => item.id === mannequinId);
  const selectedLook = looks.find((item) => item.id === lookId);
  const collectionLooks = looks.filter((item) => item.projectId === projectId);
  const combinedJobs = useMemo(
    () =>
      [...new Map([...localJobs, ...jobs].map((job) => [job.id, job])).values()]
        .filter((job) =>
          ['fashion_image', 'lookbook_sheet', 'try_on'].includes(job.kind),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobs, localJobs],
  );
  const relevantJobs = combinedJobs.filter(
    (job) => job.parameters.lookId === lookId,
  );
  const activeRender = relevantJobs.some((job) => ACTIVE.includes(job.status));
  const anyPending = combinedJobs.some((job) => ACTIVE.includes(job.status));
  const jobFingerprint = combinedJobs
    .map((job) => `${job.id}:${job.status}:${job.outputMediaId}`)
    .join('|');
  const latestOutputJob = combinedJobs.find(
    (job) => job.outputMediaId === selectedLook?.outputMediaId,
  );
  const selectedMode =
    mode === 'fashion-image'
      ? comfy?.fashionImage
      : mode === 'try-on'
        ? comfy?.tryOn
        : undefined;
  const requiredSlots = selectedMode?.garmentSlots;
  const wrongSlots =
    typeof requiredSlots === 'number' && requiredSlots !== garmentIds.length;
  const modeReady =
    mode === 'collage' || !!(comfy?.connected && selectedMode?.configured);
  const missingPortrait =
    (mode === 'try-on' || !!selectedMode?.requiresPortrait) &&
    !selectedModel?.referenceMediaId;
  const draft = () => ({
    name: name.trim(),
    projectId,
    mannequinId: mannequinId || null,
    garmentMediaIds: garmentIds,
    parameters: {
      ...parameters,
      colors: listFromText(colorsText),
      accessories: listFromText(accessoriesText),
    },
  });
  const isDirty = selectedLook
    ? JSON.stringify(draft()) !==
      JSON.stringify({
        name: selectedLook.name,
        projectId: selectedLook.projectId,
        mannequinId: selectedLook.mannequinId,
        garmentMediaIds: selectedLook.garmentMediaIds,
        parameters: selectedLook.parameters,
      })
    : true;
  function errorMessage(error: unknown) {
    const code =
      error instanceof FashionError
        ? error.code
        : typeof error === 'string'
          ? error
          : 'UNKNOWN';
    if (code === 'NETWORK') return t('errorNetwork');
    if (/AUTH_REQUIRED|UNAUTH|SESSION/.test(code)) return t('errorAuth');
    if (code === 'MANNEQUIN_IN_USE') return t('errorModelInUse');
    if (code === 'LOOK_RENDER_ACTIVE') return t('errorRenderActive');
    if (/MEDIA_MISSING|INVALID_FASHION_IMAGE/.test(code))
      return t('errorMissingMedia');
    if (code === 'COMFYUI_UNREACHABLE') return t('errorComfyConnection');
    if (/WORKFLOW|MAPPING/.test(code))
      return t(
        code.includes('MAPPING') ? 'errorComfyMapping' : 'errorComfyWorkflow',
      );
    if (/PORTRAIT/.test(code)) return t('errorComfyPortrait');
    if (/COMFYUI/.test(code)) return t('errorComfyFailed');
    if (/FILE|MIME|UPLOAD|TOO_LARGE/.test(code)) return t('errorFile');
    if (/NOT_FOUND/.test(code)) return t('errorNotFound');
    if (/INVALID|HEIGHT|GARMENTS|PARAMETERS/.test(code))
      return t('errorValidation');
    if (/CANCEL/.test(code)) return t('errorCancelled');
    return t('errorGeneric');
  }
  function notify(message: string, error = false) {
    setNotice({ text: message, error });
  }
  const refreshLocal = useCallback(async () => {
    const results = await Promise.allSettled([
      request('/api/mannequins'),
      request('/api/looks'),
      request('/api/providers/comfyui/status'),
    ]);
    const modelResult = results[0],
      lookResult = results[1],
      providerResult = results[2];
    if (modelResult.status === 'fulfilled')
      setModels(modelResult.value.mannequins);
    if (lookResult.status === 'fulfilled') setLooks(lookResult.value.looks);
    if (providerResult.status === 'fulfilled')
      setComfy(providerResult.value.status || providerResult.value);
    else setComfy(null);
    if (modelResult.status === 'rejected' || lookResult.status === 'rejected') {
      setLoadError(true);
      throw modelResult.status === 'rejected'
        ? modelResult.reason
        : lookResult.status === 'rejected'
          ? lookResult.reason
          : new FashionError('UNKNOWN');
    }
    setLoadError(false);
  }, []);
  useEffect(() => {
    let active = true;
    refreshLocal()
      .catch((error) => {
        if (active) notify(errorMessage(error), true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshLocal]);
  useEffect(() => {
    setTab(view === 'lookbook' ? 'collection' : 'compose');
  }, [view]);
  useEffect(() => {
    if (
      initialProjectId &&
      collections.some((project) => project.id === initialProjectId)
    ) {
      setProjectId(initialProjectId);
      setLookId('');
      setName('');
      setGarmentIds([]);
    }
  }, [initialProjectId]);
  useEffect(() => {
    if (!projectId && collections.length)
      setProjectId(
        collections.find((item) => item.type === view)?.id || collections[0].id,
      );
  }, [projectId, collections.map((item) => item.id).join('|'), view]);
  useEffect(() => {
    if (!anyPending) return;
    const interval = setInterval(() => {
      onRefresh().catch(() => {});
      refreshLocal().catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [anyPending, onRefresh, refreshLocal]);
  useEffect(() => {
    if (jobFingerprint) refreshLocal().catch(() => {});
  }, [jobFingerprint, refreshLocal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function act(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      notify(errorMessage(error), true);
      if (
        error instanceof FashionError &&
        /AUTH_REQUIRED|UNAUTH/.test(error.code)
      )
        onRefresh().catch(() => {});
    } finally {
      setBusy('');
    }
  }
  function changeCollection(id: string) {
    setProjectId(id);
    clearLook();
  }
  function clearLook() {
    setLookId('');
    setName('');
    setMannequinId('');
    setGarmentIds([]);
    setParameters({ ...DEFAULT_LOOK, styles: [...defaultStyles] });
    setColorsText('');
    setAccessoriesText('');
    setMode('collage');
    renderRequestRef.current = null;
  }
  function openLook(look: Look) {
    setProjectId(look.projectId);
    setLookId(look.id);
    setName(look.name);
    setMannequinId(look.mannequinId || '');
    setGarmentIds(look.garmentMediaIds);
    setParameters({ ...DEFAULT_LOOK, ...look.parameters });
    setColorsText(look.parameters.colors.join(', '));
    setAccessoriesText(look.parameters.accessories.join(', '));
    setTab('compose');
    renderRequestRef.current = null;
  }
  function patchParameter<K extends keyof LookParameters>(
    key: K,
    value: LookParameters[K],
  ) {
    setParameters((previous) => ({ ...previous, [key]: value }));
  }
  function toggleStyle(style: string) {
    if (parameters.styles.includes(style))
      patchParameter(
        'styles',
        parameters.styles.filter((item) => item !== style),
      );
    else if (parameters.styles.length < 12)
      patchParameter('styles', [...parameters.styles, style]);
    else notify(t('customStyleLimit'), true);
  }
  function openModel(model?: Mannequin) {
    setModelForm(
      model
        ? {
            id: model.id,
            name: model.name,
            description: model.description,
            referenceMediaId: model.referenceMediaId,
            parameters: { ...model.parameters },
          }
        : {
            ...emptyModel(),
            parameters: { ...emptyModel().parameters, hijab: defaultHijab },
          },
    );
    setDialog('model');
  }
  function patchModel<K extends keyof ModelParameters>(
    key: K,
    value: ModelParameters[K],
  ) {
    setModelForm((previous) => ({
      ...previous,
      parameters: { ...previous.parameters, [key]: value },
    }));
  }
  async function persistLook(announce = true) {
    if (!projectId) throw new FashionError('FASHION_PROJECT_REQUIRED');
    if (!garmentIds.length) throw new FashionError('INVALID_GARMENTS');
    if (!name.trim()) throw new FashionError('INVALID_NAME');
    const body = draft();
    if (
      body.parameters.colors.length > 12 ||
      body.parameters.accessories.length > 12 ||
      body.parameters.styles.length > 12
    )
      throw new FashionError('INVALID_PARAMETERS');
    const result = await request(
      lookId ? `/api/looks/${lookId}` : '/api/looks',
      lookId ? 'PATCH' : 'POST',
      body,
    );
    const look = result.look as Look;
    setLooks((previous) => [
      look,
      ...previous.filter((item) => item.id !== look.id),
    ]);
    setLookId(look.id);
    if (announce) notify(t('lookSaved'));
    onRefresh().catch(() => {});
    return look;
  }
  async function renderLook() {
    if (!modeReady || missingPortrait || wrongSlots) return;
    const fingerprint = JSON.stringify({ draft: draft(), mode });
    let current = renderRequestRef.current;
    if (!current || current.fingerprint !== fingerprint) {
      const saved = await persistLook(false);
      current = { fingerprint, key: crypto.randomUUID(), lookId: saved.id };
      renderRequestRef.current = current;
    }
    const result = await request(
      `/api/looks/${current.lookId}/render`,
      'POST',
      { mode, idempotencyKey: current.key },
    );
    renderRequestRef.current = null;
    setLocalJobs((previous) => [
      result.job,
      ...previous.filter((job) => job.id !== result.job.id),
    ]);
    notify(t('renderStarted'));
    onRefresh().catch(() => {});
    refreshLocal().catch(() => {});
  }
  function chooseUpload(target: 'garments' | 'portrait') {
    setUploadTarget(target);
    setTimeout(() => fileRef.current?.click(), 0);
  }
  async function uploadFiles(
    files: File[],
    target: 'garments' | 'portrait' = 'garments',
  ) {
    if (target === 'garments' && files.length + garmentIds.length > 8) {
      notify(t('garmentLimit'), true);
      return;
    }
    const added: FashionMedia[] = [];
    for (const file of files) {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw new FashionError('INVALID_FILE');
      const form = new FormData();
      form.set('file', file);
      form.set('role', 'SOURCE');
      if (projectId) form.set('projectId', projectId);
      const data = await request('/api/media', 'POST', form);
      added.push(data.media);
      setExtraMedia((previous) => [...previous, data.media]);
    }
    if (target === 'portrait')
      setModelForm((previous) => ({
        ...previous,
        referenceMediaId: added.at(-1)?.id || null,
      }));
    else
      setGarmentIds((previous) =>
        [...new Set([...previous, ...added.map((item) => item.id)])].slice(
          0,
          8,
        ),
      );
    notify(t(target === 'portrait' ? 'referenceUploaded' : 'mediaUploaded'));
    onRefresh().catch(() => {});
  }
  async function saveModel() {
    const { id, ...body } = modelForm;
    const result = await request(
      id ? `/api/mannequins/${id}` : '/api/mannequins',
      id ? 'PATCH' : 'POST',
      body,
    );
    setModels((previous) => [
      result.mannequin,
      ...previous.filter((item) => item.id !== result.mannequin.id),
    ]);
    setMannequinId(result.mannequin.id);
    const changed =
      models.find((item) => item.id === id)?.updatedAt !==
      result.mannequin.updatedAt;
    setLooks((previous) =>
      previous.map((look) =>
        look.mannequinId === result.mannequin.id
          ? {
              ...look,
              mannequin: result.mannequin,
              ...(changed ? { outputMediaId: null, outputMedia: null } : {}),
            }
          : look,
      ),
    );
    setDialog(null);
    notify(t('profileSaved'));
    void refreshLocal().catch(() => {});
    void onRefresh().catch(() => {});
  }
  async function duplicateLook(look: Look) {
    const result = await request(`/api/looks/${look.id}/duplicate`, 'POST');
    setLooks((previous) => [result.look, ...previous]);
    openLook(result.look);
    notify(t('duplicateSuccess'));
    onRefresh().catch(() => {});
  }
  const statusLabel = (status: string) =>
    t(
      (
        {
          QUEUED: 'queued',
          PROCESSING: 'processing',
          SUBMITTING: 'processing',
          RUNNING: 'generating',
          EXPORTING: 'exporting',
          SUCCEEDED: 'done',
          FAILED: 'failed',
          CANCELLED: 'canceled',
          UNKNOWN: 'unknown',
        } as Record<string, FashionMessageKey>
      )[status] || 'unknown',
    );
  const modelReference = modelForm.referenceMediaId
    ? allMedia.find((item) => item.id === modelForm.referenceMediaId)
    : null;
  if (loading)
    return (
      <div className="fashion-loading">
        <LoaderCircle size={24} className="spin" />
        <span>{t('loading')}</span>
      </div>
    );
  return (
    <div className="fashion-module">
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept=".png,.jpg,.jpeg,.webp"
        multiple={uploadTarget === 'garments'}
        aria-label={t(uploadTarget === 'garments' ? 'upload' : 'addPortrait')}
        onChange={(event) => {
          if (event.target.files?.length) {
            const files = Array.from(event.target.files);
            act('upload', () => uploadFiles(files, uploadTarget));
          }
          event.target.value = '';
        }}
      />
      <section
        className={cn('fashion-hero', view === 'lookbook' && 'lookbook-hero')}
      >
        <div className="fashion-hero-copy">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {t(view === 'lookbook' ? 'bookEyebrow' : 'eyebrow')}
          </span>
          <h2>{t(view === 'lookbook' ? 'bookTitle' : 'heroTitle')}</h2>
          <p>
            {t(view === 'lookbook' ? 'bookDescription' : 'heroDescription')}
          </p>
          <span className="fashion-preserved">
            <ShieldCheck size={13} />
            {t('honestBadge')}
          </span>
        </div>
        <div className="fashion-hero-art" aria-hidden="true">
          <span className="fashion-art-circle" />
          <div className="fashion-art-page page-back">
            <Layers3 size={32} strokeWidth={0.8} />
          </div>
          <div className="fashion-art-page page-front">
            <Shirt size={59} strokeWidth={0.65} />
            <span>YASSDEM</span>
            <small>01 / COLLECTION</small>
          </div>
          <span className="fashion-art-spark">✧</span>
        </div>
      </section>
      <div className="fashion-toolbar">
        <div
          className="fashion-tabs"
          role="tablist"
          aria-label={t('collection')}
        >
          {[
            { id: 'compose', label: 'composeTab', icon: Palette },
            { id: 'models', label: 'modelsTab', icon: UsersRound },
            { id: 'collection', label: 'collectionTab', icon: Layers3 },
          ].map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={cn(tab === item.id && 'active')}
              onClick={() => setTab(item.id)}
            >
              <item.icon size={15} />
              <span>{t(item.label as FashionMessageKey)}</span>
              {item.id === 'models' && <small>{models.length}</small>}
            </button>
          ))}
        </div>
        <div className="fashion-collection-picker">
          <Select
            value={projectId}
            aria-label={t('collection')}
            onChange={(event) => changeCollection(event.target.value)}
            disabled={!!busy}
          >
            <option value="" disabled>
              {t('chooseCollection')}
            </option>
            {collections.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('addCollection')}
            title={t('newCollection')}
            onClick={() => {
              setCollectionName('');
              setDialog('collection');
            }}
            disabled={!!busy}
          >
            <Plus size={17} />
          </Button>
        </div>
      </div>
      {loadError && (
        <div className="fashion-alert" role="alert">
          <span>{t('errorNetwork')}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => act('reload', refreshLocal)}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      {!collection && (
        <div className="fashion-collection-callout">
          <span className="fashion-callout-icon">
            <FolderOpen size={21} />
          </span>
          <div>
            <strong>{t('noCollection')}</strong>
            <p>{t('noLooksDescription')}</p>
          </div>
          <Button
            onClick={() => {
              setCollectionName('');
              setDialog('collection');
            }}
            size="sm"
          >
            <Plus size={15} />
            {t('newCollection')}
          </Button>
        </div>
      )}
      {tab === 'compose' && (
        <div className="fashion-compose-grid">
          <div className="fashion-composer-main">
            <section className="panel fashion-garments">
              <div className="panel-heading">
                <h2>
                  <Shirt size={17} />
                  {t('garments')}
                </h2>
                <Badge>{garmentIds.length} / 8</Badge>
              </div>
              <div className="panel-body">
                <p className="section-description">
                  {t('garmentsDescription')}
                </p>
                <div
                  className={cn(
                    'fashion-garment-board',
                    dragOver && 'drag-over',
                    !garmentIds.length && 'is-empty',
                  )}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    if (activeRender || busy) return;
                    setUploadTarget('garments');
                    if (event.dataTransfer.files.length) {
                      const files = Array.from(event.dataTransfer.files);
                      act('upload', () => uploadFiles(files));
                    }
                  }}
                >
                  {!garmentIds.length ? (
                    <div className="fashion-dropzone">
                      <div className="upload-illustration">
                        <UploadCloud size={32} strokeWidth={1.2} />
                      </div>
                      <h3>{t('dropGarments')}</h3>
                      <p>{t('dropDescription')}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => chooseUpload('garments')}
                        disabled={!!busy}
                      >
                        <Plus size={14} />
                        {t(busy === 'upload' ? 'uploadInProgress' : 'browse')}
                      </Button>
                      <span>{t('uploadHelp')}</span>
                    </div>
                  ) : (
                    <>
                      {selectedMedia.map((item, index) => (
                        <div className="fashion-garment-tile" key={item.id}>
                          <img src={item.url} alt={item.name} />
                          <span className="fashion-garment-number">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <button
                            aria-label={`${t('removeGarment')} ${item.name}`}
                            onClick={() =>
                              setGarmentIds((previous) =>
                                previous.filter((id) => id !== item.id),
                              )
                            }
                            disabled={!!busy || activeRender}
                          >
                            <X size={13} />
                          </button>
                          <span className="fashion-garment-title">
                            {item.name}
                          </span>
                        </div>
                      ))}
                      {garmentIds.length < 8 && (
                        <button
                          className="fashion-add-tile"
                          onClick={() => chooseUpload('garments')}
                          disabled={!!busy || activeRender}
                        >
                          <Plus size={23} />
                          <span>{t('upload')}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="fashion-garment-footer">
                  <span>
                    <ShieldCheck size={12} />
                    {t('originalPreserved')}
                  </span>
                  <button
                    className="text-link"
                    onClick={() => {
                      setPickerIds(garmentIds);
                      setDialog('garments');
                    }}
                    disabled={!!busy || activeRender || !wardrobe.length}
                  >
                    <FolderOpen size={13} />
                    {t('chooseGarments')}
                  </button>
                </div>
              </div>
            </section>
            <section className="panel fashion-look-details">
              <div className="panel-heading">
                <h2>
                  <Palette size={17} />
                  {t('lookDetails')}
                </h2>
                <span className="muted small-text">{t('optional')}</span>
              </div>
              <div className="panel-body">
                <Field label={t('lookName')}>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={150}
                    placeholder={t('lookPlaceholder')}
                    disabled={activeRender}
                  />
                </Field>
                <Field label={t('styles')} hint={t('stylesHelp')}>
                  <div className="fashion-style-tags">
                    {[...new Set([...STYLE_OPTIONS, ...parameters.styles])].map(
                      (style) => (
                        <button
                          key={style}
                          className={cn(
                            'style-tag',
                            parameters.styles.includes(style) && 'active',
                          )}
                          onClick={() => toggleStyle(style)}
                          disabled={activeRender}
                        >
                          {parameters.styles.includes(style) && (
                            <Check size={11} />
                          )}{' '}
                          {style}
                        </button>
                      ),
                    )}
                  </div>
                </Field>
                <div className="custom-style">
                  <Input
                    value={customStyle}
                    onChange={(event) => setCustomStyle(event.target.value)}
                    maxLength={100}
                    placeholder={t('customStyle')}
                    aria-label={t('customStyle')}
                    disabled={activeRender}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('add')}
                    disabled={!customStyle.trim() || activeRender}
                    onClick={() => {
                      toggleStyle(customStyle.trim());
                      setCustomStyle('');
                    }}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
                <div className="field-pair fashion-parameter-row">
                  <Field label={t('fit')}>
                    <Select
                      value={parameters.fit}
                      onChange={(event) =>
                        patchParameter(
                          'fit',
                          event.target.value as LookParameters['fit'],
                        )
                      }
                      disabled={activeRender}
                    >
                      {[
                        ['regular', 'fitRegular'],
                        ['fitted', 'fitFitted'],
                        ['relaxed', 'fitRelaxed'],
                        ['oversized', 'fitOversized'],
                        ['custom', 'fitCustom'],
                      ].map(([value, key]) => (
                        <option value={value} key={value}>
                          {t(key as FashionMessageKey)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t('colors')}>
                    <Input
                      value={colorsText}
                      maxLength={1200}
                      placeholder={t('colorsPlaceholder')}
                      onChange={(event) => setColorsText(event.target.value)}
                      disabled={activeRender}
                    />
                  </Field>
                </div>
                <div className="field-pair">
                  <Field label={t('accessories')} hint={t('listHelp')}>
                    <Input
                      value={accessoriesText}
                      maxLength={1200}
                      placeholder={t('accessoriesPlaceholder')}
                      onChange={(event) =>
                        setAccessoriesText(event.target.value)
                      }
                      disabled={activeRender}
                    />
                  </Field>
                  <Field label={t('coverage')}>
                    <Input
                      value={parameters.coverage}
                      maxLength={200}
                      placeholder={t('coveragePlaceholder')}
                      onChange={(event) =>
                        patchParameter('coverage', event.target.value)
                      }
                      disabled={activeRender}
                    />
                  </Field>
                </div>
                <Field label={t('mood')}>
                  <Input
                    value={parameters.mood}
                    maxLength={200}
                    placeholder={t('moodPlaceholder')}
                    onChange={(event) =>
                      patchParameter('mood', event.target.value)
                    }
                    disabled={activeRender}
                  />
                </Field>
                <Field label={t('creativePrompt')}>
                  <textarea
                    className="input fashion-prompt"
                    rows={3}
                    value={parameters.prompt}
                    maxLength={2000}
                    placeholder={t('promptPlaceholder')}
                    onChange={(event) =>
                      patchParameter('prompt', event.target.value)
                    }
                    disabled={activeRender}
                  />
                </Field>
                {isDirty && selectedLook?.outputMedia && (
                  <p className="field-hint">{t('editedNotice')}</p>
                )}
                <div className="fashion-look-actions">
                  <Button
                    variant="secondary"
                    disabled={
                      !!busy ||
                      activeRender ||
                      !collection ||
                      !garmentIds.length ||
                      !name.trim()
                    }
                    onClick={() =>
                      act('save-look', async () => {
                        await persistLook();
                      })
                    }
                  >
                    {busy === 'save-look' ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Check size={15} />
                    )}{' '}
                    {t('saveLook')}
                  </Button>
                  {lookId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy || activeRender}
                      onClick={() =>
                        act('duplicate', () => duplicateLook(selectedLook!))
                      }
                    >
                      <Copy size={14} />
                      {t('variant')}
                    </Button>
                  )}
                </div>
              </div>
            </section>
            <section className="panel fashion-comparison">
              <div className="panel-heading">
                <h2>
                  <ScanLine size={17} />
                  {t('compare')}
                </h2>
                {selectedLook?.outputMedia && (
                  <Badge
                    tone={
                      latestOutputJob?.parameters.mode === 'collage'
                        ? 'muted'
                        : 'brand'
                    }
                  >
                    {t(
                      latestOutputJob?.parameters.mode === 'collage'
                        ? 'localBadge'
                        : 'result',
                    )}
                  </Badge>
                )}
              </div>
              <div className="fashion-compare-grid">
                <div className="fashion-original-column">
                  <h3>{t('original')}</h3>
                  <div className="fashion-originals">
                    {selectedMedia.length ? (
                      selectedMedia.map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={item.name}
                        >
                          <img src={item.url} alt={item.name} />
                        </a>
                      ))
                    ) : (
                      <Shirt size={38} strokeWidth={0.8} />
                    )}
                  </div>
                </div>
                <div className="fashion-result-column">
                  <h3>{t('result')}</h3>
                  {selectedLook?.outputMedia ? (
                    <a
                      className="fashion-result-image"
                      href={selectedLook.outputMedia.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={selectedLook.outputMedia.url}
                        alt={selectedLook.name}
                      />
                    </a>
                  ) : (
                    <div className="fashion-no-result">
                      <Sparkles size={30} strokeWidth={0.9} />
                      <strong>{t('noResult')}</strong>
                      <p>{t('noResultDescription')}</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedLook?.outputMedia ? (
                <div className="fashion-result-footer">
                  <div>
                    <span>{t('resolution')}</span>
                    <strong>
                      {selectedLook.outputMedia.width} ×{' '}
                      {selectedLook.outputMedia.height} px
                    </strong>
                  </div>
                  <div className="fashion-result-actions">
                    <a
                      className="button button-secondary button-sm"
                      href={`${selectedLook.outputMedia.url}?download=1`}
                      download
                    >
                      <Download size={14} />
                      {t('downloadImage')}
                    </a>
                    {onAnimate && (
                      <Button
                        size="sm"
                        onClick={() =>
                          onAnimate(
                            selectedLook.outputMediaId!,
                            selectedLook.projectId,
                          )
                        }
                      >
                        <Clapperboard size={15} />
                        {t('animate')}
                      </Button>
                    )}
                  </div>
                  <p>
                    {latestOutputJob?.parameters.mode === 'collage'
                      ? t('localResult')
                      : t('fidelity')}
                  </p>
                  {onAnimate && <p>{t('animateNote')}</p>}
                </div>
              ) : (
                <p className="fashion-fidelity">
                  <ShieldCheck size={13} />
                  {t('fidelity')}
                </p>
              )}
            </section>
            <section className="panel fashion-jobs">
              <div className="panel-heading">
                <h2>
                  <ImageIcon size={17} />
                  {t('history')}
                </h2>
                <Badge>{relevantJobs.length}</Badge>
              </div>
              {!relevantJobs.length ? (
                <div className="empty-jobs">
                  <ImageIcon size={21} />
                  {t('noHistory')}
                </div>
              ) : (
                relevantJobs.map((job) => (
                  <div className="job-row" key={job.id}>
                    <span
                      className={cn(
                        'job-icon',
                        job.status === 'SUCCEEDED' && 'finished',
                      )}
                    >
                      {job.status === 'SUCCEEDED' ? (
                        <CheckCircle2 size={18} />
                      ) : ACTIVE.includes(job.status) ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <X size={17} />
                      )}
                    </span>
                    <div className="job-info">
                      <strong>
                        {t(
                          job.parameters.mode === 'collage'
                            ? 'collage'
                            : job.parameters.mode === 'try-on'
                              ? 'tryOn'
                              : 'fashionImage',
                        )}
                      </strong>
                      <span>
                        {statusLabel(job.status)}
                        {job.errorCode && ` · ${errorMessage(job.errorCode)}`}
                      </span>
                      {job.status === 'RUNNING' &&
                        job.parameters.mode !== 'collage' && (
                          <span>{t('cancelGpuNote')}</span>
                        )}
                      {ACTIVE.includes(job.status) && (
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label={t('running')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={job.progress}
                        >
                          <span
                            style={{ width: `${Math.max(3, job.progress)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {ACTIVE.includes(job.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('cancelJob')}
                        disabled={!!busy}
                        onClick={() =>
                          act('cancel-job', async () => {
                            await request(`/api/jobs/${job.id}`, 'DELETE');
                            notify(t('cancelRequested'));
                            onRefresh().catch(() => {});
                            refreshLocal().catch(() => {});
                          })
                        }
                      >
                        <X size={16} />
                      </Button>
                    )}
                    {job.status === 'SUCCEEDED' && job.outputMediaId && (
                      <a
                        className="button button-secondary button-icon"
                        href={`/api/media/${job.outputMediaId}?download=1`}
                        download
                        aria-label={t('downloadImage')}
                      >
                        <Download size={15} />
                      </a>
                    )}
                  </div>
                ))
              )}
            </section>
          </div>
          <aside className="fashion-composer-aside">
            <section className="panel fashion-model-picker">
              <div className="panel-heading">
                <h2>
                  <UserRound size={17} />
                  {t('mannequin')}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('createMannequin')}
                  onClick={() => openModel()}
                  disabled={!!busy || activeRender}
                >
                  <Plus size={17} />
                </Button>
              </div>
              <div className="panel-body">
                <Select
                  value={mannequinId}
                  onChange={(event) => setMannequinId(event.target.value)}
                  aria-label={t('mannequin')}
                  disabled={activeRender}
                >
                  <option value="">{t('chooseMannequin')}</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </Select>
                {selectedModel ? (
                  <div className="fashion-selected-model">
                    {selectedModel.referenceMediaId &&
                    allMedia.find(
                      (item) => item.id === selectedModel.referenceMediaId,
                    ) ? (
                      <img
                        src={
                          allMedia.find(
                            (item) =>
                              item.id === selectedModel.referenceMediaId,
                          )!.url
                        }
                        alt={selectedModel.name}
                      />
                    ) : (
                      <div className="fashion-model-avatar">
                        <UserRound size={30} strokeWidth={1} />
                      </div>
                    )}
                    <div>
                      <strong>{selectedModel.name}</strong>
                      <span>
                        {selectedModel.parameters.heightCm} {t('profileHeight')}
                        {selectedModel.parameters.hijab
                          ? ` · ${t('hijab')}`
                          : ''}
                      </span>
                      <button
                        className="text-link"
                        onClick={() => openModel(selectedModel)}
                        disabled={!!busy || activeRender}
                      >
                        {t('edit')}
                        <ArrowUpRight size={11} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="field-hint">{t('mannequinOptional')}</p>
                )}
              </div>
            </section>
            <section className="panel fashion-render-panel">
              <div className="panel-heading">
                <h2>
                  <WandSparkles size={17} />
                  {t('renderTitle')}
                </h2>
              </div>
              <div className="panel-body">
                <p className="section-description">{t('renderHelp')}</p>
                <div className="fashion-render-modes">
                  {[
                    {
                      id: 'collage',
                      title: 'collage',
                      description: 'collageDescription',
                      icon: Layers3,
                    },
                    {
                      id: 'fashion-image',
                      title: 'fashionImage',
                      description: 'fashionImageDescription',
                      icon: Sparkles,
                    },
                    {
                      id: 'try-on',
                      title: 'tryOn',
                      description: 'tryOnDescription',
                      icon: Shirt,
                    },
                  ].map((item) => {
                    const configured =
                      item.id === 'collage' ||
                      !!(
                        comfy?.connected &&
                        (item.id === 'try-on'
                          ? comfy.tryOn.configured
                          : comfy.fashionImage.configured)
                      );
                    return (
                      <button
                        key={item.id}
                        className={cn(
                          'fashion-mode',
                          mode === item.id && 'active',
                        )}
                        onClick={() => setMode(item.id as RenderMode)}
                        disabled={activeRender}
                      >
                        <span className="fashion-mode-radio">
                          {mode === item.id && <span />}
                        </span>
                        <span className="fashion-mode-copy">
                          <strong>
                            <item.icon size={15} />
                            {t(item.title as FashionMessageKey)}
                          </strong>
                          <small>
                            {t(item.description as FashionMessageKey)}
                          </small>
                          <span
                            className={cn(
                              'fashion-mode-status',
                              configured && 'is-ready',
                            )}
                          >
                            {item.id === 'collage'
                              ? t('localBadge')
                              : t(configured ? 'configured' : 'unavailable')}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {mode !== 'collage' && !modeReady && (
                  <p className="fashion-render-warning">
                    <Settings2 size={15} />
                    {t('modeRequired')}
                  </p>
                )}
                {missingPortrait && (
                  <p className="fashion-render-warning">
                    <UserRound size={15} />
                    {t('portraitRequired')}
                  </p>
                )}
                {wrongSlots && (
                  <p className="fashion-render-warning">
                    <Shirt size={15} />
                    {t('slotsRequired').replace(
                      '{count}',
                      String(requiredSlots),
                    )}
                  </p>
                )}
                {mode === 'collage' && (
                  <p className="fashion-local-disclosure">
                    <ShieldCheck size={14} />
                    {t('consentNotice')}
                  </p>
                )}
                <Button
                  className="full-width"
                  disabled={
                    !!busy ||
                    activeRender ||
                    !collection ||
                    !garmentIds.length ||
                    !name.trim() ||
                    !modeReady ||
                    missingPortrait ||
                    wrongSlots
                  }
                  onClick={() => act('render', renderLook)}
                >
                  {busy === 'render' || activeRender ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Sparkles size={17} />
                  )}{' '}
                  {t(
                    busy === 'render' || activeRender
                      ? 'running'
                      : mode === 'collage'
                        ? 'runCollage'
                        : 'run',
                  )}
                </Button>
                <p className="fashion-render-cost">
                  {t(mode === 'collage' ? 'noApiCost' : 'hardwareNote')}
                </p>
              </div>
            </section>
            <section className="fashion-provider-status">
              <div>
                <span
                  className={cn(
                    'fashion-service-dot',
                    comfy?.connected && 'connected',
                  )}
                />
                <strong>
                  {t(
                    comfy?.connected
                      ? 'connected'
                      : comfy
                        ? 'disconnected'
                        : 'unknownConnection',
                  )}
                </strong>
                <button
                  aria-label={t('checkConnection')}
                  title={t('checkConnection')}
                  onClick={() =>
                    act('provider', async () => {
                      const result = await request(
                        '/api/providers/comfyui/status',
                      );
                      setComfy(result.status || result);
                    })
                  }
                  disabled={!!busy}
                >
                  <RefreshCw
                    size={13}
                    className={busy === 'provider' ? 'spin' : ''}
                  />
                </button>
              </div>
              <p>{t('providerExplanation')}</p>
              {comfy?.connected && !comfy.fashionImage.configured && (
                <p>{t('missingFashionWorkflow')}</p>
              )}
              {comfy?.connected && !comfy.tryOn.configured && (
                <p>{t('missingTryOnWorkflow')}</p>
              )}
            </section>
            {collectionLooks.length > 0 && (
              <section className="fashion-saved-looks">
                <h3>
                  {t('savedLooks')}
                  <span>{collectionLooks.length}</span>
                </h3>
                {collectionLooks.slice(0, 6).map((look) => (
                  <button
                    key={look.id}
                    className={cn(lookId === look.id && 'active')}
                    onClick={() => openLook(look)}
                    disabled={!!busy}
                  >
                    <span className="fashion-saved-thumb">
                      {look.outputMedia ? (
                        <img src={look.outputMedia.url} alt="" />
                      ) : look.sourceMedia[0] ? (
                        <img src={look.sourceMedia[0].url} alt="" />
                      ) : (
                        <Shirt size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{look.name}</strong>
                      <small>
                        {look.garmentMediaIds.length} {t('garmentItems')}
                      </small>
                    </span>
                    <ArrowRight size={13} />
                  </button>
                ))}
                <button
                  className="text-link"
                  onClick={() => {
                    clearLook();
                    setTab('compose');
                  }}
                >
                  <Plus size={13} />
                  {t('newLook')}
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
      {tab === 'models' && (
        <section className="fashion-models-view">
          <div className="section-heading">
            <div>
              <h2>
                {t('modelProfiles')}
                <span className="count-badge">{models.length}</span>
              </h2>
              <p className="fashion-section-description">
                {t('modelDescription')}
              </p>
            </div>
            <Button onClick={() => openModel()} disabled={!!busy}>
              <Plus size={16} />
              {t('createMannequin')}
            </Button>
          </div>
          {models.length ? (
            <div className="fashion-model-grid">
              {models.map((model) => {
                const portrait = allMedia.find(
                  (item) => item.id === model.referenceMediaId,
                );
                return (
                  <article className="fashion-model-card panel" key={model.id}>
                    <div
                      className={cn(
                        'fashion-model-portrait',
                        !portrait && 'without-photo',
                      )}
                    >
                      {portrait ? (
                        <img src={portrait.url} alt={model.name} />
                      ) : (
                        <>
                          <div className="fashion-profile-arch">
                            <UserRound size={57} strokeWidth={0.65} />
                          </div>
                          <span>{t('profileOnly')}</span>
                        </>
                      )}
                      {model.parameters.hijab && <Badge>{t('hijab')}</Badge>}
                    </div>
                    <div className="fashion-model-info">
                      <div>
                        <h3>{model.name}</h3>
                        <span>
                          {model.parameters.heightCm} {t('profileHeight')}
                          {model.parameters.bodyType
                            ? ` · ${model.parameters.bodyType}`
                            : ''}
                        </span>
                      </div>
                      <div className="fashion-card-actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t('edit')} ${model.name}`}
                          onClick={() => openModel(model)}
                          disabled={!!busy}
                        >
                          <Settings2 size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t('delete')} ${model.name}`}
                          onClick={() => {
                            setDialogId(model.id);
                            setDialog('delete-model');
                          }}
                          disabled={!!busy}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    {model.description && (
                      <p className="fashion-model-description">
                        {model.description}
                      </p>
                    )}
                  </article>
                );
              })}
              <button
                className="fashion-new-profile"
                onClick={() => openModel()}
                disabled={!!busy}
              >
                <span>
                  <Plus size={25} />
                </span>
                <strong>{t('createMannequin')}</strong>
                <small>{t('modelDescription')}</small>
              </button>
            </div>
          ) : (
            <div className="fashion-empty panel">
              <span className="fashion-empty-icon">
                <UsersRound size={39} strokeWidth={0.9} />
              </span>
              <h3>{t('noModels')}</h3>
              <p>{t('noModelsDescription')}</p>
              <Button onClick={() => openModel()}>
                <Plus size={16} />
                {t('createMannequin')}
              </Button>
            </div>
          )}
        </section>
      )}
      {tab === 'collection' && (
        <section className="fashion-collection-view">
          <div className="fashion-collection-heading">
            <div>
              <span className="eyebrow">{t('collection')}</span>
              <h2>{collection?.name || t('collectionTab')}</h2>
              <p>
                {collectionLooks.length} {t('looks')}
                <span>·</span>
                {
                  new Set(
                    collectionLooks.flatMap((look) => look.garmentMediaIds),
                  ).size
                }{' '}
                {t('garmentCount').toLowerCase()}
              </p>
            </div>
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  clearLook();
                  setTab('compose');
                }}
                disabled={!!busy}
              >
                <Plus size={15} />
                {t('newLook')}
              </Button>
              {collection && (
                <a
                  className="button button-primary button-md"
                  href={`/api/projects/${projectId}/archive`}
                  download
                >
                  <ArrowDownToLine size={15} />
                  {t('downloadCollection')}
                </a>
              )}
            </div>
          </div>
          {collectionLooks.length ? (
            <>
              <div className="fashion-look-grid">
                {collectionLooks.map((look, index) => (
                  <article key={look.id} className="fashion-look-card panel">
                    <button
                      className="fashion-look-cover"
                      aria-label={`${t('openLook')} ${look.name}`}
                      onClick={() => openLook(look)}
                    >
                      {look.outputMedia ? (
                        <img src={look.outputMedia.url} alt={look.name} />
                      ) : (
                        <div className="fashion-look-contact">
                          {look.sourceMedia.slice(0, 4).map((item) => (
                            <img src={item.url} key={item.id} alt={item.name} />
                          ))}
                        </div>
                      )}
                      <span className="fashion-look-index">
                        LOOK {String(index + 1).padStart(2, '0')}
                      </span>
                      <Badge tone={look.outputMedia ? 'success' : 'muted'}>
                        {t(look.outputMedia ? 'readyOutput' : 'noOutput')}
                      </Badge>
                      <span className="fashion-look-open">
                        <ArrowUpRight size={19} />
                      </span>
                    </button>
                    <div className="fashion-look-card-body">
                      <div>
                        <button onClick={() => openLook(look)}>
                          {look.name}
                        </button>
                        <p>
                          {look.parameters.styles.length
                            ? look.parameters.styles.slice(0, 2).join(' · ')
                            : look.mannequin?.name || t('look')}
                        </p>
                      </div>
                      <div className="fashion-card-actions">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('variant')}
                          aria-label={`${t('variant')} ${look.name}`}
                          onClick={() =>
                            act('duplicate', () => duplicateLook(look))
                          }
                          disabled={!!busy}
                        >
                          <Copy size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${t('delete')} ${look.name}`}
                          onClick={() => {
                            setDialogId(look.id);
                            setDialog('delete-look');
                          }}
                          disabled={!!busy}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  className="fashion-new-profile fashion-new-look"
                  onClick={() => {
                    clearLook();
                    setTab('compose');
                  }}
                >
                  <span>
                    <Plus size={25} />
                  </span>
                  <strong>{t('newLook')}</strong>
                  <small>{t('noLooksDescription')}</small>
                </button>
              </div>
              <p className="fashion-archive-note">
                <ShieldCheck size={13} />
                {t('collectionArchiveNote')}
              </p>
            </>
          ) : (
            <div className="fashion-empty panel">
              <span className="fashion-empty-icon">
                <Layers3 size={39} strokeWidth={0.9} />
              </span>
              <h3>{t('noLooks')}</h3>
              <p>{t('noLooksDescription')}</p>
              <Button
                onClick={() => {
                  clearLook();
                  setTab('compose');
                }}
              >
                <Plus size={16} />
                {t('newLook')}
              </Button>
            </div>
          )}
        </section>
      )}
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
      {dialog === 'collection' && (
        <Dialog
          title={t('newCollection')}
          onClose={() => setDialog(null)}
          closeLabel={t('close')}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              act('collection', async () => {
                const result = await request('/api/projects', 'POST', {
                  name: collectionName.trim(),
                  type: view,
                  description: '',
                  parameters: {},
                });
                setProjectId(result.project.id);
                clearLook();
                setDialog(null);
                notify(t('collectionCreated'));
                onRefresh().catch(() => {});
              });
            }}
          >
            <Field label={t('collectionName')}>
              <Input
                autoFocus
                required
                value={collectionName}
                placeholder={t('collectionPlaceholder')}
                onChange={(event) => setCollectionName(event.target.value)}
                maxLength={120}
              />
            </Field>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDialog(null)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!!busy || !collectionName.trim()}>
                {busy === 'collection' ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Plus size={15} />
                )}{' '}
                {t('createCollection')}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {dialog === 'model' && (
        <Dialog
          title={t(modelForm.id ? 'edit' : 'createMannequin')}
          onClose={() => setDialog(null)}
          closeLabel={t('close')}
        >
          <form
            className="fashion-model-form"
            onSubmit={(event) => {
              event.preventDefault();
              act('save-model', saveModel);
            }}
          >
            <Field label={t('modelName')}>
              <Input
                autoFocus
                required
                value={modelForm.name}
                placeholder={t('modelNamePlaceholder')}
                onChange={(event) =>
                  setModelForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                maxLength={150}
              />
            </Field>
            <Field label={t('modelNotes')}>
              <textarea
                className="input"
                rows={2}
                value={modelForm.description}
                maxLength={2000}
                placeholder={t('modelNotesPlaceholder')}
                onChange={(event) =>
                  setModelForm((previous) => ({
                    ...previous,
                    description: event.target.value,
                  }))
                }
              />
            </Field>
            <div className="field-pair">
              <Field label={t('skinTone')}>
                <Input
                  value={modelForm.parameters.skinTone}
                  placeholder={t('skinPlaceholder')}
                  onChange={(event) =>
                    patchModel('skinTone', event.target.value)
                  }
                  maxLength={120}
                />
              </Field>
              <Field label={t('bodyType')}>
                <Input
                  value={modelForm.parameters.bodyType}
                  placeholder={t('bodyPlaceholder')}
                  onChange={(event) =>
                    patchModel('bodyType', event.target.value)
                  }
                  maxLength={120}
                />
              </Field>
            </div>
            <div className="field-pair">
              <Field label={t('height')}>
                <Input
                  type="number"
                  min={100}
                  max={230}
                  step={1}
                  required
                  value={modelForm.parameters.heightCm}
                  onChange={(event) =>
                    patchModel('heightCm', Number(event.target.value))
                  }
                />
              </Field>
              <Field label={t('hair')}>
                <Input
                  value={modelForm.parameters.hair}
                  placeholder={t('hairPlaceholder')}
                  onChange={(event) => patchModel('hair', event.target.value)}
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label={t('pose')}>
              <Input
                value={modelForm.parameters.pose}
                placeholder={t('posePlaceholder')}
                onChange={(event) => patchModel('pose', event.target.value)}
                maxLength={120}
              />
            </Field>
            <label className="toggle-row fashion-hijab-toggle">
              <div>
                <strong>{t('hijab')}</strong>
                <p>{t('hijabHelp')}</p>
              </div>
              <input
                type="checkbox"
                role="switch"
                checked={modelForm.parameters.hijab}
                onChange={(event) => patchModel('hijab', event.target.checked)}
              />
            </label>
            <div className="fashion-reference-field">
              <span className="field-label">
                {t('portrait')} <small>· {t('optional')}</small>
              </span>
              <div className="fashion-reference-content">
                {modelReference ? (
                  <img
                    src={modelReference.url}
                    alt={modelForm.name || t('portrait')}
                  />
                ) : (
                  <span className="fashion-reference-placeholder">
                    <UserRound size={30} strokeWidth={0.9} />
                  </span>
                )}
                <div>
                  <strong>{modelReference?.name || t('noPortrait')}</strong>
                  <div>
                    <Button
                      variant="secondary"
                      type="button"
                      size="sm"
                      onClick={() => chooseUpload('portrait')}
                      disabled={!!busy}
                    >
                      <UploadCloud size={13} />
                      {t('addPortrait')}
                    </Button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setDialog('portrait')}
                      disabled={!portraits.length || !!busy}
                    >
                      {t('selectPortrait')}
                    </button>
                    {modelForm.referenceMediaId && (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() =>
                          setModelForm((previous) => ({
                            ...previous,
                            referenceMediaId: null,
                          }))
                        }
                        disabled={!!busy}
                      >
                        {t('removePortrait')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <p className="field-hint">
                {t('portraitHelp')} {t('portraitPermission')}
              </p>
            </div>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDialog(null)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={!!busy || !modelForm.name.trim()}>
                {busy === 'save-model' ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Check size={15} />
                )}{' '}
                {t('save')}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {(dialog === 'garments' || dialog === 'portrait') && (
        <Dialog
          title={t(dialog === 'portrait' ? 'selectReference' : 'libraryTitle')}
          onClose={() => setDialog(dialog === 'portrait' ? 'model' : null)}
          closeLabel={t('close')}
        >
          <div className="fashion-media-picker">
            {(dialog === 'portrait' ? portraits : wardrobe).map((item) => (
              <button
                key={item.id}
                className={cn(
                  (dialog === 'portrait'
                    ? modelForm.referenceMediaId === item.id
                    : pickerIds.includes(item.id)) && 'selected',
                )}
                onClick={() => {
                  if (dialog === 'portrait') {
                    setModelForm((previous) => ({
                      ...previous,
                      referenceMediaId: item.id,
                    }));
                    setDialog('model');
                  } else if (pickerIds.includes(item.id))
                    setPickerIds((previous) =>
                      previous.filter((id) => id !== item.id),
                    );
                  else if (pickerIds.length < 8)
                    setPickerIds((previous) => [...previous, item.id]);
                  else notify(t('garmentLimit'), true);
                }}
              >
                <img src={item.url} alt={item.name} />
                <span>{item.name}</span>
                {(dialog === 'portrait'
                  ? modelForm.referenceMediaId === item.id
                  : pickerIds.includes(item.id)) && (
                  <span className="fashion-media-check">
                    <Check size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>
          {dialog === 'garments' && (
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setDialog(null)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  setGarmentIds(pickerIds);
                  setDialog(null);
                }}
              >
                {t('useSelection')} · {pickerIds.length}
              </Button>
            </div>
          )}
        </Dialog>
      )}
      {(dialog === 'delete-look' || dialog === 'delete-model') && (
        <Dialog
          title={t(
            dialog === 'delete-look' ? 'deleteLookTitle' : 'deleteModelTitle',
          )}
          onClose={() => setDialog(null)}
          closeLabel={t('close')}
        >
          <p className="dialog-description">
            {t(
              dialog === 'delete-look'
                ? 'deleteLookDescription'
                : 'deleteModelDescription',
            )}
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() =>
                act('delete', async () => {
                  await request(
                    `/api/${dialog === 'delete-look' ? 'looks' : 'mannequins'}/${dialogId}`,
                    'DELETE',
                  );
                  if (dialog === 'delete-look') {
                    setLooks((previous) =>
                      previous.filter((item) => item.id !== dialogId),
                    );
                    if (lookId === dialogId) clearLook();
                  } else {
                    setModels((previous) =>
                      previous.filter((item) => item.id !== dialogId),
                    );
                    if (mannequinId === dialogId) setMannequinId('');
                  }
                  setDialog(null);
                  notify(t('deleteSuccess'));
                  onRefresh().catch(() => {});
                })
              }
            >
              <Trash2 size={14} />
              {t('delete')}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
