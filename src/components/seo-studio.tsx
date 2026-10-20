'use client';
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react';
import { Badge, Button, Field, Input, Select } from './ui/primitives';
import { seoMessages } from '@/messages/seo';
import type { SeoDocument, SeoInput, SeoLanguage, SeoVersion } from '@/lib/seo';
import './seo.css';

type SeoProject = {
  id: string;
  name: string;
  type?: string;
  parameters?: Record<string, unknown>;
};
type Props = {
  locale: SeoLanguage;
  defaultContentLocale?: SeoLanguage;
  projects: SeoProject[];
  onRefresh: () => Promise<unknown>;
};
const initialInput = (language: SeoLanguage = 'fr'): SeoInput => ({
  productName: '',
  brand: '',
  category: '',
  features: [],
  audience: '',
  keywords: [],
  url: '',
  affiliateUrl: '',
  adDisclosure: '',
  language,
});
async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.code || 'seoError');
  return data;
}
function lines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
function commas(text: string) {
  return text
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function SEOStudio({
  locale,
  defaultContentLocale = 'fr',
  projects,
  onRefresh,
}: Props) {
  const t = seoMessages[locale];
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [input, setInput] = useState<SeoInput>(() =>
    initialInput(defaultContentLocale),
  );
  const [createdProject, setCreatedProject] = useState<SeoProject | null>(null);
  const availableProjects =
    createdProject &&
    !projects.some((project) => project.id === createdProject.id)
      ? [...projects, createdProject]
      : projects;
  const [features, setFeatures] = useState('');
  const [keywords, setKeywords] = useState('');
  const [mode, setMode] = useState<'local' | 'ollama'>('local');
  const [document, setDocument] = useState<SeoDocument | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<SeoLanguage>('fr');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [error, setError] = useState('');
  const translateError = (value: unknown) => {
    const code = value instanceof Error ? value.message : 'seoError';
    return code in t ? t[code as keyof typeof t] : t.seoError;
  };
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setDocument(null);
    setDirty(false);
    setNotice('');
    setRefreshWarning(false);
    requestJson(`/api/seo/${encodeURIComponent(projectId)}`)
      .then((data) => {
        if (cancelled) return;
        const saved = data.document as SeoDocument | null;
        const draft = saved?.input ?? initialInput(defaultContentLocale);
        setDocument(saved);
        setInput(draft);
        setFeatures(draft.features.join('\n'));
        setKeywords(draft.keywords.join(', '));
        setMode(saved?.source ?? 'local');
        setActiveLanguage(saved?.versions[0]?.language ?? defaultContentLocale);
      })
      .catch((value) => {
        if (!cancelled) setError(translateError(value));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Interface language must never change the content language or overwrite a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    if (
      projectId &&
      !availableProjects.some((project) => project.id === projectId)
    ) {
      setProjectId(availableProjects[0]?.id ?? '');
      setDocument(null);
      setDirty(false);
    }
  }, [projects, createdProject, projectId]);
  const setField = (key: keyof SeoInput, value: string) =>
    setInput((previous) => ({ ...previous, [key]: value }));
  async function createProject() {
    if (!newName.trim()) return;
    setBusy(true);
    setError('');
    setRefreshWarning(false);
    try {
      const result = await requestJson('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), type: 'product' }),
      });
      setCreatedProject(result.project);
      setProjectId(result.project.id);
      setShowCreate(false);
      setNewName('');
      try {
        await onRefresh();
      } catch {
        setRefreshWarning(true);
      }
    } catch (value) {
      setError(translateError(value));
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!input.productName.trim() || !input.category.trim()) {
      setError(t.required);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setRefreshWarning(false);
    try {
      const result = await requestJson(
        `/api/seo/${encodeURIComponent(projectId)}`,
        {
          method: 'POST',
          body: JSON.stringify({
            input: {
              ...input,
              features: lines(features),
              keywords: commas(keywords),
            },
            mode,
          }),
        },
      );
      setDocument(result.document);
      setActiveLanguage(result.document.versions[0].language);
      setDirty(false);
      setNotice(t.saved);
      try {
        await onRefresh();
      } catch {
        setRefreshWarning(true);
      }
    } catch (value) {
      setError(translateError(value));
    } finally {
      setBusy(false);
    }
  }
  function editVersion(
    key: keyof Omit<SeoVersion, 'language'>,
    value: string,
    index?: number,
  ) {
    setDocument((previous) =>
      previous
        ? {
            ...previous,
            versions: previous.versions.map((version) => {
              if (version.language !== activeLanguage) return version;
              if (key === 'titles' || key === 'descriptions')
                return {
                  ...version,
                  [key]: version[key].map((text, i) =>
                    i === index ? value : text,
                  ),
                };
              if (key === 'secondaryKeywords')
                return { ...version, secondaryKeywords: commas(value) };
              return { ...version, [key]: value };
            }),
          }
        : null,
    );
    setDirty(true);
    setNotice('');
  }
  async function save() {
    if (!document) return;
    setBusy(true);
    setError('');
    setNotice('');
    setRefreshWarning(false);
    try {
      const data = await requestJson(
        `/api/seo/${encodeURIComponent(projectId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ versions: document.versions }),
        },
      );
      setDocument(data.document);
      setDirty(false);
      setNotice(t.saved);
      try {
        await onRefresh();
      } catch {
        setRefreshWarning(true);
      }
    } catch (value) {
      setError(translateError(value));
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t.copied);
      setError('');
    } catch {
      setError(t.clipboardError);
    }
  }
  async function download(format: 'json' | 'csv' | 'zip') {
    setError('');
    try {
      const url =
        format === 'zip'
          ? `/api/projects/${encodeURIComponent(projectId)}/archive`
          : `/api/seo/${encodeURIComponent(projectId)}/export?format=${format}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      const href = URL.createObjectURL(await response.blob());
      const anchor = globalThis.document.createElement('a');
      anchor.href = href;
      anchor.download = `yassdem-${format === 'zip' ? 'project' : 'seo'}-${projectId}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setError(t.downloadError);
    }
  }
  const current = document?.versions.find(
    (version) => version.language === activeLanguage,
  );
  const blocked = busy || loading;
  const outputField = (
    label: string,
    key: keyof Omit<SeoVersion, 'language'>,
    value: string,
    max: number,
    index?: number,
    multiline = false,
  ) => (
    <div className="seo-output-field" key={`${key}-${index ?? ''}`}>
      <div className="seo-output-label">
        <span>{label}</span>
        <span className={value.length > max ? 'seo-over-limit' : ''}>
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          className="input seo-textarea"
          aria-label={label}
          value={value}
          maxLength={max}
          disabled={blocked}
          onChange={(event) => editVersion(key, event.target.value, index)}
          rows={key === 'descriptions' ? 4 : 3}
        />
      ) : (
        <Input
          aria-label={label}
          value={value}
          maxLength={max}
          disabled={blocked}
          onChange={(event) => editVersion(key, event.target.value, index)}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        className="seo-copy"
        onClick={() => copy(value)}
        disabled={!value}
      >
        <Copy size={13} />
        {t.copy}
      </Button>
    </div>
  );
  return (
    <div className="seo-studio">
      <div className="seo-heading">
        <div>
          <p className="seo-eyebrow">{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <Badge tone="brand">FR / EN</Badge>
      </div>
      <div className="seo-project-bar">
        <Field label={t.project}>
          <Select
            value={projectId}
            disabled={blocked}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">{t.chooseProject}</option>
            {availableProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          onClick={() => setShowCreate(!showCreate)}
          disabled={blocked}
        >
          <Plus size={16} />
          {t.newProject}
        </Button>
      </div>
      {showCreate && (
        <div className="seo-create">
          <Field label={t.projectName}>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={150}
              disabled={busy}
            />
          </Field>
          <Button onClick={createProject} disabled={busy || !newName.trim()}>
            {t.createProject}
          </Button>
        </div>
      )}
      {error && (
        <div className="seo-alert seo-alert-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="seo-alert seo-alert-success" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {refreshWarning && (
        <div className="seo-alert" role="status">
          <span>
            {locale === 'fr'
              ? 'Enregistrement effectué. Le rafraîchissement a échoué ; inutile de recommencer l’opération.'
              : 'Saved successfully. Refreshing failed; there is no need to repeat the operation.'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void onRefresh()
                .then(() => setRefreshWarning(false))
                .catch(() => {});
            }}
          >
            {locale === 'fr' ? 'Rafraîchir' : 'Refresh'}
          </Button>
        </div>
      )}
      <div className="seo-columns">
        <section className="panel seo-brief">
          <div className="panel-heading">
            <h2>
              <FileText size={17} />
              {t.brief}
            </h2>
          </div>
          <div className="panel-body">
            <p className="seo-muted">{t.briefHint}</p>
            <fieldset disabled={blocked || !projectId}>
              <Field label={t.productName}>
                <Input
                  value={input.productName}
                  onChange={(event) =>
                    setField('productName', event.target.value)
                  }
                  maxLength={100}
                  required
                />
              </Field>
              <div className="seo-field-pair">
                <Field label={t.brand}>
                  <Input
                    value={input.brand}
                    onChange={(event) => setField('brand', event.target.value)}
                    maxLength={80}
                  />
                </Field>
                <Field label={t.category}>
                  <Input
                    value={input.category}
                    onChange={(event) =>
                      setField('category', event.target.value)
                    }
                    maxLength={80}
                    required
                  />
                </Field>
              </div>
              <Field label={t.features} hint={t.featuresHint}>
                <textarea
                  className="input seo-textarea"
                  rows={4}
                  value={features}
                  onChange={(event) => setFeatures(event.target.value)}
                  maxLength={1287}
                />
              </Field>
              <Field label={t.audience}>
                <Input
                  value={input.audience}
                  onChange={(event) => setField('audience', event.target.value)}
                  maxLength={100}
                />
              </Field>
              <Field label={t.keywords} hint={t.keywordsHint}>
                <Input
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  maxLength={619}
                />
              </Field>
              <Field label={t.url}>
                <Input
                  type="url"
                  placeholder="https://…"
                  value={input.url}
                  onChange={(event) => setField('url', event.target.value)}
                  maxLength={2048}
                />
              </Field>
              <Field label={t.affiliateUrl}>
                <Input
                  type="url"
                  placeholder="https://…"
                  value={input.affiliateUrl}
                  onChange={(event) =>
                    setField('affiliateUrl', event.target.value)
                  }
                  maxLength={2048}
                />
              </Field>
              <Field label={t.disclosure} hint={t.disclosureHint}>
                <Input
                  value={input.adDisclosure}
                  onChange={(event) =>
                    setField('adDisclosure', event.target.value)
                  }
                  maxLength={120}
                  required={Boolean(input.affiliateUrl)}
                />
              </Field>
              <Field label={t.contentLanguage} hint={t.contentLanguageHint}>
                <Select
                  value={input.language}
                  onChange={(event) => setField('language', event.target.value)}
                >
                  <option value="fr">{t.french}</option>
                  <option value="en">{t.english}</option>
                  <option value="both">{t.both}</option>
                </Select>
              </Field>
              <Field label={t.mode}>
                <Select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as 'local' | 'ollama')
                  }
                >
                  <option value="local">{t.local}</option>
                  <option value="ollama">{t.ollama}</option>
                </Select>
              </Field>
              <p className="seo-method">
                {mode === 'local' ? t.localNotice : t.ollamaNotice}
              </p>
              <Button
                className="seo-generate"
                onClick={generate}
                disabled={!projectId || blocked}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {busy ? t.working : document ? t.regenerating : t.generate}
              </Button>
            </fieldset>
          </div>
        </section>
        <section className="panel seo-results">
          <div className="panel-heading">
            <h2>{t.results}</h2>
            {document && (
              <Badge tone="brand">
                {document.source === 'local' ? t.sourceLocal : t.sourceOllama}
              </Badge>
            )}
          </div>
          {!document || !current ? (
            <div className="seo-empty">
              {loading ? (
                <LoaderCircle size={28} className="spin" />
              ) : (
                <FileText size={34} />
              )}
              <h3>{loading ? t.working : t.noContent}</h3>
              <p>{t.noContentHint}</p>
            </div>
          ) : (
            <div className="panel-body">
              <p className="seo-muted">{t.review}</p>
              <div
                className="seo-language-tabs"
                role="tablist"
                aria-label={t.contentLanguage}
              >
                {document.versions.map((version) => (
                  <button
                    key={version.language}
                    role="tab"
                    id={`seo-tab-${version.language}`}
                    aria-controls="seo-output-panel"
                    aria-selected={activeLanguage === version.language}
                    className={
                      activeLanguage === version.language ? 'active' : ''
                    }
                    onClick={() => setActiveLanguage(version.language)}
                  >
                    {version.language === 'fr' ? t.french : t.english}
                  </button>
                ))}
              </div>
              <div
                id="seo-output-panel"
                role="tabpanel"
                aria-labelledby={`seo-tab-${activeLanguage}`}
              >
                {current.titles.map((title, index) =>
                  outputField(
                    `${t.titleVariant} ${index + 1}`,
                    'titles',
                    title,
                    100,
                    index,
                  ),
                )}
                {current.descriptions.map((description, index) =>
                  outputField(
                    `${t.descriptionVariant} ${index + 1}`,
                    'descriptions',
                    description,
                    500,
                    index,
                    true,
                  ),
                )}
                <div className="seo-field-pair">
                  {outputField(
                    t.primaryKeyword,
                    'primaryKeyword',
                    current.primaryKeyword,
                    60,
                  )}
                  {outputField(t.board, 'board', current.board, 50)}
                </div>
                <div className="seo-output-field">
                  <Field label={t.secondaryKeywords} hint={t.keywordsHint}>
                    <Input
                      key={`${activeLanguage}-${document.updatedAt}`}
                      defaultValue={current.secondaryKeywords.join(', ')}
                      disabled={blocked}
                      onChange={(event) =>
                        editVersion('secondaryKeywords', event.target.value)
                      }
                      maxLength={494}
                    />
                  </Field>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="seo-copy"
                    onClick={() => copy(current.secondaryKeywords.join(', '))}
                  >
                    <Copy size={13} />
                    {t.copy}
                  </Button>
                </div>
                {outputField(t.cta, 'cta', current.cta, 100)}
                {outputField(
                  t.altText,
                  'altText',
                  current.altText,
                  500,
                  undefined,
                  true,
                )}
                {outputField(
                  t.disclosure,
                  'adDisclosure',
                  current.adDisclosure,
                  200,
                )}
              </div>
              <div className="seo-save-bar">
                <Button onClick={save} disabled={blocked || !dirty}>
                  <Save size={15} />
                  {t.save}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => copy(JSON.stringify(document, null, 2))}
                >
                  <Copy size={15} />
                  {t.copyAll}
                </Button>
                {dirty && <Badge tone="warning">{t.dirty}</Badge>}
              </div>
              <div className="seo-export">
                <div className="seo-export-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={blocked || dirty}
                    onClick={() => download('json')}
                  >
                    <Download size={14} />
                    {t.exportJson}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={blocked || dirty}
                    onClick={() => download('csv')}
                  >
                    <Download size={14} />
                    {t.exportCsv}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={blocked || dirty}
                    onClick={() => download('zip')}
                  >
                    <Download size={14} />
                    {t.archive}
                  </Button>
                </div>
                <p>{dirty ? t.exportSaved : t.exportHint}</p>
                <p>{t.archiveHint}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
