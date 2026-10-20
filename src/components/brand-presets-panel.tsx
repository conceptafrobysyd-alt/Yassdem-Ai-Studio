'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { Check, Layers3, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import type { BrandPreset, BrandPresetValues } from '@/lib/brand-presets';
import { brandPresetMessages } from '@/messages/brand-presets';
import { Badge, Button, Field, Input, Select, cn } from './ui/primitives';
import './brand-presets.css';

type Logo = { id: string; name: string; url: string; mimeType?: string };
export type BrandPresetsPanelProps = {
  locale: 'fr' | 'en';
  logos: Logo[];
  onApply: (preset: BrandPreset) => Promise<unknown>;
};
const blank = (): BrandPresetValues => ({
  name: '',
  logoMediaId: null,
  logoSize: 15,
  logoOpacity: 0.8,
  logoPosition: 'bottom-right',
  logoFade: false,
});
async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.code || 'UNKNOWN');
  return data;
}
export function BrandPresetsPanel({
  locale,
  logos,
  onApply,
}: BrandPresetsPanelProps) {
  const t = brandPresetMessages[locale];
  const [presets, setPresets] = useState<BrandPreset[]>([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<BrandPresetValues>(blank);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const chosen = presets.find((preset) => preset.id === selected);
  const unsavedChanges = Boolean(
    chosen &&
    Object.entries(draft).some(
      ([key, value]) => chosen[key as keyof BrandPresetValues] !== value,
    ),
  );
  const preview = logos.find((logo) => logo.id === draft.logoMediaId);
  function errorText(value: unknown) {
    const code = value instanceof Error ? value.message : '';
    if (code === 'INVALID_LOGO') return t.missingLogo;
    if (code === 'INVALID_BRAND_PRESET' || code === 'INVALID_INPUT')
      return t.invalid;
    if (code === 'BRAND_PRESET_LIMIT') return t.limit;
    return t.error;
  }
  async function load() {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      setPresets((await request('/api/brand-presets')).presets);
    } catch (value) {
      setLoadFailed(true);
      setError(errorText(value));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // Locale changes preserve the current draft.
  function choose(preset?: BrandPreset) {
    setSelected(preset?.id || '');
    setDraft(
      preset
        ? {
            name: preset.name,
            logoMediaId: preset.logoMediaId,
            logoSize: preset.logoSize,
            logoOpacity: preset.logoOpacity,
            logoPosition: preset.logoPosition,
            logoFade: preset.logoFade,
          }
        : blank(),
    );
    setNotice('');
    setError('');
  }
  function patch<K extends keyof BrandPresetValues>(
    key: K,
    value: BrandPresetValues[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  async function act(key: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (value) {
      setError(errorText(value));
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  async function save() {
    await act('save', async () => {
      const result = await request(
        selected ? `/api/brand-presets/${selected}` : '/api/brand-presets',
        selected ? 'PATCH' : 'POST',
        draft,
      );
      const saved = result.preset as BrandPreset;
      setPresets((previous) => [
        saved,
        ...previous.filter((preset) => preset.id !== saved.id),
      ]);
      choose(saved);
      setNotice(t.saved);
    });
  }
  const positions = [
    ['top-left', t.topLeft],
    ['top-right', t.topRight],
    ['bottom-left', t.bottomLeft],
    ['bottom-right', t.bottomRight],
    ['center', t.center],
  ];
  return (
    <section className="brand-presets-panel" aria-label={t.title}>
      <div className="brand-presets-heading">
        <div>
          <h3>
            <Layers3 size={19} />
            {t.title}
          </h3>
          <p>{t.description}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(busy) || loading}
          onClick={() => choose()}
        >
          <Plus size={15} />
          {t.new}
        </Button>
      </div>
      {error && (
        <p className="brand-presets-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="brand-presets-notice" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {loading ? (
        <p className="brand-presets-loading">
          <LoaderCircle size={16} className="spin" />
          {t.loading}
        </p>
      ) : loadFailed ? (
        <Button variant="secondary" onClick={() => void load()}>
          {t.retry}
        </Button>
      ) : (
        <>
          {presets.length ? (
            <div className="brand-preset-list" aria-label={t.title}>
              {presets.map((preset) => {
                const logo = logos.find(
                  (item) => item.id === preset.logoMediaId,
                );
                return (
                  <button
                    type="button"
                    key={preset.id}
                    aria-pressed={selected === preset.id}
                    disabled={Boolean(busy)}
                    className={cn(
                      'brand-preset-card',
                      selected === preset.id && 'selected',
                    )}
                    onClick={() => choose(preset)}
                  >
                    {logo ? (
                      <img src={logo.url} alt="" />
                    ) : (
                      <Layers3 size={20} />
                    )}
                    <span>{preset.name}</span>
                    {selected === preset.id && <Check size={15} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="brand-presets-empty">{t.empty}</p>
          )}
          <div className="brand-preset-form">
            <div className="brand-preset-fields">
              <Field label={t.name}>
                <Input
                  value={draft.name}
                  maxLength={80}
                  disabled={Boolean(busy)}
                  onChange={(event) => patch('name', event.target.value)}
                />
              </Field>
              <Field label={t.logo}>
                <Select
                  value={draft.logoMediaId || ''}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    patch('logoMediaId', event.target.value || null)
                  }
                >
                  <option value="">{t.noLogo}</option>
                  {logos.map((logo) => (
                    <option key={logo.id} value={logo.id}>
                      {logo.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.position}>
                <Select
                  value={draft.logoPosition}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    patch(
                      'logoPosition',
                      event.target.value as BrandPresetValues['logoPosition'],
                    )
                  }
                >
                  {positions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`${t.size} · ${draft.logoSize}%`}>
                <Input
                  type="range"
                  min={3}
                  max={50}
                  value={draft.logoSize}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    patch('logoSize', Number(event.target.value))
                  }
                />
              </Field>
              <Field
                label={`${t.opacity} · ${Math.round(draft.logoOpacity * 100)}%`}
              >
                <Input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.logoOpacity}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    patch('logoOpacity', Number(event.target.value))
                  }
                />
              </Field>
              <label className="brand-preset-checkbox">
                <input
                  type="checkbox"
                  checked={draft.logoFade}
                  disabled={Boolean(busy)}
                  onChange={(event) => patch('logoFade', event.target.checked)}
                />
                {t.fade}
              </label>
            </div>
            <div
              className={cn(
                'brand-preset-preview',
                `brand-position-${draft.logoPosition}`,
              )}
              aria-label={t.preview}
            >
              {preview ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  style={{
                    width: `${draft.logoSize}%`,
                    opacity: draft.logoOpacity,
                  }}
                />
              ) : (
                <Badge>{t.noLogo}</Badge>
              )}
            </div>
          </div>
          <div className="brand-preset-actions">
            <Button
              size="sm"
              disabled={Boolean(busy) || !draft.name.trim()}
              onClick={() => void save()}
            >
              {busy === 'save' ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              {t.save}
            </Button>
            {chosen && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                disabled={Boolean(busy) || unsavedChanges}
                title={unsavedChanges ? t.saveFirst : undefined}
                  onClick={() =>
                    void act('apply', async () => {
                      await onApply(chosen);
                      setNotice(t.applied);
                    })
                  }
                >
                  {busy === 'apply' ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {t.apply}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void act('delete', async () => {
                      await request(
                        `/api/brand-presets/${chosen.id}`,
                        'DELETE',
                      );
                      setPresets((previous) =>
                        previous.filter((preset) => preset.id !== chosen.id),
                      );
                      choose();
                      setNotice(t.deleted);
                    })
                  }
                >
                  <Trash2 size={15} />
                  {t.remove}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
