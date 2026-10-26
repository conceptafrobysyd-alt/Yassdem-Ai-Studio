'use client';
/* eslint-disable @next/next/no-img-element */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Film,
  FolderOpen,
  Globe2,
  ImagePlus,
  Image as ImageIcon,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Monitor,
  MoreHorizontal,
  Palette,
  Play,
  Plus,
  ScanLine,
  Settings2,
  ShieldCheck,
  Shirt,
  Sparkles,
  Sun,
  Moon,
  Trash2,
  UploadCloud,
  Wallet,
  X,
  Zap,
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
import { FashionStudio } from './fashion-studio';
import { EditorStudio } from './editor-studio';
import { SEOStudio } from './seo-studio';
import { ProvidersPanel } from './providers-panel';
import { BrandPresetsPanel } from './brand-presets-panel';
import { ImageExportPanel } from './image-export-panel';
import { StylePresetsPanel } from './style-presets-panel';
import { ProductImportPanel } from './product-import-panel';
import { ModelCatalogPanel } from './model-catalog-panel';
import { QuickCreatePanel } from './quick-create-panel';
import fr from '@/messages/fr';
import en from '@/messages/en';
type Locale = 'fr' | 'en';
type Media = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  role: string;
  projectId?: string;
  url: string;
  createdAt: string;
};
type Project = {
  id: string;
  name: string;
  description: string;
  type: string;
  parameters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
type Job = {
  id: string;
  projectId: string;
  provider: string;
  status: string;
  kind: string;
  progress: number;
  sourceMediaId: string;
  outputMediaId?: string;
  outputUrl?: string;
  estimatedCostCents: number;
  actualCostCents?: number;
  parameters: Record<string, unknown>;
  errorCode?: string;
  createdAt: string;
};
type Settings = {
  locale: Locale;
  theme: 'dark' | 'light';
  contentLocale: Locale;
  preferredStyles: string[];
  customStyles: string[];
  hijab: boolean;
  activeLogoId: string | null;
  preferredResolution: number;
  preferredFormat: string;
  defaultProvider: string;
  monthlyBudgetCents: number;
  providerEnabled: boolean;
  replicateEnabled: boolean;
  usdToEur: number;
  logoSize: number;
  logoOpacity: number;
  logoPosition: string;
  logoFade: boolean;
};
type Snapshot = {
  needsSetup: boolean;
  authenticated: boolean;
  settings?: Settings;
  projects?: Project[];
  media?: Media[];
  jobs?: Job[];
  providers?: {
    runway: {
      configured: boolean;
      enabled: boolean;
      costs: Record<string, { eurCents: number }>;
    };
    local: { available: boolean };
    replicate?: {
      configured: boolean;
      enabled: boolean;
      outputKind?: 'image' | 'video';
      model?: string;
      estimateCents?: number;
    };
  };
  budget?: {
    actualCostCents: number;
    remainingCents: number;
    reservedCents: number;
  };
};
type Parameters = {
  sourceMediaId: string;
  provider: string;
  duration: number;
  format: string;
  resolution: number;
  codec: string;
  quality: string;
  prompt: string;
  preset: string;
  decor: string;
  camera: string;
  logoMediaId: string;
  logoPosition: string;
  logoSize: number;
  logoOpacity: number;
  logoAnimation: string;
  logoTiming: string;
  stylePreferences: Record<string, string>;
};
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
function cleanSettings(raw: Partial<Settings>): Settings {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      raw[key as keyof Settings] ?? value,
    ]),
  ) as Settings;
}
const ACTIVE = ['QUEUED', 'PROCESSING', 'SUBMITTING', 'RUNNING', 'EXPORTING'];
const defaults: Settings = {
  locale: 'fr',
  theme: 'light',
  contentLocale: 'fr',
  preferredStyles: [],
  customStyles: [],
  hijab: false,
  activeLogoId: null,
  preferredResolution: 1080,
  preferredFormat: '9:16',
  defaultProvider: 'local',
  monthlyBudgetCents: 0,
  providerEnabled: false,
  replicateEnabled: false,
  usdToEur: 1,
  logoSize: 15,
  logoOpacity: 0.8,
  logoPosition: 'bottom-right',
  logoFade: false,
};
const baseParameters = (s: Settings): Parameters => ({
  sourceMediaId: '',
  provider: s.defaultProvider,
  duration: 5,
  format: s.preferredFormat,
  resolution: s.preferredResolution,
  codec: 'h264',
  quality: 'high',
  prompt: '',
  preset: 'minimal',
  decor: 'cream',
  camera: 'zoom-in',
  logoMediaId: s.activeLogoId || '',
  logoPosition: s.logoPosition,
  logoSize: s.logoSize,
  logoOpacity: s.logoOpacity,
  logoAnimation: s.logoFade ? 'fade' : 'none',
  logoTiming: 'all',
  stylePreferences: {},
});
const compressionQuality = (quality: string) =>
  quality === 'high' ? 18 : quality === 'compressed' ? 28 : 21;
