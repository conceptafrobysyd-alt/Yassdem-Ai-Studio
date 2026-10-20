'use client';
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Button, Field, Select } from './ui/primitives';
import { providerMessages } from '@/messages/providers';
import type { ProviderStatus } from '@/lib/providers/registry';
import './providers.css';

type ProviderMedia = {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
  width?: number | null;
  height?: number | null;
};
type ProviderJob = {
  id: string;
  projectId: string;
  provider: string;
  kind: string;
  status: string;
  progress: number;
  outputMediaId?: string | null;
  estimatedCostCents: number;
  reservedCents?: number;
  errorCode?: string | null;
  createdAt: string | Date;
};
export type ProvidersPanelProps = {
  locale: 'fr' | 'en';
  projects: { id: string; name: string }[];
  media: ProviderMedia[];
  jobs: ProviderJob[];
  settings: { replicateEnabled: boolean; monthlyBudgetCents: number };
  onUpdateSettings: (patch: { replicateEnabled: boolean }) => Promise<unknown>;
  onRefresh: () => Promise<unknown>;
};
class RequestError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(
      data.error?.code ?? 'PROVIDER_ERROR',
      response.status,
    );
  return data;
}
const activeStatuses = [
  'QUEUED',
  'PROCESSING',
  'SUBMITTING',
  'RUNNING',
  'EXPORTING',
];

