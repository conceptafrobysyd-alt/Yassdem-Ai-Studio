'use client';
import { useEffect, useRef, useState } from 'react';
import { Layers3, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Field, Input, Select } from './ui/primitives';
import {
  DEFAULT_STYLE_PARAMETERS,
  STYLE_DESCRIPTOR_KEYS,
  type StylePreset,
  type StylePresetParameters,
} from '@/lib/style-preset-values';
import { stylePresetMessages } from '@/messages/style-presets';
import './style-presets.css';

export type StylePresetsPanelProps = {
  locale: 'fr' | 'en';
  onApply?: (preset: StylePreset) => void | Promise<unknown>;
  disabled?: boolean;
};
const names = [
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
const blank = () => ({
  ...DEFAULT_STYLE_PARAMETERS,
  colors: [] as string[],
  accessories: [] as string[],
});
const items = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.code || 'STYLE_PRESET_ERROR');
  return data;
}
export function StylePresetsPanel({
  locale,
  onApply,
  disabled = false,
}: StylePresetsPanelProps) {
  const t = stylePresetMessages[locale];
  const [presets, setPresets] = useState<StylePreset[]>([]),
    [selected, setSelected] = useState(''),
    [name, setName] = useState(''),
    [parameters, setParameters] = useState<StylePresetParameters>(blank),
    [colors, setColors] = useState(''),
    [accessories, setAccessories] = useState('');
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const active = useRef(false);
  const chosen = presets.find((item) => item.id === selected);
  const payload = () => ({
    name: name.trim(),
    parameters: {
      ...parameters,
      colors: items(colors),
      accessories: items(accessories),
    },
  });
  const dirty =
    !chosen ||
    JSON.stringify(payload()) !==
      JSON.stringify({ name: chosen.name, parameters: chosen.parameters });
  const locked = disabled || Boolean(busy) || loading;
  const explain = (value: unknown) =>
    value instanceof Error && /LIST_LIMIT/.test(value.message)
      ? t.limit
      : t.error;
  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      setPresets((await request('/api/style-presets')).presets);
    } catch {
      setFailed(true);
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function choose(preset?: StylePreset) {
    setSelected(preset?.id || '');
    setName(preset?.name || '');
    setParameters(
      preset
        ? {
            ...preset.parameters,
            colors: [...preset.parameters.colors],
            accessories: [...preset.parameters.accessories],
          }
        : blank(),
    );
    setColors(preset?.parameters.colors.join(', ') || '');
    setAccessories(preset?.parameters.accessories.join(', ') || '');
    setNotice('');
    setError('');
  }
  function patch<K extends keyof StylePresetParameters>(
    key: K,
    value: StylePresetParameters[K],
  ) {
    setParameters((previous) => ({ ...previous, [key]: value }));
  }
  async function act(key: string, action: () => Promise<void>) {
    if (active.current || disabled) return;
    active.current = true;
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (value) {
      setError(explain(value));
    } finally {
      active.current = false;
      setBusy('');
    }
  }
  async function save() {
    const data = await request(
      selected ? `/api/style-presets/${selected}` : '/api/style-presets',
      selected ? 'PATCH' : 'POST',
      payload(),
    );
    setPresets((previous) => [
      data.preset,
      ...previous.filter((item) => item.id !== data.preset.id),
    ]);
    choose(data.preset);
    setNotice(t.saved);
  }
  return (
    <section className="style-presets-panel" aria-label={t.title}>
      <div className="style-presets-heading">
        <div>
          <h3>
            <Layers3 size={17} />
            {t.title}
          </h3>
          <p>{t.description}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => choose()}
          disabled={locked}
        >
          <Plus size={14} />
          {t.new}
        </Button>
      </div>
      {loading ? (
        <p role="status">
          <LoaderCircle className="spin" size={15} />
          {t.loading}
        </p>
      ) : failed ? (
        <Button variant="secondary" onClick={() => void load()}>
          {t.retry}
        </Button>
      ) : (
        <>
          <Field label={t.choose}>
            <Select
              value={selected}
              onChange={(event) =>
                choose(presets.find((item) => item.id === event.target.value))
              }
              disabled={locked}
            >
              <option value="">{t.new}</option>
              {presets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          {!presets.length && <p className="field-hint">{t.empty}</p>}
          <fieldset disabled={locked} className="style-presets-fields">
            <Field label={t.name}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                list="style-preset-names"
              />
              <datalist id="style-preset-names">
                {names.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
            <Field label={t.fit}>
              <Select
                value={parameters.fit}
                onChange={(event) =>
                  patch(
                    'fit',
                    event.target.value as StylePresetParameters['fit'],
                  )
                }
              >
                {(
                  [
                    'regular',
                    'fitted',
                    'relaxed',
                    'oversized',
                    'custom',
                  ] as const
                ).map((item) => (
                  <option key={item} value={item}>
                    {t[item]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.colors} hint={t.listHelp}>
              <Input
                value={colors}
                maxLength={1200}
                onChange={(event) => setColors(event.target.value)}
              />
            </Field>
            <Field label={t.accessories} hint={t.listHelp}>
              <Input
                value={accessories}
                maxLength={1200}
                onChange={(event) => setAccessories(event.target.value)}
              />
            </Field>
            {STYLE_DESCRIPTOR_KEYS.map((key) => (
              <Field key={key} label={t[key]}>
                <Input
                  value={parameters[key]}
                  maxLength={200}
                  onChange={(event) => patch(key, event.target.value)}
                />
              </Field>
            ))}
          </fieldset>
          <p className="field-hint">{t.independent}</p>
          <div className="style-presets-actions">
            <Button
              variant="secondary"
              onClick={() => void act('save', save)}
              disabled={locked || !name.trim() || (!dirty && Boolean(chosen))}
            >
              <Save size={14} />
              {t.save}
            </Button>
            {chosen && (
              <Button
                variant="ghost"
                onClick={() =>
                  void act('delete', async () => {
                    await request(`/api/style-presets/${chosen.id}`, 'DELETE');
                    setPresets((previous) =>
                      previous.filter((item) => item.id !== chosen.id),
                    );
                    choose();
                    setNotice(t.deleted);
                  })
                }
                disabled={locked}
              >
                <Trash2 size={14} />
                {t.remove}
              </Button>
            )}
            {onApply && (
              <Button
                onClick={() =>
                  void act('apply', async () => {
                    if (chosen) {
                      await onApply(chosen);
                      setNotice(t.applied);
                    }
                  })
                }
                disabled={locked || !chosen || dirty}
              >
                {t.apply}
              </Button>
            )}
          </div>
          {onApply && (
            <p className="field-hint">
              {dirty && chosen ? t.saveFirst : t.applyHelp}
            </p>
          )}
        </>
      )}
      {notice && (
        <p role="status" className="style-presets-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="style-presets-error">
          {error}
        </p>
      )}
    </section>
  );
}
