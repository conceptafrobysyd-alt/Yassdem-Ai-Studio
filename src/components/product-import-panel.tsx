'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, LoaderCircle } from 'lucide-react';
import { Badge, Button, Field, Input, Select } from './ui/primitives';
import { productImportMessages } from '@/messages/product-import';
import './product-import.css';

type ImportedMedia = {
  id: string;
  name: string;
  url: string;
  width?: number | null;
  height?: number | null;
};
type ImportResult = {
  project: { id: string; name: string };
  media: ImportedMedia[];
  productReference: {
    name?: string;
    description?: string;
    productUrl?: string;
    structuredDataUrl?: string;
  };
};
type ImportBody = {
  source: 'shopify' | 'json';
  productUrl: string;
  structuredDataUrl?: string;
  authorized: true;
  replaceProjectName: boolean;
  idempotencyKey: string;
};
export type ProductImportPanelProps = {
  locale: 'fr' | 'en';
  projectId?: string;
  projects?: { id: string; name: string }[];
  onRefresh: () => Promise<unknown>;
  onImported?: (media: ImportedMedia[]) => void;
};
export function ProductImportPanel({
  locale,
  projectId,
  projects = [],
  onRefresh,
  onImported,
}: ProductImportPanelProps) {
  const t = productImportMessages[locale];
  const [selectedId, setSelectedId] = useState(
    projectId || projects[0]?.id || '',
  );
  const [productUrl, setProductUrl] = useState('');
  const [source, setSource] = useState<'shopify' | 'json'>('shopify');
  const [structuredDataUrl, setStructuredDataUrl] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [replaceProjectName, setReplaceProjectName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [errorCode, setErrorCode] = useState('');
  const [notice, setNotice] = useState<'imported' | 'refreshFailed' | ''>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef<{
    projectId: string;
    fingerprint: string;
    body: ImportBody;
  } | null>(null);
  const acceptedFingerprint = useRef('');
  const [accepted, setAccepted] = useState('');
  const fingerprint = JSON.stringify({
    projectId: selectedId,
    source,
    productUrl: productUrl.trim(),
    structuredDataUrl: source === 'json' ? structuredDataUrl.trim() : undefined,
    replaceProjectName,
  });
  useEffect(() => {
    if (!busy && !uncertain && projectId && projectId !== selectedId) {
      setSelectedId(projectId);
      setResult(null);
      setNotice('');
      setErrorCode('');
    }
  }, [projectId]); // Follow parent navigation, not changes to this panel's own picker.
  useEffect(() => {
    if (!selectedId && projects[0]) setSelectedId(projects[0].id);
  }, [projects, selectedId]);
  const availableProjects =
    projects.some((item) => item.id === selectedId) || !selectedId
      ? projects
      : [...projects, { id: selectedId, name: selectedId }];
  const errorText = (code: string) =>
    code === 'AUTH_REQUIRED' || code === 'UNAUTHORIZED'
      ? t.auth
      : code in t
        ? t[code as keyof typeof t]
        : t.error;
  function change() {
    if (!uncertain) {
      setErrorCode('');
      setNotice('');
      acceptedFingerprint.current = '';
      setAccepted('');
    }
  }
  async function importProduct() {
    if (
      busyRef.current ||
      !selectedId ||
      !authorized ||
      !productUrl.trim() ||
      (source === 'json' && !structuredDataUrl.trim())
    )
      return;
    if (acceptedFingerprint.current === fingerprint) return;
    if (
      !requestRef.current ||
      (!uncertain && requestRef.current.fingerprint !== fingerprint)
    ) {
      requestRef.current = {
        projectId: selectedId,
        fingerprint,
        body: {
          source,
          productUrl: productUrl.trim(),
          ...(source === 'json'
            ? { structuredDataUrl: structuredDataUrl.trim() }
            : {}),
          authorized: true,
          replaceProjectName,
          idempotencyKey: crypto.randomUUID(),
        },
      };
    }
    const pending = requestRef.current;
    busyRef.current = true;
    setBusy(true);
    setErrorCode('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(pending.projectId)}/product-import`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pending.body),
        },
      );
      let data: ImportResult & { error?: { code?: string } };
      try {
        data = await response.json();
      } catch {
        setUncertain(true);
        return;
      }
      if (!response.ok) {
        setErrorCode(data.error?.code || 'error');
        // An acknowledged rejection allows correcting the fields. Server errors
        // remain ambiguous and keep the exact request/key for a safe retry.
        if (
          response.status < 500 ||
          data.error?.code?.startsWith('PRODUCT_IMPORT_')
        ) {
          setUncertain(false);
          requestRef.current = null;
        } else setUncertain(true);
        return;
      }
      setResult(data);
      acceptedFingerprint.current = pending.fingerprint;
      setAccepted(pending.fingerprint);
      setUncertain(false);
      setNotice('imported');
      try {
        onImported?.(data.media);
        await onRefresh();
      } catch {
        setNotice('refreshFailed');
      }
    } catch {
      setUncertain(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const blocked = busy || uncertain;
  return (
    <section
      className="panel product-import-panel"
      aria-labelledby="product-import-title"
    >
      <div className="panel-heading">
        <h2 id="product-import-title">
          <Link2 size={17} />
          {t.title}
        </h2>
        <Badge>{t.free}</Badge>
      </div>
      <div className="panel-body">
        <p className="section-description">{t.description}</p>
        {!availableProjects.length ? (
          <p className="field-hint">{t.noProject}</p>
        ) : (
          <>
            <fieldset className="product-import-fields" disabled={blocked}>
              <Field label={t.project}>
                <Select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setResult(null);
                    change();
                  }}
                >
                  <option value="">{t.chooseProject}</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.source}>
                <Select
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value as 'shopify' | 'json');
                    change();
                  }}
                >
                  <option value="shopify">{t.shopify}</option>
                  <option value="json">{t.json}</option>
                </Select>
              </Field>
              <Field label={t.productUrl} hint={t.productUrlHint}>
                <Input
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  maxLength={2048}
                  value={productUrl}
                  onChange={(event) => {
                    setProductUrl(event.target.value);
                    change();
                  }}
                />
              </Field>
              {source === 'json' ? (
                <Field label={t.dataUrl} hint={t.dataUrlHint}>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    maxLength={2048}
                    value={structuredDataUrl}
                    onChange={(event) => {
                      setStructuredDataUrl(event.target.value);
                      change();
                    }}
                  />
                </Field>
              ) : (
                <p className="field-hint">{t.shopifyHint}</p>
              )}
              <label className="product-import-checkbox">
                <input
                  type="checkbox"
                  checked={replaceProjectName}
                  onChange={(event) => {
                    setReplaceProjectName(event.target.checked);
                    change();
                  }}
                />
                <span>{t.replaceName}</span>
              </label>
              <label className="product-import-checkbox product-import-authorization">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(event) => {
                    setAuthorized(event.target.checked);
                    change();
                  }}
                />
                <span>{t.authorized}</span>
              </label>
            </fieldset>
            <details className="product-import-help">
              <summary>{t.feedHelp}</summary>
              <p>{t.feedDescription}</p>
              <p>{t.feedLimits}</p>
              <code>
                {'{"name":"…","description":"…","images":["https://…"]}'}
              </code>
            </details>
            <p className="field-hint">{t.manual}</p>
            {uncertain && (
              <p className="product-import-pending" role="status">
                {t.retryHint}
              </p>
            )}
            <Button
              disabled={
                busy ||
                !authorized ||
                !selectedId ||
                !productUrl.trim() ||
                (source === 'json' && !structuredDataUrl.trim()) ||
                accepted === fingerprint
              }
              onClick={() => void importProduct()}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Link2 size={16} />
              )}
              {busy ? t.importing : uncertain ? t.retry : t.import}
            </Button>
          </>
        )}
        {notice && (
          <p className="product-import-notice" role="status">
            <CheckCircle2 size={15} />
            {t[notice]}
          </p>
        )}
        {errorCode && (
          <p className="product-import-error" role="alert">
            {errorText(errorCode)}
          </p>
        )}
        {result && (
          <div className="product-import-result">
            <div className="product-import-result-heading">
              <div>
                <strong>
                  {result.productReference.name || result.project.name}
                </strong>
                <p>
                  {t.savedIn} : {result.project.name}
                </p>
              </div>
              {result.productReference.productUrl && (
                <a
                  href={result.productReference.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button-secondary button-sm"
                >
                  <ExternalLink size={14} />
                  {t.viewProduct}
                </a>
              )}
            </div>
            {result.productReference.description && (
              <p className="product-import-description">
                {result.productReference.description}
              </p>
            )}
            <ul className="product-import-images" aria-label={t.importedImages}>
              {result.media.map((item) => (
                <li key={item.id}>
                  <img src={item.url} alt={item.name} />
                  <strong>{item.name}</strong>
                  {item.width && item.height ? (
                    <span>
                      {item.width} × {item.height}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