export function ProvidersPanel({
  locale,
  projects,
  media,
  jobs,
  settings,
  onUpdateSettings,
  onRefresh,
}: ProvidersPanelProps) {
  const t = providerMessages[locale];
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [sourceMediaId, setSourceMediaId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [localJobs, setLocalJobs] = useState<ProviderJob[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelling, setCancelling] = useState('');
  const requestKey = useRef<string | null>(null);
  const requestBody = useRef<string | null>(null);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
    }).format(cents / 100);
  const explain = (value: unknown) => {
    const code = value instanceof RequestError ? value.code : '';
    return code === 'BUDGET_EXCEEDED'
      ? t.budgetExceeded
      : code === 'PRICE_CHANGED'
        ? t.priceChanged
        : code === 'REPLICATE_DISABLED'
          ? t.disabled
          : code === 'REPLICATE_CONFIGURATION_CHANGED' ||
              code === 'MODEL_CHANGED'
            ? t.configurationChanged
            : code === 'JOB_SUBMITTING'
              ? t.jobSubmitting
              : t.error;
  };
  const loadProviders = useCallback(async (check = false) => {
    const data = await requestJson(
      `/api/providers/status${check ? '?check=1' : ''}`,
    );
    setProviders(data.providers);
  }, []);
  useEffect(() => {
    let mounted = true;
    requestJson('/api/providers/status')
      .then((data) => {
        if (mounted) setProviders(data.providers);
      })
      .catch(() => {
        if (mounted) setError(providerMessages[locale].error);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (
      !pendingRequest &&
      !accepted &&
      !projects.some((project) => project.id === projectId)
    )
      setProjectId(projects[0]?.id ?? '');
  }, [projects, projectId, pendingRequest, accepted]);
  useEffect(() => {
    setLocalJobs((previous) =>
      previous.filter(
        (job) =>
          !jobs.some(
            (updated) =>
              updated.id === job.id &&
              updated.status === job.status &&
              updated.progress >= job.progress,
          ),
      ),
    );
  }, [jobs]);
  const providerJobs = [
    ...localJobs,
    ...jobs.filter(
      (job) =>
        job.provider === 'replicate' &&
        !localJobs.some((local) => local.id === job.id),
    ),
  ].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const needsPolling = providerJobs.some((job) =>
    activeStatuses.includes(job.status),
  );
  useEffect(() => {
    if (!needsPolling) return;
    const timer = setInterval(() => {
      void refreshRef.current().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [needsPolling]);
  const replicate = providers.find((provider) => provider.id === 'replicate');
  const locked = submitting || pendingRequest || accepted;
  const enoughCeiling = Boolean(
    replicate?.estimateCents &&
    settings.monthlyBudgetCents >= replicate.estimateCents,
  );
  const ready = Boolean(
    replicate?.configured && settings.replicateEnabled && enoughCeiling,
  );
  useEffect(() => {
    if (!pendingRequest) setConfirmed(false);
  }, [replicate?.estimateCents, replicate?.model, replicate?.outputKind]);
  const resetConfirmation = () => {
    setConfirmed(false);
    requestKey.current = null;
    requestBody.current = null;
    setError('');
    setNotice('');
  };
  async function refresh() {
    try {
      await onRefresh();
      setError('');
    } catch {
      setError(t.error);
    }
  }
  async function check() {
    setChecking(true);
    setError('');
    try {
      await loadProviders(true);
    } catch (value) {
      setError(explain(value));
    } finally {
      setChecking(false);
    }
  }
  async function toggle(enabled: boolean) {
    setSaving(true);
    setError('');
    try {
      await onUpdateSettings({ replicateEnabled: enabled });
      setConfirmed(false);
    } catch (value) {
      setError(explain(value));
    } finally {
      setSaving(false);
    }
  }
  async function generate() {
    if (
      (!ready && !pendingRequest) ||
      !confirmed ||
      !projectId ||
      !prompt.trim() ||
      submitting ||
      accepted
    )
      return;
    requestKey.current ??= crypto.randomUUID();
    requestBody.current ??= JSON.stringify({
      projectId,
      ...(sourceMediaId ? { sourceMediaId } : {}),
      prompt,
      confirmedPaid: true,
      expectedCostCents: replicate!.estimateCents,
      expectedModelVersion: replicate!.model,
      idempotencyKey: requestKey.current,
    });
    setSubmitting(true);
    setError('');
    setNotice('');
    let acknowledged = false;
    try {
      const data = await requestJson('/api/providers/replicate/generate', {
        method: 'POST',
        body: requestBody.current,
      });
      acknowledged = true;
      setLocalJobs((previous) => [
        data.job,
        ...previous.filter((job) => job.id !== data.job.id),
      ]);
      setPendingRequest(false);
      setAccepted(true);
      setConfirmed(false);
      setNotice(t.accepted);
      try {
        await onRefresh();
      } catch {
        setNotice(t.refreshFailed);
      }
    } catch (value) {
      // A lost response may follow a committed reservation. Keep the form and
      // key frozen until its identical request is acknowledged by the server.
      const uncertain = !(value instanceof RequestError) || value.status >= 500;
      setPendingRequest(uncertain);
      setError(uncertain ? t.retryNotice : explain(value));
      if (!uncertain) {
        requestKey.current = null;
        requestBody.current = null;
        setConfirmed(false);
        if (value instanceof RequestError && value.code === 'PRICE_CHANGED') {
          try {
            await loadProviders();
          } catch {}
        }
      }
    } finally {
      setSubmitting(false);
      if (acknowledged) setPendingRequest(false);
    }
  }
  async function cancel(job: ProviderJob) {
    setCancelling(job.id);
    setError('');
    try {
      const data = await requestJson(
        `/api/jobs/${encodeURIComponent(job.id)}`,
        { method: 'DELETE' },
      );
      setLocalJobs((previous) => [
        data.job,
        ...previous.filter((item) => item.id !== job.id),
      ]);
      try {
        await onRefresh();
      } catch {
        setNotice(t.refreshFailed);
      }
    } catch (value) {
      setError(explain(value));
    } finally {
      setCancelling('');
    }
  }
  const statusLabel = (status: string) =>
    ({
      QUEUED: t.queued,
      PROCESSING: t.processing,
      SUBMITTING: t.submittingJob,
      RUNNING: t.running,
      EXPORTING: t.exporting,
      SUCCEEDED: t.succeeded,
      FAILED: t.failed,
      CANCELLED: t.cancelled,
      UNKNOWN: t.unknown,
    })[status] ?? status;
  return (
    <section className="providers-panel panel">
      <div className="panel-heading">
        <div>
          <h2>{t.title}</h2>
          <p className="providers-muted">{t.subtitle}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={check}
          disabled={checking || submitting || pendingRequest}
        >
          {checking ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          {t.check}
        </Button>
      </div>
      <div className="panel-body">
        {error && (
          <p className="providers-alert providers-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="providers-alert" role="status">
            {notice}
          </p>
        )}
        <div className="providers-grid">
          {providers.map((provider) => (
            <div className="provider-card" key={provider.id}>
              <div>
                <strong>
                  {provider.id === 'local'
                    ? 'FFmpeg'
                    : provider.id === 'comfyui'
                      ? 'ComfyUI'
                      : provider.id === 'ollama'
                        ? 'Ollama'
                        : provider.id === 'runway'
                          ? 'Runway'
                          : 'Replicate'}
                </strong>
                <Badge
                  tone={
                    provider.connection === 'connected'
                      ? 'success'
                      : provider.configured
                        ? 'brand'
                        : 'muted'
                  }
                >
                  {!provider.configured
                    ? t.missing
                    : provider.connection === 'connected'
                      ? t.connected
                      : provider.connection === 'unavailable'
                        ? t.unavailable
                        : t.configured}
                </Badge>
              </div>
              <p>{t[provider.id]}</p>
              <small>
                {provider.connection === 'unchecked'
                  ? t.unchecked
                  : provider.connection === 'unavailable'
                    ? t.unavailable
                    : t.connected}
              </small>
            </div>
          ))}
        </div>
        <details className="providers-setup">
          <summary>{t.setup}</summary>
          <p>{t.setupHint}</p>
          <p>{t.replicateSetup}</p>
          <p>{t.otherSetup}</p>
        </details>
        <div className="providers-activation">
          <label>
            <input
              type="checkbox"
              checked={settings.replicateEnabled}
              onChange={(event) => toggle(event.target.checked)}
              disabled={saving || submitting || pendingRequest}
            />
            <span>{t.enable}</span>
            {saving && <LoaderCircle size={14} className="spin" />}
          </label>
          <p className="providers-muted">{t.activationHint}</p>
        </div>
        <div className="providers-generator">
          <h3>
            <Sparkles size={17} />
            {t.titleGenerate}
          </h3>
          {replicate?.configured && (
            <dl className="providers-model">
              <div>
                <dt>{t.model}</dt>
                <dd>
                  <code>{replicate.model}</code>
                </dd>
              </div>
              <div>
                <dt>{t.kind}</dt>
                <dd>{replicate.outputKind === 'video' ? t.video : t.image}</dd>
              </div>
              <div>
                <dt>{t.estimate}</dt>
                <dd>
                  {replicate.estimateCents === undefined
                    ? t.estimateUnavailable
                    : money(replicate.estimateCents)}
                </dd>
              </div>
              <div>
                <dt>{t.budget}</dt>
                <dd>{money(settings.monthlyBudgetCents)}</dd>
              </div>
            </dl>
          )}
          {!ready && (
            <p className="providers-muted">
              {!replicate?.configured
                ? t.configRequired
                : !settings.replicateEnabled
                  ? t.activationRequired
                  : t.budgetRequired}
            </p>
          )}
          {!projects.length && (
            <p className="providers-muted">{t.noProjects}</p>
          )}
          <fieldset disabled={!ready || locked}>
            <div className="providers-fields">
              <Field label={t.project}>
                <Select
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    resetConfirmation();
                  }}
                >
                  <option value="">{t.chooseProject}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.source}>
                <Select
                  value={sourceMediaId}
                  onChange={(event) => {
                    setSourceMediaId(event.target.value);
                    resetConfirmation();
                  }}
                >
                  <option value="">{t.noSource}</option>
                  {media
                    .filter((item) =>
                      ['image/png', 'image/jpeg', 'image/webp'].includes(
                        item.mimeType,
                      ),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label={t.prompt}>
              <textarea
                className="input providers-prompt"
                rows={4}
                maxLength={6000}
                placeholder={t.promptPlaceholder}
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  resetConfirmation();
                }}
              />
            </Field>
          </fieldset>
          <p className="providers-muted">{t.estimateHint}</p>
          <label className="providers-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={!ready || locked}
            />
            <span>
              {t.confirm}{' '}
              <strong>
                {replicate?.estimateCents === undefined
                  ? t.estimateUnavailable
                  : money(replicate.estimateCents)}
              </strong>
              .
            </span>
          </label>
          <div className="providers-actions">
            <Button
              onClick={generate}
              disabled={
                (!ready && !pendingRequest) ||
                !confirmed ||
                !projectId ||
                !prompt.trim() ||
                submitting ||
                accepted
              }
            >
              {submitting ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {submitting ? t.submitting : t.generate}
            </Button>
            {accepted && (
              <Button
                variant="secondary"
                onClick={() => {
                  setAccepted(false);
                  setPendingRequest(false);
                  resetConfirmation();
                }}
              >
                {t.newRequest}
              </Button>
            )}
          </div>
        </div>
        <div className="providers-history">
          <div className="providers-history-heading">
            <h3>{t.history}</h3>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw size={13} />
              {t.refresh}
            </Button>
          </div>
          {!providerJobs.length && <p className="providers-muted">{t.empty}</p>}
          {providerJobs.slice(0, 8).map((job) => {
            const output = media.find((item) => item.id === job.outputMediaId);
            const url =
              output?.url ??
              (job.outputMediaId
                ? `/api/media/${encodeURIComponent(job.outputMediaId)}`
                : undefined);
            return (
              <article className="provider-job" key={job.id}>
                <div className="provider-job-title">
                  <strong>
                    {projects.find((project) => project.id === job.projectId)
                      ?.name ?? job.projectId}
                  </strong>
                  <Badge
                    tone={
                      job.status === 'SUCCEEDED'
                        ? 'success'
                        : job.status === 'UNKNOWN'
                          ? 'warning'
                          : 'muted'
                    }
                  >
                    {statusLabel(job.status)}
                  </Badge>
                </div>
                <div className="providers-muted">
                  {t.reserved} :{' '}
                  {money(job.reservedCents ?? job.estimatedCostCents)}
                  {activeStatuses.includes(job.status) && ` · ${job.progress}%`}
                </div>
                {job.status === 'UNKNOWN' && (
                  <p className="providers-alert">{t.unknownHint}</p>
                )}
                {job.errorCode && (
                  <small className="providers-code">{job.errorCode}</small>
                )}
                {output && url && (
                  <div className="provider-output">
                    {output.mimeType.startsWith('video/') ? (
                      <video controls preload="metadata" src={url} />
                    ) : output.mimeType.startsWith('image/') ? (
                      <img src={url} alt={output.name} />
                    ) : (
                      <p>{t.noOutput}</p>
                    )}
                    <p className="providers-muted">
                      {output.width && output.height
                        ? `${output.width} × ${output.height} · `
                        : ''}
                      {t.native}
                    </p>
                    <a
                      className="button button-secondary button-sm"
                      href={url}
                      download={output.name}
                    >
                      <Download size={13} />
                      {t.download}
                    </a>
                  </div>
                )}
                {activeStatuses.includes(job.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelling === job.id}
                    onClick={() => cancel(job)}
                  >
                    {cancelling === job.id ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      <X size={13} />
                    )}
                    {t.cancel}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