function estimatedMegabytes(parameters: Parameters) {
  const [rw, rh] = parameters.format.split(':').map(Number);
  const scale = parameters.resolution / Math.min(rw, rh);
  return (
    (rw *
      rh *
      scale *
      scale *
      parameters.duration *
      (parameters.codec === 'h265' ? 0.055 : 0.08) *
      2 ** ((21 - compressionQuality(parameters.quality)) / 6)) /
    1024 /
    1024
  );
}
class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
async function api(path: string, method = 'GET', body?: unknown) {
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
    const result = await response.json();
    if (!response.ok) throw new ApiError(result.error?.code || 'UNKNOWN');
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK');
  }
}
export function Studio() {
  const [locale, setLocale] = useState<Locale>('fr');
  useEffect(() => {
    const stored = localStorage.getItem('yassdem-locale');
    changeLocale(
      stored === 'fr' || stored === 'en'
        ? stored
        : navigator.language.toLowerCase().startsWith('fr')
          ? 'fr'
          : 'en',
    );
  }, []);
  function changeLocale(value: Locale) {
    setLocale(value);
    localStorage.setItem('yassdem-locale', value);
    document.documentElement.lang = value;
  }
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'fr' ? fr : en}
      timeZone="Europe/Paris"
    >
      <StudioApp locale={locale} changeLocale={changeLocale} />
    </NextIntlClientProvider>
  );
}
function StudioApp({
  locale,
  changeLocale,
}: {
  locale: Locale;
  changeLocale: (value: Locale) => void;
}) {
  const t = useTranslations();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [page, setPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [parameters, setParameters] = useState<Parameters>(
    baseParameters(defaults),
  );
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [modal, setModal] = useState<string | null>(null);
  const [modalId, setModalId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [mediaFilter, setMediaFilter] = useState('all');
  const [customStyle, setCustomStyle] = useState('');
  const [estimated, setEstimated] = useState<number | null>(null);
  const [connection, setConnection] = useState<'unknown' | 'ok' | 'error'>(
    'unknown',
  );
  const [playingJob, setPlayingJob] = useState<Job | null>(null);
  const [fileRole, setFileRole] = useState('SOURCE');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const projects = snapshot?.projects || [],
    media = (snapshot?.media || []).filter(
      (item) => !['PREVIEW', 'PREVIEW_COVER'].includes(item.role),
    ),
    jobs = snapshot?.jobs || [],
    logos = media.filter((m) => m.role === 'LOGO'),
    images = media.filter(
      (m) => m.mimeType.startsWith('image/') && m.role !== 'LOGO',
    );
  const project = projects.find((p) => p.id === selectedId),
    source = media.find((m) => m.id === parameters.sourceMediaId),
    projectJobs = jobs.filter(
      (j) =>
        j.projectId === selectedId &&
        (['generation', 'export'].includes(j.kind) ||
          (j.kind === 'replicate' && j.parameters.outputKind === 'video')),
    ),
    spent = snapshot?.budget?.actualCostCents || 0,
    reserved = snapshot?.budget?.reservedCents || 0,
    committed = spent + reserved,
    pending = jobs.some((j) => ACTIVE.includes(j.status));
  const replicateVideoReady = Boolean(
    snapshot?.providers?.replicate?.configured &&
    snapshot.providers.replicate.outputKind === 'video',
  );
  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
    }).format(cents / 100);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(value));
  function errorText(error: unknown) {
    const code =
      error instanceof ApiError
        ? error.code
        : typeof error === 'string'
          ? error
          : 'UNKNOWN';
    if (code === 'NETWORK') return t('errorNetwork');
    if (code === 'INVALID_ORIGIN') return t('errorOrigin');
    if (code === 'SETUP_LOCAL_ONLY') return t('errorSetupLocal');
    if (/UNSAFE_SVG_LOGO|SVG_LOGO_TOO_LARGE|SVG_LOGO_ONLY/.test(code))
      return t('errorSvg');
    if (/UNAUTH|SESSION|AUTH_REQUIRED/.test(code))
      return t('errorUnauthorized');
    if (code === 'PASSWORD_MISMATCH') return t('passwordMismatch');
    if (/PASSWORD|CREDENTIAL/.test(code)) return t('errorPassword');
    if (/RATE|TOO_MANY/.test(code)) return t('errorRateLimit');
    if (/BUDGET|SPEND|PAYMENT|CONFIRM|PRICE/.test(code))
      return t('errorBudget');
    if (/FILE|SIZE|IMAGE|MIME|UPLOAD/.test(code)) return t('errorFile');
    if (/SOURCE/.test(code)) return t('errorSource');
    if (/SSRF|UNSAFE|URL/.test(code)) return t('errorUnsafe');
    if (/FFMPEG|ENCOD/.test(code)) return t('errorFfmpeg');
    if (/RUNWAY/.test(code)) return t('errorRunway');
    if (/PROVIDER|API_KEY|DISABLED/.test(code)) return t('errorProvider');
    if (/NOT_FOUND/.test(code)) return t('errorNotFound');
    if (/VALID|REQUEST/.test(code)) return t('errorValidation');
    if (/CONCURRENT|BUSY/.test(code)) return t('errorBusy');
    return t('errorGeneric');
  }
  const notify = (text: string, error = false) => setToast({ text, error });
  const reload = useCallback(async (initial = false) => {
    const data = await api('/api/bootstrap');
    setSnapshot(data);
    if (initial && data.settings) {
      setSettings(cleanSettings(data.settings));
      changeLocale(data.settings.locale);
    }
    return data;
  }, []);
  useEffect(() => {
    reload(true).catch((error) => notify(errorText(error), true));
  }, []);
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      reload().catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, [pending, reload]);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  async function action(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      notify(errorText(error), true);
      if (error instanceof ApiError && /UNAUTH|AUTH_REQUIRED/.test(error.code))
        await reload();
    } finally {
      setBusy('');
    }
  }
  async function updateSettings(patch: Partial<Settings>) {
    const allowed = Object.fromEntries(
      Object.entries(patch).filter(([key]) => key in defaults),
    );
    const data = await api('/api/settings', 'PATCH', allowed);
    setSettings(cleanSettings(data.settings));
    if (patch.locale) changeLocale(patch.locale);
    try {
      await reload();
    } catch {
      notify(t('savedRefreshFailed'));
    }
  }
  function navigate(value: string) {
    setPage(value);
    setMenuOpen(false);
  }
  function openProject(p: Project) {
    setSelectedId(p.id);
    setParameters({
      ...baseParameters(settings),
      ...p.parameters,
    } as Parameters);
    setEstimated(null);
    setPage(
      p.type === 'fashion'
        ? 'fashion'
        : p.type === 'lookbook'
          ? 'lookbook'
          : 'studio',
    );
    setPlayingJob(null);
  }
  function newProject() {
    setProjectName('');
    setProjectDescription('');
    setModal('create');
  }
  async function createProject() {
    const data = await api('/api/projects', 'POST', {
      name: projectName.trim() || t('unnamed'),
      type: 'product',
      description: projectDescription,
      parameters: baseParameters(settings),
    });
    await reload();
    setModal(null);
    openProject(data.project);
    notify(t('created'));
  }
  async function saveProject(quiet = false) {
    if (!project) return;
    await api(`/api/projects/${project.id}/product-state`, 'PATCH', {
      parameters: Object.fromEntries(
        Object.keys(baseParameters(settings))
          .filter((key) => parameters[key as keyof Parameters] !== undefined)
          .map((key) => [key, parameters[key as keyof Parameters]]),
      ),
    });
    try {
      await reload();
    } catch {
      notify(t('savedRefreshFailed'));
      return;
    }
    if (!quiet) notify(t('projectSaved'));
  }
  function setParam<K extends keyof Parameters>(key: K, value: Parameters[K]) {
    setParameters((prev) => ({ ...prev, [key]: value }));
    setEstimated(null);
  }
  async function uploadFiles(files: FileList | File[], role = 'SOURCE') {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set('file', file);
      form.set('role', role);
      if (selectedId && role === 'SOURCE') form.set('projectId', selectedId);
      const data = await api('/api/media', 'POST', form);
      if (role === 'SOURCE') setParam('sourceMediaId', data.media.id);
    }
    await reload();
    notify(t('uploaded'));
  }
  function chooseUpload(role = 'SOURCE') {
    setFileRole(role);
    setTimeout(() => inputRef.current?.click(), 0);
  }
  async function generate(exportJob?: Job) {
    if (!project || (!source && !exportJob)) {
      notify(t(!project ? 'projectRequired' : 'sourceRequired'), true);
      return;
    }
    await saveProject(true);
    const body = {
      projectId: project.id,
      sourceMediaId: source?.id,
      inputVideoId: exportJob?.outputMediaId,
      provider: exportJob ? 'local' : parameters.provider,
      prompt:
        parameters.provider === 'runway'
          ? `${parameters.prompt}\nCreative preset: ${parameters.preset}. Setting: ${parameters.decor}. Camera: ${parameters.camera}.`
          : parameters.prompt,
      durationSeconds: parameters.duration,
      format: parameters.format,
      resolution: parameters.resolution,
      codec: parameters.codec,
      quality: compressionQuality(parameters.quality),
      logoId: parameters.logoMediaId || null,
      logoSize: parameters.logoSize,
      logoOpacity: parameters.logoOpacity,
      logoPosition: parameters.logoPosition,
      logoFade: parameters.logoAnimation === 'fade',
      logoTiming: parameters.logoTiming,
      confirmedPaid: parameters.provider === 'runway',
      expectedCostCents: estimated,
    };
    const fingerprint = JSON.stringify(body);
    if (submissionRef.current?.fingerprint !== fingerprint)
      submissionRef.current = { fingerprint, key: crypto.randomUUID() };
    const result = await api(exportJob ? '/api/exports' : '/api/jobs', 'POST', {
      ...body,
      idempotencyKey: submissionRef.current.key,
    });
    submissionRef.current = null;
    setModal(null);
    setEstimated(null);
    // Acknowledged submission succeeded even if the subsequent refresh fails.
    // Add the job immediately so polling can recover without a second payment.
    setSnapshot((current) =>
      current
        ? {
            ...current,
            jobs: [
              result.job,
              ...(current.jobs || []).filter((job) => job.id !== result.job.id),
            ],
          }
        : current,
    );
    notify(t('jobStarted'));
    void reload().catch(() => {});
  }
  function outputUrl(job: Job) {
    return (
      job.outputUrl ||
      (job.outputMediaId ? `/api/media/${job.outputMediaId}` : '')
    );
  }
  const languageSwitch = (
    <div className="language-switch" aria-label={t('interfaceLanguage')}>
      {(['fr', 'en'] as Locale[]).map((l) => (
        <button
          key={l}
          className={locale === l ? 'active' : ''}
          disabled={!!busy}
          onClick={() => {
            changeLocale(l);
            if (snapshot?.authenticated)
              action('locale', () => updateSettings({ locale: l }));
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
  if (!snapshot)
    return (
      <div className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" size={24} />
        <p>{t('loading')}</p>
        {toast && <p role="alert">{toast.text}</p>}
      </div>
    );
  if (!snapshot.authenticated)
    return (
      <Auth
        setup={snapshot.needsSetup}
        languageSwitch={languageSwitch}
        onSuccess={async () => {
          await reload(true);
        }}
        onError={(error) => notify(errorText(error), true)}
        toast={toast}
        locale={locale}
      />
    );
  const title =
      page === 'studio'
        ? project?.name || t('studio')
        : t(page === 'dashboard' ? 'greeting' : page),
    subtitle =
      page === 'dashboard'
        ? t('intro')
        : page === 'studio'
          ? t('productVideo')
          : t(
              page === 'library'
                ? 'libraryDescription'
                : page === 'fashion'
                  ? 'fashionDescription'
                  : page === 'lookbook'
                    ? 'lookbookDescription'
                    : page === 'editor'
                      ? 'editorDescription'
                      : page === 'seo'
                        ? 'seoDescription'
                        : 'settingsDescription',
            );
  return (
    <div className="app-shell">
      <input
        ref={inputRef}
        className="visually-hidden"
        aria-label={t('upload')}
        type="file"
        accept={
          fileRole === 'LOGO'
            ? '.png,.jpg,.jpeg,.webp,.svg'
            : page === 'library' && fileRole === 'SOURCE'
              ? '.png,.jpg,.jpeg,.webp,.mp4,.mp3,.wav,.m4a'
              : '.png,.jpg,.jpeg,.webp'
        }
        multiple={page === 'library'}
        onChange={(e) => {
          if (e.target.files?.length) {
            const files = Array.from(e.target.files);
            action('upload', () => uploadFiles(files, fileRole));
          }
          e.target.value = '';
        }}
      />
      {menuOpen && (
        <button
          className="sidebar-scrim"
          aria-label={t('close')}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={cn('sidebar', menuOpen && 'sidebar-open')}>
        <Brand />
        <div className="sidebar-label">{t('nav')}</div>
        <nav aria-label={t('nav')}>
          {[
            { id: 'dashboard', icon: LayoutDashboard },
            { id: 'studio', icon: Clapperboard },
            { id: 'library', icon: FolderOpen },
            { id: 'fashion', icon: Shirt },
            { id: 'lookbook', icon: Layers3 },
            { id: 'editor', icon: Film },
            { id: 'seo', icon: ScanLine },
          ].map((item) => (
            <button
              key={item.id}
              className={cn('nav-item', page === item.id && 'active')}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>{t(item.id)}</span>
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="studio-note">
            <span className="studio-note-icon">
              <Sparkles size={19} />
            </span>
            <strong>{t('unlimitedInspiration')}</strong>
            <p>{t('local')}</p>
          </div>
          <button
            className={cn('nav-item', page === 'settings' && 'active')}
            onClick={() => navigate('settings')}
          >
            <Settings2 size={19} />
            <span>{t('settings')}</span>
          </button>
          <div className="profile">
            <div className="avatar">Y</div>
            <div>
              <strong>Yassdem Studio</strong>
              <span>
                <span className="green-dot" />
                {t('private')}
              </span>
            </div>
            <button
              aria-label={t('logout')}
              title={t('logout')}
              onClick={() =>
                action('logout', async () => {
                  await api('/api/auth/logout', 'POST');
                  await reload();
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label={t('menu')}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </Button>
            <span>Yassdem Studio</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{t(page === 'studio' ? 'studio' : page)}</strong>
          </div>
          <div className="topbar-actions">
            {languageSwitch}
            <span className="topbar-divider" />
            <button
              className="theme-toggle"
              aria-label={t('theme')}
              onClick={() =>
                action('theme', () =>
                  updateSettings({
                    theme: settings.theme === 'light' ? 'dark' : 'light',
                  }),
                )
              }
            >
              {settings.theme === 'light' ? (
                <Moon size={18} />
              ) : (
                <Sun size={18} />
              )}
            </button>
            <div className="avatar small">Y</div>
          </div>
        </header>
        <main className={cn('main', page === 'studio' && 'studio-main')}>
          <div className="page-heading">
            <div>
              {page === 'studio' && (
                <button
                  className="back-link"
                  onClick={() => navigate('dashboard')}
                >
                  <ArrowLeft size={13} />
                  {t('projects')}
                </button>
              )}
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="heading-actions">
              {page === 'dashboard' && (
                <Badge>
                  <span className="green-dot" />
                  {t('private')}
                </Badge>
              )}
              {page === 'library' ? (
                <Button onClick={() => chooseUpload()} disabled={!!busy}>
                  <Plus size={17} />
                  {t(busy === 'upload' ? 'uploading' : 'uploadMedia')}
                </Button>
              ) : page === 'settings' ? (
                <Button
                  onClick={() =>
                    action('settings', async () => {
                      await updateSettings(settings);
                      notify(t('saved'));
                    })
                  }
                  disabled={!!busy}
                >
                  <Check size={17} />
                  {t('save')}
                </Button>
              ) : page === 'studio' && project ? (
                <Button
                  variant="secondary"
                  onClick={() => action('save', () => saveProject())}
                  disabled={!!busy}
                >
                  <Check size={16} />
                  {t('saveProject')}
                </Button>
              ) : ['fashion', 'lookbook', 'editor', 'seo'].includes(
                  page,
                ) ? null : (
                <Button
                  onClick={newProject}
                  variant={page === 'dashboard' ? 'secondary' : 'primary'}
                >
                  <Plus size={17} />
                  {t(page === 'dashboard' ? 'advancedCreation' : 'newProject')}
                </Button>
              )}
            </div>
          </div>
          <div hidden={page !== 'dashboard'}>
            <QuickCreatePanel
              locale={locale}
              media={media}
              jobs={jobs}
              settings={snapshot?.settings || settings}
              onReload={reload}
              onQueued={({ project: createdProject, job }) => {
                setSnapshot((current) =>
                  current
                    ? {
                        ...current,
                        projects: [
                          createdProject,
                          ...(current.projects || []).filter(
                            (item) => item.id !== createdProject.id,
                          ),
                        ],
                        jobs: [
                          job,
                          ...(current.jobs || []).filter(
                            (item) => item.id !== job.id,
                          ),
                        ],
                      }
                    : current,
                );
              }}
              onOpenProject={(id) => {
                const target = projects.find((item) => item.id === id);
                if (target) openProject(target);
              }}
              onConfigure={() => {
                navigate('settings');
                requestAnimationFrame(() =>
                  document
                    .getElementById('local-creation-settings')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                );
              }}
            />
          </div>
          {page === 'dashboard' && (
            <>
              <section className="stats-grid">
                {[
                  {
                    label: 'projects',
                    value: projects.length,
                    icon: FolderOpen,
                  },
                  { label: 'assets', value: media.length, icon: ImageIcon },
                  {
                    label: 'completedVideos',
                    value: jobs.filter(
                      (j) =>
                        j.status === 'SUCCEEDED' &&
                        j.kind !== 'edit-preview' &&
                        media.some(
                          (m) =>
                            m.id === j.outputMediaId &&
                            m.mimeType.startsWith('video/'),
                        ),
                    ).length,
                    icon: Film,
                  },
                  { label: 'monthSpent', value: money(spent), icon: Wallet },
                ].map((stat) => (
                  <div className="stat-card" key={stat.label}>
                    <div>
                      <span>{t(stat.label)}</span>
                      <strong>{stat.value}</strong>
                      {stat.label === 'monthSpent' && (
                        <small>
                          {t('monthBudget')} :{' '}
                          {money(settings.monthlyBudgetCents)}
                          {' · '}
                          {t('reservedAmount', { value: money(reserved) })}
                        </small>
                      )}
                    </div>
                    <span className="stat-icon">
                      <stat.icon size={20} />
                    </span>
                  </div>
                ))}
              </section>
              <section className="projects-section">
                <div className="section-heading">
                  <h2>
                    {t('recentProjects')}
                    <span className="count-badge">{projects.length}</span>
                  </h2>
                  {projects.length > 3 && (
                    <button
                      className="text-link"
                      onClick={() => setModal('projects')}
                    >
                      {t('seeAll')}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                {projects.length ? (
                  <div className="project-grid">
                    {projects.slice(0, 3).map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        image={
                          media.find(
                            (m) => m.id === p.parameters.sourceMediaId,
                          ) ||
                          media.find(
                            (m) => m.projectId === p.id && m.role === 'SOURCE',
                          )
                        }
                        onOpen={() => openProject(p)}
                        onEdit={() => {
                          setProjectName(p.name);
                          setProjectDescription(p.description);
                          setModalId(p.id);
                          setModal('edit');
                        }}
                        onDuplicate={() =>
                          action('duplicate', async () => {
                            await api(
                              `/api/projects/${p.id}/duplicate`,
                              'POST',
                            );
                            await reload();
                            notify(t('duplicated'));
                          })
                        }
                        onDelete={() => {
                          setModal('deleteProject');
                          setModalId(p.id);
                        }}
                        date={date(p.updatedAt)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-projects">
                    <div className="empty-art">
                      <span className="empty-sheet back-sheet" />
                      <span className="empty-sheet">
                        <ImagePlus size={24} />
                        <span />
                        <span />
                      </span>
                      <span className="empty-plus">+</span>
                    </div>
                    <h3>{t('noProjects')}</h3>
                    <p>{t('noProjectsDescription')}</p>
                    <button className="text-link" onClick={newProject}>
                      <Plus size={15} />
                      {t('newProject')}
                    </button>
                  </div>
                )}
              </section>
              <section className="workflow-section">
                <div>
                  <span className="eyebrow">{t('quickStart')}</span>
                  <h2>{t('chooseWorkflow')}</h2>
                </div>
                <div className="workflow-grid">
                  <button className="workflow-card" onClick={newProject}>
                    <span className="workflow-icon">
                      <Clapperboard size={22} />
                    </span>
                    <div>
                      <h3>{t('productVideo')}</h3>
                      <p>{t('freeLocalDescription')}</p>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                  <button
                    className="workflow-card"
                    onClick={() => navigate('library')}
                  >
                    <span className="workflow-icon sage">
                      <ImageIcon size={22} />
                    </span>
                    <div>
                      <h3>{t('library')}</h3>
                      <p>{t('libraryDescription')}</p>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </section>
            </>
          )}
          {page === 'studio' &&
            (!project ? (
              <div className="studio-welcome panel">
                <div className="empty-icon">
                  <Clapperboard size={35} />
                </div>
                <h2>{t('noProjects')}</h2>
                <p>{t('noProjectsDescription')}</p>
                <Button onClick={newProject}>
                  <Plus size={17} />
                  {t('newProject')}
                </Button>
                <div className="project-picker">
                  {projects.map((p) => (
                    <button key={p.id} onClick={() => openProject(p)}>
                      <FolderOpen size={16} />
                      {p.name}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="composer-grid">
                <div className="composer-left">
                  <section className="panel preview-panel">
                    <div className="panel-heading">
                      <h2>
                        <ImageIcon size={17} />
                        {playingJob ? t('result') : t('sourceImage')}
                      </h2>
                      <Badge>
                        {playingJob ? 'MP4' : source ? 'IMAGE' : '01'}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        'preview-stage',
                        dragging && 'dragging',
                        source && 'has-image',
                      )}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (e.dataTransfer.files.length) {
                          const files = Array.from(e.dataTransfer.files);
                          action('upload', () => uploadFiles(files));
                        }
                      }}
                    >
                      {playingJob && outputUrl(playingJob) ? (
                        <video
                          src={outputUrl(playingJob)}
                          controls
                          playsInline
                          className="video-player"
                        />
                      ) : source ? (
                        <>
                          <img
                            className="source-preview"
                            src={source.url}
                            alt={source.name}
                          />
                          <span className="source-format">
                            {source.width} × {source.height}
                          </span>
                          <button
                            className="replace-source"
                            onClick={() => chooseUpload()}
                          >
                            <ImagePlus size={16} />
                            {t('upload')}
                          </button>
                        </>
                      ) : (
                        <div className="dropzone-content">
                          <div className="upload-illustration">
                            <UploadCloud size={34} strokeWidth={1.3} />
                          </div>
                          <h3>{t('dropImage')}</h3>
                          <button
                            className="text-link"
                            onClick={() => chooseUpload()}
                          >
                            {t('browseFiles')}
                          </button>
                          <p>{t('uploadDescription')}</p>
                          <div className="dropzone-divider">
                            <span />·<span />
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setModal('selectMedia')}
                            disabled={!images.length}
                          >
                            <FolderOpen size={15} />
                            {t('chooseFromLibrary')}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="preview-footer">
                      <ShieldCheck size={14} />
                      {t('imageSourceInfo')}
                      {source && (
                        <button
                          className="text-link"
                          onClick={() => {
                            setPlayingJob(null);
                            setModal('selectMedia');
                          }}
                        >
                          {t('chooseFromLibrary')}
                        </button>
                      )}
                    </div>
                    {playingJob && (
                      <div className="export-result">
                        <div>
                          <span>{t('nativeResolution')}</span>
                          <strong>
                            {playingJob.parameters?.nativeWidth
                              ? `${playingJob.parameters.nativeWidth} × ${playingJob.parameters.nativeHeight}`
                              : '—'}
                          </strong>
                        </div>
                        <div>
                          <span>{t('exportResolution')}</span>
                          <strong>
                            {playingJob.parameters?.exportWidth
                              ? `${playingJob.parameters.exportWidth} × ${playingJob.parameters.exportHeight}`
                              : '—'}
                          </strong>
                        </div>
                        {playingJob.parameters?.upscaled === true && (
                          <Badge tone="warning">{t('upscale')}</Badge>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            action('export', () => generate(playingJob))
                          }
                        >
                          <Download size={15} />
                          {t('export')}
                        </Button>
                      </div>
                    )}
                  </section>
                  <ProductImportPanel
                    locale={locale}
                    projectId={project.id}
                    projects={projects}
                    onRefresh={reload}
                    onImported={(files) => {
                      if (files[0]) {
                        setParam('sourceMediaId', files[0].id);
                        setPlayingJob(null);
                      }
                    }}
                  />
                  {parameters.provider !== 'replicate' && (
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          <Sparkles size={17} />
                          {t('prompt')}
                        </h2>
                        <span className="muted small-text">
                          {t('optional')}
                        </span>
                      </div>
                      <div className="panel-body">
                        <textarea
                          disabled={parameters.provider === 'local'}
                          className="input prompt-textarea"
                          value={parameters.prompt}
                          onChange={(e) => setParam('prompt', e.target.value)}
                          placeholder={t('promptPlaceholder')}
                          maxLength={900}
                        />
                        <p className="field-hint">
                          {t(
                            parameters.provider === 'local'
                              ? 'localExplanation'
                              : 'runwayExplanation',
                          )}
                        </p>
                      </div>
                    </section>
                  )}
                  <ModelCatalogPanel
                    locale={locale}
                    outputKind="video"
                    onSelectModel={(model) => {
                      if (
                        ['local', 'runway', 'replicate'].includes(
                          model.provider,
                        )
                      ) {
                        setParam('provider', model.provider);
                        if (
                          model.provider === 'runway' &&
                          parameters.duration > 10
                        )
                          setParam('duration', 10);
                      }
                    }}
                  />
                  <section className="panel jobs-panel">
                    <div className="panel-heading">
                      <h2>
                        <Film size={17} />
                        {t('jobs')}
                      </h2>
                      <Badge>{projectJobs.length}</Badge>
                    </div>
                    {!projectJobs.length ? (
                      <div className="empty-jobs">
                        <Film size={23} />
                        <p>{t('noJobs')}</p>
                      </div>
                    ) : (
                      <div className="job-list">
                        {projectJobs.map((job) => (
                          <div key={job.id} className="job-row">
                            <span
                              className={cn(
                                'job-icon',
                                job.status === 'SUCCEEDED' && 'finished',
                              )}
                            >
                              {job.status === 'SUCCEEDED' ? (
                                <CheckCircle2 size={19} />
                              ) : ['FAILED', 'CANCELLED', 'UNKNOWN'].includes(
                                  job.status,
                                ) ? (
                                <X size={19} />
                              ) : (
                                <LoaderCircle className="spin" size={19} />
                              )}
                            </span>
                            <div className="job-info">
                              <strong>
                                {job.provider === 'local'
                                  ? 'FFmpeg'
                                  : job.provider === 'replicate'
                                    ? 'Replicate'
                                    : 'Runway'}{' '}
                                <span>· {date(job.createdAt)}</span>
                              </strong>
                              <span>
                                {t(
                                  (
                                    {
                                      QUEUED: 'queued',
                                      RUNNING: 'running',
                                      PROCESSING: 'running',
                                      SUBMITTING: 'queued',
                                      EXPORTING: 'running',
                                      SUCCEEDED: 'succeeded',
                                      FAILED: 'failed',
                                      CANCELLED: 'canceled',
                                      UNKNOWN: 'unknownStatus',
                                    } as Record<string, string>
                                  )[job.status] || 'processing',
                                )}
                                {job.errorCode &&
                                  ` · ${errorText(job.errorCode)}`}
                              </span>
                              {ACTIVE.includes(job.status) && (
                                <div
                                  className="progress-track"
                                  role="progressbar"
                                  aria-label={t('progress')}
                                  aria-valuenow={job.progress}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <span
                                    style={{
                                      width: `${Math.max(3, job.progress)}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="job-actions">
                              {job.status === 'SUCCEEDED' && outputUrl(job) ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('showVideo')}
                                    onClick={() => setPlayingJob(job)}
                                  >
                                    <Play size={17} />
                                  </Button>
                                  <a
                                    className="button button-secondary button-icon"
                                    href={`${outputUrl(job)}?download=1`}
                                    aria-label={t('download')}
                                    download
                                  >
                                    <Download size={16} />
                                  </a>
                                </>
                              ) : (
                                ACTIVE.includes(job.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('cancelJob')}
                                    onClick={() =>
                                      action('cancelJob', async () => {
                                        await api(
                                          `/api/jobs/${job.id}`,
                                          'DELETE',
                                        );
                                        await reload();
                                        notify(t('cancelRequested'));
                                      })
                                    }
                                  >
                                    <X size={17} />
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
                <aside className="panel creative-panel">
                  <div className="panel-heading">
                    <h2>
                      <Settings2 size={17} />
                      {t('videoSettings')}
                    </h2>
                  </div>
                  <div className="creative-fields">
                    <Field label={t('provider')}>
                      <Select
                        value={parameters.provider}
                        onChange={(e) => {
                          setParam('provider', e.target.value);
                          if (
                            e.target.value === 'runway' &&
                            parameters.duration > 10
                          )
                            setParam('duration', 10);
                        }}
                      >
                        <option value="local">{t('providerLocal')}</option>
                        <option value="runway">{t('providerRunway')}</option>
                        <option
                          value="replicate"
                          disabled={!replicateVideoReady}
                        >
                          {t('providerReplicate')}
                        </option>
                      </Select>
                    </Field>
                    <div className="provider-hint">
                      <span
                        className={
                          parameters.provider === 'local'
                            ? 'green-dot'
                            : 'brand-dot'
                        }
                      />
                      {t(
                        parameters.provider === 'local'
                          ? 'freeLocal'
                          : parameters.provider === 'replicate'
                            ? snapshot.providers?.replicate?.configured &&
                              settings.replicateEnabled
                              ? 'enabled'
                              : 'providerNotReady'
                            : snapshot.providers?.runway.configured &&
                                settings.providerEnabled
                              ? 'enabled'
                              : 'providerNotReady',
                      )}
                    </div>
                    {parameters.provider === 'replicate' ? (
                      <>
                        <p className="field-hint">
                          {t('replicateVideoControls')}
                        </p>
                        <ProvidersPanel
                          locale={locale}
                          projects={projects}
                          media={media}
                          jobs={jobs}
                          settings={settings}
                          onUpdateSettings={updateSettings}
                          onRefresh={reload}
                          generationOnly
                          outputKind="video"
                          initialProjectId={project.id}
                          initialSourceMediaId={parameters.sourceMediaId}
                        />
                      </>
                    ) : (
                      <>
                        {parameters.provider === 'local' && (
                          <p className="field-hint">
                            {t('runwayOnlyControls')}
                          </p>
                        )}
                        <Field label={t('preset')}>
                          <Select
                            disabled={parameters.provider === 'local'}
                            value={parameters.preset}
                            onChange={(e) => setParam('preset', e.target.value)}
                          >
                            {[
                              ['luxury', 'presetLuxury'],
                              ['minimal', 'presetMinimal'],
                              ['handbag', 'presetHandbag'],
                              ['shoes', 'presetShoes'],
                              ['accessories', 'presetAccessories'],
                              ['pinterest', 'presetPinterest'],
                            ].map(([value, key]) => (
                              <option key={value} value={value}>
                                {t(key)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <div className="field-pair">
                          <Field label={t('decor')}>
                            <Select
                              disabled={parameters.provider === 'local'}
                              value={parameters.decor}
                              onChange={(e) =>
                                setParam('decor', e.target.value)
                              }
                            >
                              {[
                                ['cream', 'decorStudio'],
                                ['dark', 'decorDark'],
                                ['natural', 'decorNatural'],
                                ['marble', 'decorMarble'],
                              ].map(([v, k]) => (
                                <option value={v} key={v}>
                                  {t(k)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={t('camera')}>
                            <Select
                              disabled={parameters.provider === 'local'}
                              value={parameters.camera}
                              onChange={(e) =>
                                setParam('camera', e.target.value)
                              }
                            >
                              {[
                                ['zoom-in', 'cameraZoom'],
                                ['zoom-out', 'cameraZoomOut'],
                                ['pan', 'cameraPan'],
                                ['static', 'cameraStatic'],
                              ].map(([v, k]) => (
                                <option key={v} value={v}>
                                  {t(k)}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <Field label={t('format')}>
                          <div className="format-grid">
                            {[
                              ['9:16', 'vertical'],
                              ['4:5', 'portrait'],
                              ['1:1', 'square'],
                              ['16:9', 'landscape'],
                            ].map(([value, key]) => (
                              <button
                                key={value}
                                className={cn(
                                  'format-option',
                                  parameters.format === value && 'active',
                                )}
                                onClick={() => setParam('format', value)}
                              >
                                <span
                                  className="format-shape"
                                  style={{
                                    aspectRatio: value.replace(':', '/'),
                                  }}
                                />
                                <strong>{value}</strong>
                                <small>{t(key)}</small>
                              </button>
                            ))}
                          </div>
                        </Field>
                        <div className="field-pair">
                          <Field label={t('duration')}>
                            <Select
                              value={parameters.duration}
                              onChange={(e) =>
                                setParam('duration', Number(e.target.value))
                              }
                            >
                              {(parameters.provider === 'runway'
                                ? [5, 10]
                                : [5, 10, 15]
                              ).map((n) => (
                                <option value={n} key={n}>
                                  {t('seconds', { value: n })}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={t('resolution')}>
                            <Select
                              value={parameters.resolution}
                              onChange={(e) =>
                                setParam('resolution', Number(e.target.value))
                              }
                            >
                              {[720, 1080, 1440, 2160].map((n) => (
                                <option key={n} value={n}>
                                  {n}p{n === 2160 ? ' · 4K' : ''}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        </div>
                        <div className="source-resolution">
                          <Monitor size={14} />
                          <span>
                            {source
                              ? t('sourceDimensions', {
                                  width: source.width || 0,
                                  height: source.height || 0,
                                })
                              : t('sourceUnknown')}
                          </span>
                        </div>
                        {parameters.resolution > 720 && (
                          <p className="inline-notice">
                            <ScanLine size={16} />
                            {t('upscaleNotice')}
                          </p>
                        )}
                        <details className="advanced-settings">
                          <summary>
                            {t('exportQuality')}
                            <ChevronDown size={15} />
                          </summary>
                          <Field label={t('codec')}>
                            <Select
                              value={parameters.codec}
                              onChange={(e) =>
                                setParam('codec', e.target.value)
                              }
                            >
                              <option value="h264">H.264</option>
                              <option value="h265">H.265</option>
                            </Select>
                          </Field>
                          <Field label={t('compression')}>
                            <Select
                              value={parameters.quality}
                              onChange={(e) =>
                                setParam('quality', e.target.value)
                              }
                            >
                              <option value="high">
                                {t('compressionHigh')}
                              </option>
                              <option value="balanced">
                                {t('compressionBalanced')}
                              </option>
                              <option value="compressed">
                                {t('compressionSmall')}
                              </option>
                            </Select>
                          </Field>
                          <p className="field-hint">
                            {t('estimatedSize')} : ~
                            {estimatedMegabytes(parameters).toFixed(1)} MB
                          </p>
                          <p className="field-hint">{t('compressionNote')}</p>
                        </details>
                        <details className="advanced-settings">
                          <summary>
                            {t('brandKit')}
                            <ChevronDown size={15} />
                          </summary>
                          <Field label={t('logo')}>
                            <Select
                              value={parameters.logoMediaId}
                              onChange={(e) =>
                                setParam('logoMediaId', e.target.value)
                              }
                            >
                              <option value="">{t('noLogo')}</option>
                              {logos.map((logo) => (
                                <option key={logo.id} value={logo.id}>
                                  {logo.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          {parameters.logoMediaId && (
                            <>
                              <Field label={t('logoPosition')}>
                                <Select
                                  value={parameters.logoPosition}
                                  onChange={(e) =>
                                    setParam('logoPosition', e.target.value)
                                  }
                                >
                                  {[
                                    ['bottom-right', 'bottomRight'],
                                    ['bottom-left', 'bottomLeft'],
                                    ['top-right', 'topRight'],
                                    ['top-left', 'topLeft'],
                                    ['center', 'center'],
                                  ].map(([v, k]) => (
                                    <option key={v} value={v}>
                                      {t(k)}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <div className="field-pair">
                                <Field
                                  label={`${t('logoSize')} · ${parameters.logoSize}%`}
                                >
                                  <input
                                    type="range"
                                    min={5}
                                    max={40}
                                    value={parameters.logoSize}
                                    onChange={(e) =>
                                      setParam(
                                        'logoSize',
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </Field>
                                <Field
                                  label={`${t('opacity')} · ${Math.round(parameters.logoOpacity * 100)}%`}
                                >
                                  <input
                                    type="range"
                                    min={0.05}
                                    max={1}
                                    step={0.05}
                                    value={parameters.logoOpacity}
                                    onChange={(e) =>
                                      setParam(
                                        'logoOpacity',
                                        Number(e.target.value),
                                      )
                                    }
                                  />
                                </Field>
                              </div>
                              <Field label={t('logoAnimation')}>
                                <Select
                                  value={parameters.logoAnimation}
                                  onChange={(e) =>
                                    setParam('logoAnimation', e.target.value)
                                  }
                                >
                                  <option value="none">{t('none')}</option>
                                  <option value="fade">{t('fade')}</option>
                                </Select>
                              </Field>
                              <Field label={t('logoTiming')}>
                                <Select
                                  value={parameters.logoTiming || 'all'}
                                  onChange={(e) =>
                                    setParam('logoTiming', e.target.value)
                                  }
                                >
                                  <option value="all">{t('logoAll')}</option>
                                  <option value="start">
                                    {t('logoStart')}
                                  </option>
                                  <option value="end">{t('logoEnd')}</option>
                                </Select>
                              </Field>
                            </>
                          )}
                        </details>
                        <details className="advanced-settings">
                          <summary>
                            {t('styles')}
                            <ChevronDown size={15} />
                          </summary>
                          <p className="field-hint">{t('futureStyleNote')}</p>
                          {[
                            ['fit', 'styleFit'],
                            ['colors', 'styleColors'],
                            ['accessories', 'styleAccessories'],
                            ['coverage', 'styleCoverage'],
                            ['mood', 'styleMood'],
                            ['body', 'styleBody'],
                          ].map(([key, label]) => (
                            <Field key={key} label={t(label)}>
                              <Input
                                value={parameters.stylePreferences?.[key] || ''}
                                onChange={(e) =>
                                  setParam('stylePreferences', {
                                    ...parameters.stylePreferences,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            </Field>
                          ))}
                        </details>
                      </>
                    )}
                  </div>
                  {parameters.provider !== 'replicate' && (
                    <div className="generate-footer">
                      <div className="estimate-row">
                        <span>{t('estimate')}</span>
                        <strong>
                          {parameters.provider === 'local'
                            ? money(0)
                            : estimated !== null
                              ? money(estimated)
                              : '—'}
                        </strong>
                      </div>
                      {parameters.provider === 'runway' && (
                        <>
                          <Button
                            variant="secondary"
                            className="full-width"
                            disabled={!!busy}
                            onClick={() => {
                              const price =
                                snapshot.providers?.runway.costs[
                                  String(parameters.duration)
                                ];
                              setEstimated(
                                price?.eurCents ??
                                  Math.ceil(
                                    parameters.duration * 5 * settings.usdToEur,
                                  ),
                              );
                            }}
                          >
                            {t('estimateButton')}
                          </Button>
                          <p className="field-hint">{t('costDisclaimer')}</p>
                          <p className="field-hint">
                            {t('pricingAssumption', {
                              rate:
                                snapshot.settings?.usdToEur ??
                                settings.usdToEur,
                            })}
                          </p>
                        </>
                      )}
                      <Button
                        className="full-width generate-button"
                        disabled={
                          !!busy ||
                          !source ||
                          (parameters.provider === 'runway' &&
                            (!settings.providerEnabled ||
                              !snapshot.providers?.runway.configured ||
                              !settings.monthlyBudgetCents ||
                              estimated === null))
                        }
                        onClick={() =>
                          parameters.provider === 'runway'
                            ? setModal('paid')
                            : action('generate', () => generate())
                        }
                      >
                        {busy === 'generate' ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Sparkles size={17} />
                        )}{' '}
                        {t(
                          parameters.provider === 'local'
                            ? 'generateFree'
                            : 'generate',
                        )}
                      </Button>
                      <p className="generation-note">
                        <ShieldCheck size={12} />
                        {t(
                          parameters.provider === 'local'
                            ? 'freeLocal'
                            : 'budgetNote',
                        )}
                      </p>
                    </div>
                  )}
                </aside>
              </div>
            ))}
          {page === 'library' && (
            <>
              <div className="library-toolbar">
                <div className="segmented-control">
                  {['all', 'images', 'logos'].map((filter) => (
                    <button
                      className={mediaFilter === filter ? 'active' : ''}
                      onClick={() => setMediaFilter(filter)}
                      key={filter}
                    >
                      {t(filter === 'all' ? 'allMedia' : filter)}
                      <span>
                        {filter === 'all'
                          ? media.length
                          : filter === 'logos'
                            ? logos.length
                            : images.length}
                      </span>
                    </button>
                  ))}
                </div>
                <span className="muted small-text">
                  {t('libraryUploadDescription')}
                </span>
              </div>
              {!media.length ? (
                <div
                  className="library-empty panel"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length) {
                      const files = Array.from(e.dataTransfer.files);
                      action('upload', () => uploadFiles(files));
                    }
                  }}
                >
                  <div className="upload-illustration">
                    <ImagePlus size={36} strokeWidth={1.3} />
                  </div>
                  <h2>{t('noMedia')}</h2>
                  <p>{t('noMediaDescription')}</p>
                  <Button onClick={() => chooseUpload()}>
                    <Plus size={17} />
                    {t('uploadMedia')}
                  </Button>
                </div>
              ) : (
                <div className="media-grid">
                  {media
                    .filter(
                      (m) =>
                        mediaFilter === 'all' ||
                        (mediaFilter === 'logos'
                          ? m.role === 'LOGO'
                          : m.mimeType.startsWith('image/') &&
                            m.role !== 'LOGO'),
                    )
                    .map((item) => (
                      <article className="media-card" key={item.id}>
                        <div className="media-thumb">
                          {item.mimeType.startsWith('video/') ? (
                            <video src={item.url} preload="metadata" />
                          ) : item.mimeType.startsWith('audio/') ? (
                            <audio
                              src={item.url}
                              controls
                              preload="metadata"
                              style={{ width: '90%' }}
                            />
                          ) : (
                            <img src={item.url} alt={item.name} />
                          )}
                          <Badge>
                            {item.role === 'LOGO'
                              ? t('logo')
                              : item.mimeType.startsWith('video/')
                                ? 'MP4'
                                : item.mimeType.split('/')[1].toUpperCase()}
                          </Badge>
                          <button
                            className="media-delete"
                            aria-label={t('delete')}
                            onClick={() => {
                              setModalId(item.id);
                              setModal('deleteMedia');
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="media-info">
                          <strong>{item.name}</strong>
                          <span>
                            {item.width && item.height
                              ? `${item.width} × ${item.height} · `
                              : ''}
                            {(item.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                      </article>
                    ))}
                  <button
                    className="media-upload-card"
                    onClick={() =>
                      chooseUpload(mediaFilter === 'logos' ? 'LOGO' : 'SOURCE')
                    }
                  >
                    <Plus size={25} />
                    <span>
                      {t(mediaFilter === 'logos' ? 'addLogo' : 'uploadMedia')}
                    </span>
                  </button>
                </div>
              )}
              <ImageExportPanel
                locale={locale}
                media={media}
                projects={projects}
                onRefresh={reload}
              />
            </>
          )}
          {page === 'settings' && (
            <div className="settings-grid">
              <div className="settings-column">
                <SettingsPanel
                  icon={<Globe2 size={18} />}
                  title={t('languages')}
                >
                  <div className="field-pair">
                    <Field label={t('interfaceLanguage')}>
                      <Select
                        value={locale}
                        disabled={!!busy}
                        onChange={(e) => {
                          const value = e.target.value as Locale;
                          changeLocale(value);
                          setSettings((s) => ({ ...s, locale: value }));
                          action('locale', () =>
                            updateSettings({ locale: value }),
                          );
                        }}
                      >
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                    <Field label={t('contentLanguage')}>
                      <Select
                        value={settings.contentLocale}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            contentLocale: e.target.value as Locale,
                          }))
                        }
                      >
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                      </Select>
                    </Field>
                  </div>
                  <p className="field-hint">{t('languageNote')}</p>
                  <Field label={t('theme')}>
                    <div className="theme-options">
                      {(['light', 'dark'] as const).map((theme) => (
                        <button
                          key={theme}
                          onClick={() => setSettings((s) => ({ ...s, theme }))}
                          className={cn(
                            'theme-option',
                            settings.theme === theme && 'active',
                          )}
                        >
                          {theme === 'light' ? (
                            <Sun size={18} />
                          ) : (
                            <Moon size={18} />
                          )}
                          <span>{t(theme)}</span>
                          {settings.theme === theme && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </Field>
                </SettingsPanel>
                <SettingsPanel
                  icon={<Clapperboard size={18} />}
                  title={t('defaults')}
                >
                  <Field label={t('defaultProvider')}>
                    <Select
                      value={settings.defaultProvider}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          defaultProvider: e.target.value,
                        }))
                      }
                    >
                      <option value="local">{t('providerLocal')}</option>
                      <option value="runway">{t('providerRunway')}</option>
                      <option value="replicate" disabled={!replicateVideoReady}>
                        {t('providerReplicate')}
                      </option>
                    </Select>
                  </Field>
                  <div className="field-pair">
                    <Field label={t('resolution')}>
                      <Select
                        value={settings.preferredResolution}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            preferredResolution: Number(e.target.value),
                          }))
                        }
                      >
                        {[720, 1080, 1440, 2160].map((n) => (
                          <option key={n} value={n}>
                            {n}p{n === 2160 ? ' · 4K' : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('format')}>
                      <Select
                        value={settings.preferredFormat}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            preferredFormat: e.target.value,
                          }))
                        }
                      >
                        {['9:16', '4:5', '1:1', '16:9'].map((format) => (
                          <option value={format} key={format}>
                            {format}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <p className="field-hint">{t('nativeExportNote')}</p>
                </SettingsPanel>
                <SettingsPanel icon={<Shirt size={18} />} title={t('styles')}>
                  <p className="section-description">{t('stylesNote')}</p>
                  <div className="style-tags">
                    {[...STYLE_OPTIONS, ...settings.customStyles].map(
                      (style) => (
                        <button
                          className={cn(
                            'style-tag',
                            settings.preferredStyles.includes(style) &&
                              'active',
                          )}
                          key={style}
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              preferredStyles: s.preferredStyles.includes(style)
                                ? s.preferredStyles.filter(
                                    (value) => value !== style,
                                  )
                                : [...s.preferredStyles, style],
                            }))
                          }
                        >
                          {settings.preferredStyles.includes(style) && (
                            <Check size={12} />
                          )}{' '}
                          {style}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="custom-style">
                    <Input
                      aria-label={t('customStyle')}
                      placeholder={t('customStyle')}
                      value={customStyle}
                      onChange={(e) => setCustomStyle(e.target.value)}
                      maxLength={60}
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label={t('add')}
                      onClick={() => {
                        if (
                          customStyle.trim() &&
                          !settings.customStyles.includes(customStyle.trim())
                        )
                          setSettings((s) => ({
                            ...s,
                            customStyles: [
                              ...s.customStyles,
                              customStyle.trim(),
                            ],
                            preferredStyles: [
                              ...s.preferredStyles,
                              customStyle.trim(),
                            ],
                          }));
                        setCustomStyle('');
                      }}
                    >
                      <Plus size={18} />
                    </Button>
                  </div>
                  <label className="toggle-row">
                    <div>
                      <strong>{t('hijab')}</strong>
                      <p>{t('hijabNote')}</p>
                    </div>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings.hijab}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, hijab: e.target.checked }))
                      }
                    />
                  </label>
                  <p className="field-hint">{t('futureStyleNote')}</p>
                </SettingsPanel>
                <StylePresetsPanel locale={locale} />
              </div>
              <div className="settings-column">
                <SettingsPanel
                  icon={<Wallet size={18} />}
                  title={t('providersBudget')}
                >
                  <div className="connection-row">
                    <div className="provider-logo">R</div>
                    <div>
                      <strong>{t('runwayConnection')}</strong>
                      <span>
                        {connection === 'ok'
                          ? t('connected')
                          : snapshot.providers?.runway.configured
                            ? t('configured')
                            : t('notConfigured')}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!!busy}
                      onClick={() =>
                        action('connection', async () => {
                          try {
                            await api('/api/providers/runway/check', 'POST');
                            setConnection('ok');
                            notify(t('connectionSuccess'));
                          } catch (error) {
                            setConnection('error');
                            throw error;
                          }
                        })
                      }
                    >
                      {busy === 'connection' ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Zap size={14} />
                      )}{' '}
                      {t(busy === 'connection' ? 'testing' : 'testConnection')}
                    </Button>
                  </div>
                  <p className="field-hint api-note">
                    <LockKeyhole size={15} />
                    {t('apiKeyNote')}
                  </p>
                  <label className="toggle-row">
                    <div>
                      <strong>{t('paidEnabled')}</strong>
                    </div>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings.providerEnabled}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          providerEnabled: e.target.checked,
                        }))
                      }
                    />
                  </label>
                  <Field
                    label={`${t('monthBudget')} · EUR`}
                    hint={t('budgetHelp')}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      value={settings.monthlyBudgetCents / 100}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          monthlyBudgetCents: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        }))
                      }
                    />
                  </Field>
                  <Field label="USD → EUR" hint={t('exchangeNote')}>
                    <Input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.01}
                      value={settings.usdToEur}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          usdToEur: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  <div className="budget-meter">
                    <div>
                      <span>{t('usage')}</span>
                      <strong>
                        {money(committed)}{' '}
                        <small>/ {money(settings.monthlyBudgetCents)}</small>
                      </strong>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${settings.monthlyBudgetCents ? Math.min(100, (committed / settings.monthlyBudgetCents) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="field-hint">
                    {t('reservedAmount', { value: money(reserved) })}
                  </p>
                  <p className="field-hint">{t('budgetNote')}</p>
                </SettingsPanel>
                <div
                  id="local-creation-settings"
                  className="local-creation-settings"
                >
                  <SettingsPanel
                    icon={<Shirt size={18} />}
                    title={t('quickModelSetupTitle')}
                  >
                    <p className="section-description">
                      {t('quickModelSetupDescription')}
                    </p>
                    <a
                      className="text-link"
                      href="https://github.com/conceptafrobysyd-alt/Yassdem-Ai-Studio/blob/main/docs/OUTILS_GRATUITS.md"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('quickModelSetupGuide')}
                      <ArrowUpRight size={14} />
                    </a>
                  </SettingsPanel>
                  <ProvidersPanel
                    locale={locale}
                    projects={projects}
                    media={media}
                    jobs={jobs}
                    settings={settings}
                    onUpdateSettings={updateSettings}
                    onRefresh={reload}
                  />
                </div>
                <ModelCatalogPanel locale={locale} />
                <SettingsPanel
                  icon={<Palette size={18} />}
                  title={t('brandKit')}
                >
                  <p className="section-description">
                    {t('brandKitDescription')}
                  </p>
                  {logos.length > 0 ? (
                    <div className="logo-grid">
                      {logos.map((logo) => (
                        <button
                          className={cn(
                            'logo-option',
                            settings.activeLogoId === logo.id && 'active',
                          )}
                          key={logo.id}
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              activeLogoId:
                                s.activeLogoId === logo.id ? null : logo.id,
                            }))
                          }
                        >
                          <div>
                            <img src={logo.url} alt={logo.name} />
                            {settings.activeLogoId === logo.id && (
                              <span className="logo-check">
                                <Check size={12} />
                              </span>
                            )}
                          </div>
                          <span>{logo.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="no-logos">
                      <Palette size={24} />
                      <span>{t('noLogos')}</span>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => chooseUpload('LOGO')}
                    disabled={!!busy}
                  >
                    <Plus size={15} />
                    {t('addLogo')}
                  </Button>
                  <p className="field-hint">{t('logosHelp')}</p>
                  <div className="field-pair">
                    <Field label={`${t('logoSize')} · ${settings.logoSize}%`}>
                      <input
                        type="range"
                        min={5}
                        max={40}
                        value={settings.logoSize}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            logoSize: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label={`${t('opacity')} · ${Math.round(settings.logoOpacity * 100)}%`}
                    >
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={settings.logoOpacity}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            logoOpacity: Number(e.target.value),
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <Field label={t('logoPosition')}>
                    <Select
                      value={settings.logoPosition}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          logoPosition: e.target.value,
                        }))
                      }
                    >
                      {[
                        ['bottom-right', 'bottomRight'],
                        ['bottom-left', 'bottomLeft'],
                        ['top-right', 'topRight'],
                        ['top-left', 'topLeft'],
                        ['center', 'center'],
                      ].map(([v, k]) => (
                        <option key={v} value={v}>
                          {t(k)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </SettingsPanel>
                <SettingsPanel
                  icon={<ShieldCheck size={18} />}
                  title={t('backup')}
                >
                  <p className="section-description">
                    {t('backupDescription')}
                  </p>
                  <div className="backup-list">
                    {projects.map((item) => (
                      <a
                        key={item.id}
                        className="button button-secondary button-md"
                        href={`/api/projects/${item.id}/archive`}
                        download
                      >
                        <ArrowDownToLine size={16} />
                        {item.name}
                      </a>
                    ))}
                    {!projects.length && (
                      <p className="field-hint">{t('noProjectsDescription')}</p>
                    )}
                  </div>
                  <p className="field-hint">{t('securityNote')}</p>
                </SettingsPanel>
                <BrandPresetsPanel
                  locale={locale}
                  logos={logos}
                  onApply={async (preset) => {
                    await updateSettings({
                      activeLogoId: preset.logoMediaId,
                      logoSize: preset.logoSize,
                      logoOpacity: preset.logoOpacity,
                      logoPosition: preset.logoPosition,
                      logoFade: preset.logoFade,
                    });
                  }}
                />
              </div>
            </div>
          )}
          {(page === 'fashion' || page === 'lookbook') && (
            <FashionStudio
              locale={locale}
              defaultStyles={settings.preferredStyles}
              defaultHijab={settings.hijab}
              view={page}
              initialProjectId={selectedId}
              projects={projects}
              media={media}
              jobs={jobs}
              onRefresh={reload}
              onAnimate={(mediaId: string, projectId: string) => {
                const target = projects.find((p) => p.id === projectId);
                setSelectedId(projectId);
                setParameters({
                  ...baseParameters(settings),
                  ...target?.parameters,
                  sourceMediaId: mediaId,
                } as Parameters);
                setEstimated(null);
                setPlayingJob(null);
                setPage('studio');
              }}
            />
          )}
          {page === 'editor' && (
            <EditorStudio
              locale={locale}
              projects={projects}
              media={media}
              jobs={jobs}
              initialProjectId={selectedId}
              onRefresh={reload}
            />
          )}
          {page === 'seo' && (
            <SEOStudio
              locale={locale}
              defaultContentLocale={settings.contentLocale}
              projects={projects}
              onRefresh={reload}
            />
          )}
          <footer className="workspace-footer">
            <Brand compact />
            <span>{t('tagline')}</span>
            <span className="footer-private">
              <LockKeyhole size={12} />
              {t('private')}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={cn('toast', toast.error && 'toast-error')}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <X size={17} /> : <CheckCircle2 size={17} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label={t('close')}>
            <X size={15} />
          </button>
        </div>
      )}
      {(modal === 'create' || modal === 'edit') && (
        <Dialog
          title={t(modal === 'create' ? 'newProject' : 'projectDetails')}
          closeLabel={t('close')}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action('project', async () => {
                if (modal === 'create') await createProject();
                else {
                  await api(`/api/projects/${modalId}`, 'PATCH', {
                    name: projectName,
                    description: projectDescription,
                  });
                  await reload();
                  setModal(null);
                  notify(t('saved'));
                }
              });
            }}
          >
            <Field label={t('name')}>
              <Input
                autoFocus
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t('unnamed')}
                maxLength={120}
                required
              />
            </Field>
            <Field label={`${t('description')} · ${t('optional')}`}>
              <textarea
                className="input"
                rows={3}
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                maxLength={1000}
              />
            </Field>
            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setModal(null)}
              >
                {t('cancel')}
              </Button>
              <Button disabled={!!busy} type="submit">
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Plus size={16} />
                )}{' '}
                {t(modal === 'create' ? 'create' : 'save')}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {(modal === 'deleteProject' || modal === 'deleteMedia') && (
        <Dialog
          title={t(modal === 'deleteProject' ? 'deleteProject' : 'deleteMedia')}
          closeLabel={t('close')}
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">
            {t(
              modal === 'deleteProject'
                ? 'deleteProjectDescription'
                : 'mediaDeleteDescription',
            )}
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setModal(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() =>
                action('delete', async () => {
                  await api(
                    `/api/${modal === 'deleteProject' ? 'projects' : 'media'}/${modalId}`,
                    'DELETE',
                  );
                  await reload();
                  setModal(null);
                  notify(t('deleted'));
                })
              }
            >
              <Trash2 size={15} />
              {t('delete')}
            </Button>
          </div>
        </Dialog>
      )}
      {modal === 'selectMedia' && (
        <Dialog
          title={t('librarySelect')}
          closeLabel={t('close')}
          onClose={() => setModal(null)}
        >
          <div className="media-select-grid">
            {images.map((image) => (
              <button
                key={image.id}
                onClick={() => {
                  setParam('sourceMediaId', image.id);
                  setPlayingJob(null);
                  setModal(null);
                }}
              >
                <img src={image.url} alt={image.name} />
                <span>{image.name}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal === 'paid' && (
        <Dialog
          title={t('payConfirmTitle')}
          closeLabel={t('close')}
          onClose={() => setModal(null)}
        >
          <p className="dialog-description">{t('payConfirmText')}</p>
          <div className="paid-estimate">
            <span>{t('estimate')}</span>
            <strong>{money(estimated || 0)}</strong>
            <small>
              Runway Gen-4 Turbo ·{' '}
              {t('seconds', { value: parameters.duration })}
            </small>
          </div>
          <p className="field-hint">{t('costDisclaimer')}</p>
          <p className="field-hint">
            {t('pricingAssumption', {
              rate: snapshot.settings?.usdToEur ?? settings.usdToEur,
            })}
          </p>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setModal(null)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!!busy}
              onClick={() => action('generate', () => generate())}
            >
              <ShieldCheck size={16} />
              {t('confirmSpend')}
            </Button>
          </div>
        </Dialog>
      )}
      {modal === 'projects' && (
        <Dialog
          title={t('projects')}
          closeLabel={t('close')}
          onClose={() => setModal(null)}
        >
          <div className="project-picker">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  openProject(p);
                  setModal(null);
                }}
              >
                <FolderOpen size={17} />
                {p.name}
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn('brand', compact && 'brand-compact')}>
      <div className="brand-symbol">
        y<span>✦</span>
      </div>
      <div>
        <span className="brand-name">
          yassdem<span>.</span>
        </span>
        {!compact && <span className="brand-descriptor">AI STUDIO</span>}
      </div>
    </div>
  );
}
function Auth({
  setup,
  languageSwitch,
  onSuccess,
  onError,
  toast,
  locale,
}: {
  setup: boolean;
  languageSwitch: ReactNode;
  onSuccess: () => Promise<void>;
  onError: (error: unknown) => void;
  toast: { text: string; error?: boolean } | null;
  locale: Locale;
}) {
  const t = useTranslations();
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Brand />
        {languageSwitch}
      </div>
      <div className="auth-main">
        <div className="auth-story">
          <span className="eyebrow">{t('authEyebrow')}</span>
          <h1>
            {t('authTitle')
              .split('\n')
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </h1>
          <p>{t('authDescription')}</p>
          <div className="auth-art">
            <div className="auth-circle" />
            <div className="auth-arch">
              <Sparkles size={45} strokeWidth={0.7} />
              <span>Y</span>
              <small>YASSDEM AI STUDIO</small>
            </div>
            <div className="auth-small-circle" />
          </div>
        </div>
        <section className="auth-card">
          <div className="auth-icon">
            <LockKeyhole size={23} />
          </div>
          <h2>{t(setup ? 'authSetupTitle' : 'authLoginTitle')}</h2>
          <p>{t(setup ? 'authSetupDescription' : 'authLoginDescription')}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (setup && password !== confirmation) {
                onError(new ApiError('PASSWORD_MISMATCH'));
                return;
              }
              setBusy(true);
              try {
                await api(`/api/auth/${setup ? 'setup' : 'login'}`, 'POST', {
                  password,
                });
                if (setup) await api('/api/settings', 'PATCH', { locale });
                await onSuccess();
              } catch (error) {
                onError(error);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label={t('password')}
              hint={setup ? t('passwordHelp') : undefined}
            >
              <Input
                type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                value={password}
                minLength={setup ? 12 : 1}
                maxLength={256}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {setup && (
              <Field label={t('passwordConfirm')}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  minLength={12}
                  maxLength={256}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                />
              </Field>
            )}
            {toast && (
              <div className="auth-error" role="alert">
                {toast.text}
              </div>
            )}
            <Button type="submit" className="full-width" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowRight size={17} />
              )}{' '}
              {t(setup ? 'setup' : 'login')}
            </Button>
          </form>
          <div className="auth-privacy">
            <ShieldCheck size={14} />
            {t('authPrivacy')}
          </div>
        </section>
      </div>
      <footer className="auth-footer">
        Yassdem AI Studio <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
function SettingsPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <h2>
          {icon}
          {title}
        </h2>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
function ProjectCard({
  project,
  image,
  onOpen,
  onEdit,
  onDuplicate,
  onDelete,
  date,
}: {
  project: Project;
  image?: Media;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  date: string;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <article className="project-card">
      <button
        className="project-thumbnail"
        onClick={onOpen}
        aria-label={`${t('openProject')} ${project.name}`}
      >
        {image ? (
          <img src={image.url} alt={image.name} />
        ) : (
          <div className="project-placeholder">
            <Clapperboard size={32} strokeWidth={1} />
            <span>YASSDEM STUDIO</span>
          </div>
        )}
        <Badge>
          {t(
            project.type === 'fashion'
              ? 'fashion'
              : project.type === 'lookbook'
                ? 'lookbook'
                : 'productVideo',
          )}
        </Badge>
        <span className="project-open">
          <ArrowUpRight size={18} />
        </span>
      </button>
      <div className="project-card-info">
        <div>
          <button onClick={onOpen}>{project.name}</button>
          <span>
            {t('updatedOn')} {date}
          </span>
        </div>
        <div className="project-menu">
          <button aria-label={t('edit')} onClick={() => setOpen(!open)}>
            <MoreHorizontal size={20} />
          </button>
          {open && (
            <>
              <button
                className="menu-dismiss"
                aria-label={t('close')}
                onClick={() => setOpen(false)}
              />
              <div className="dropdown">
                {[
                  { label: 'edit', icon: Settings2, fn: onEdit },
                  { label: 'duplicate', icon: Copy, fn: onDuplicate },
                  { label: 'delete', icon: Trash2, fn: onDelete },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      setOpen(false);
                      item.fn();
                    }}
                  >
                    <item.icon size={15} />
                    {t(item.label)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
