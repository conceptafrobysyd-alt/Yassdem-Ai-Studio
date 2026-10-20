'use client';
import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { Badge, Button } from './ui/primitives';
import { modelCatalogMessages } from '@/messages/model-catalog';
import type {
  CatalogOutput,
  ProviderCatalogModel,
} from '@/lib/provider-catalog';
import './model-catalog.css';

export interface ModelCatalogPanelProps {
  locale: 'fr' | 'en';
  outputKind?: CatalogOutput;
  onSelectModel?: (model: ProviderCatalogModel) => void;
}
export function ModelCatalogPanel({
  locale,
  outputKind,
  onSelectModel,
}: ModelCatalogPanelProps) {
  const t = modelCatalogMessages[locale];
  const [models, setModels] = useState<ProviderCatalogModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch('/api/providers/models');
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.models)) throw new Error();
      setModels(data.models);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const money = (value: number) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      style: 'currency',
      currency: 'EUR',
    }).format(value / 100);
  const replace = (value: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce(
      (text, [key, entry]) => text.replaceAll(`{${key}}`, String(entry)),
      value,
    );
  const shown = models.filter(
    (model) => !outputKind || model.outputKind === outputKind,
  );
  return (
    <section className="model-catalog panel">
      <div className="panel-heading">
        <h2>
          <BookOpen size={17} />
          {t.title}
        </h2>
      </div>
      <div className="panel-body">
        <p className="model-catalog-hint">{t.description}</p>
        <p className="model-catalog-hint">{t.access}</p>
        {loading ? (
          <p className="model-catalog-state">
            <LoaderCircle size={15} className="spin" />
            {t.loading}
          </p>
        ) : failed ? (
          <div role="alert">
            <p>{t.error}</p>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw size={14} />
              {t.retry}
            </Button>
          </div>
        ) : (
          <div className="model-catalog-grid">
            {!shown.length && <p>{t.empty}</p>}
            {shown.map((model) => (
              <article
                className="model-catalog-card"
                key={`${model.provider}:${model.id}`}
              >
                <div className="model-catalog-card-heading">
                  <strong>
                    {model.id === 'fashion-image'
                      ? t.fashion
                      : model.id === 'try-on'
                        ? t.tryOn
                        : model.label}
                  </strong>
                  <Badge>{t[model.outputKind]}</Badge>
                </div>
                <p className="model-catalog-provider">
                  {model.provider === 'local'
                    ? 'FFmpeg'
                    : model.provider === 'comfyui'
                      ? 'ComfyUI'
                      : model.provider === 'ollama'
                        ? 'Ollama'
                        : model.provider === 'runway'
                          ? 'Runway'
                          : 'Replicate'}
                </p>
                <code className="model-catalog-id">{model.id}</code>
                <p className="model-catalog-state">
                  <Badge tone={model.configured ? 'brand' : 'muted'}>
                    {model.configured ? t.configured : t.missing}
                  </Badge>
                </p>
                <p className="model-catalog-hint">
                  {model.access === 'unverified' ? t.unverified : t.local}
                </p>
                <details>
                  <summary>{t.parameters}</summary>
                  <ul>
                    {model.parameters.map((parameter) => (
                      <li key={parameter.key}>
                        <strong>
                          {t.names[parameter.key as keyof typeof t.names] ??
                            parameter.key}
                        </strong>
                        {' · '}
                        {parameter.required ? t.required : t.optional}
                        {parameter.values && (
                          <span>{parameter.values.join(' / ')}</span>
                        )}
                        {parameter.min !== undefined &&
                          parameter.max !== undefined && (
                            <span>
                              {replace(t.range, {
                                min: parameter.min,
                                max: parameter.max,
                              })}
                            </span>
                          )}
                        {parameter.maxLength !== undefined && (
                          <span>
                            {replace(t.maxLength, {
                              value: parameter.maxLength,
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
                {model.nativeSizes && (
                  <p className="model-catalog-hint">
                    {t.nativeSizes} :{' '}
                    {model.nativeSizes
                      .map((size) => `${size.width} × ${size.height}`)
                      .join(' / ')}
                  </p>
                )}
                <div className="model-catalog-cost">
                  {model.cost.kind === 'local' ? (
                    t.localCost
                  ) : model.cost.kind === 'manual-reservation' ? (
                    replace(t.manualCost, {
                      amount: money(model.cost.amountCents!),
                    })
                  ) : (
                    <>
                      <p>
                        {replace(t.runwayCost, { rate: model.cost.usdToEur! })}
                      </p>
                      {model.cost.durationEstimates?.map((estimate) => (
                        <span key={estimate.seconds}>
                          {replace(t.seconds, { value: estimate.seconds })} :{' '}
                          {money(estimate.amountCents)}
                        </span>
                      ))}
                    </>
                  )}
                </div>
                {onSelectModel && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!model.configured}
                    onClick={() => onSelectModel(model)}
                  >
                    {t.select}
                  </Button>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
