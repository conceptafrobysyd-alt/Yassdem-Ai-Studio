'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import { Badge, Button, Field, Input, Select } from './ui/primitives';
import { imageExportMessages } from '@/messages/image-export';
import type {
  ImageExportMetadata,
  ImageExportOptions,
  ImageLogoPosition,
} from '@/lib/image-export';
import './image-export.css';

export type ImageExportMedia = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  role?: string;
  width?: number | null;
  height?: number | null;
  projectId?: string | null;
};
export type ImageExportPanelProps = {
  locale: 'fr' | 'en';
  media: ImageExportMedia[];
  projects?: { id: string; name: string }[];
  initialMediaId?: string;
  onRefresh: () => Promise<unknown>;
};
const initialOptions = (): ImageExportOptions => ({
  format: 'png',
  resolution: 'native',
  ratio: 'original',
  quality: 90,
  logoId: null,
  logoSize: 15,
  logoOpacity: 0.8,
  logoPosition: 'bottom-right',
  projectId: null,
});
function plannedDimensions(
  source: ImageExportMedia | undefined,
  options: ImageExportOptions,
) {
  if (!source?.width || !source.height) return null;
  if (options.resolution === 'native' && options.ratio === 'original')
    return { width: source.width, height: source.height };
  const ratio =
    options.ratio === 'original'
      ? source.width / source.height
      : Number(options.ratio.split(':')[0]) /
        Number(options.ratio.split(':')[1]);
  if (options.resolution === '4k')
    return ratio >= 1
      ? { width: 3840, height: Math.max(1, Math.round(3840 / ratio)) }
      : { width: Math.max(1, Math.round(3840 * ratio)), height: 3840 };
  return source.width / source.height >= ratio
    ? {
        width: Math.max(1, Math.floor(source.height * ratio)),
        height: source.height,
      }
    : {
        width: source.width,
        height: Math.max(1, Math.floor(source.width / ratio)),
      };
}
export function ImageExportPanel({
  locale,
  media,
  projects = [],
  initialMediaId,
  onRefresh,
}: ImageExportPanelProps) {
  const t = imageExportMessages[locale];
  const images = media.filter(
    (item) =>
      ['image/png', 'image/jpeg', 'image/webp'].includes(item.mimeType) &&
      item.role !== 'LOGO',
  );
  const logos = media.filter(
    (item) => item.role === 'LOGO' && item.mimeType.startsWith('image/'),
  );
  const [sourceId, setSourceId] = useState(
    initialMediaId || images[0]?.id || '',
  );
  const [options, setOptions] = useState<ImageExportOptions>(initialOptions);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    media: ImageExportMedia;
    metadata: ImageExportMetadata;
  } | null>(null);
  const source = images.find((item) => item.id === sourceId);
  useEffect(() => {
    if (initialMediaId) {
      setSourceId(initialMediaId);
      setResult(null);
    }
  }, [initialMediaId]);
  useEffect(() => {
    if (!sourceId && images[0]) setSourceId(images[0].id);
  }, [images, sourceId]);
  function patch<K extends keyof ImageExportOptions>(
    key: K,
    value: ImageExportOptions[K],
  ) {
    setOptions((previous) => ({ ...previous, [key]: value }));
  }
  async function createExport() {
    if (!source || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/media/${encodeURIComponent(source.id)}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        const code = data.error?.code || '';
        throw new Error(
          code === 'IMAGE_EXPORT_BUSY'
            ? t.busy
            : code === 'IMAGE_EXPORT_PROJECT_TOO_LARGE'
              ? t.projectTooLarge
              : /TOO_LARGE|INVALID_IMAGE|INVALID_LOGO/.test(code)
                ? t.tooLarge
                : t.error,
        );
      }
      setResult(data);
      setNotice(t.saved);
      try {
        await onRefresh();
      } catch {
        setNotice(t.refreshFailed);
      }
    } catch (value) {
      setError(
        value instanceof Error &&
          [t.busy, t.tooLarge, t.projectTooLarge, t.error].includes(
            value.message,
          )
          ? value.message
          : t.error,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const dimensions = plannedDimensions(source, options);
  const upscaled =
    dimensions && source?.width && source.height
      ? dimensions.width > source.width || dimensions.height > source.height
      : options.resolution === '4k';
  const positions: [ImageLogoPosition, keyof typeof t][] = [
    ['top-left', 'topLeft'],
    ['top-right', 'topRight'],
    ['bottom-left', 'bottomLeft'],
    ['bottom-right', 'bottomRight'],
    ['center', 'center'],
  ];
  return (
    <section className="panel image-export-panel" aria-label={t.title}>
      <div className="panel-heading">
        <h2>
          <ImageIcon size={18} />
          {t.title}
        </h2>
        <Badge>PNG · JPEG · WebP</Badge>
      </div>
      <div className="panel-body">
        <p className="section-description">{t.description}</p>
        {!images.length ? (
          <p className="field-hint">{t.noImages}</p>
        ) : (
          <>
            <div className="image-export-layout">
              <fieldset disabled={busy} className="image-export-fields">
                <Field label={t.source}>
                  <Select
                    value={sourceId}
                    onChange={(event) => {
                      setSourceId(event.target.value);
                      setResult(null);
                      setNotice('');
                      setError('');
                    }}
                  >
                    <option value="">{t.chooseSource}</option>
                    {images.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {projects.length > 0 && (
                  <Field label={t.project} hint={t.projectHint}>
                    <Select
                      value={options.projectId || ''}
                      onChange={(event) =>
                        patch('projectId', event.target.value || null)
                      }
                    >
                      <option value="">{t.sourceProject}</option>
                      {projects.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="field-pair">
                  <Field label={t.format}>
                    <Select
                      value={options.format}
                      onChange={(event) =>
                        patch(
                          'format',
                          event.target.value as ImageExportOptions['format'],
                        )
                      }
                    >
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                      <option value="webp">WebP</option>
                    </Select>
                  </Field>
                  <Field label={t.ratio}>
                    <Select
                      value={options.ratio}
                      onChange={(event) =>
                        patch(
                          'ratio',
                          event.target.value as ImageExportOptions['ratio'],
                        )
                      }
                    >
                      <option value="original">{t.original}</option>
                      {['9:16', '4:5', '1:1', '16:9'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label={t.resolution}>
                  <Select
                    value={options.resolution}
                    onChange={(event) =>
                      patch(
                        'resolution',
                        event.target.value as ImageExportOptions['resolution'],
                      )
                    }
                  >
                    <option value="native">{t.native}</option>
                    <option value="4k">{t.fourK}</option>
                  </Select>
                </Field>
                {options.format !== 'png' && (
                  <Field label={t.quality}>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={options.quality}
                      onChange={(event) =>
                        patch('quality', Number(event.target.value))
                      }
                    />
                  </Field>
                )}
                <Field label={t.logo}>
                  <Select
                    value={options.logoId || ''}
                    onChange={(event) =>
                      patch('logoId', event.target.value || null)
                    }
                  >
                    <option value="">{t.noLogo}</option>
                    {logos.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {options.logoId && (
                  <>
                    <div className="field-pair">
                      <Field label={t.logoSize}>
                        <Input
                          type="number"
                          min={3}
                          max={50}
                          value={options.logoSize}
                          onChange={(event) =>
                            patch('logoSize', Number(event.target.value))
                          }
                        />
                      </Field>
                      <Field label={t.opacity}>
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={options.logoOpacity}
                          onChange={(event) =>
                            patch('logoOpacity', Number(event.target.value))
                          }
                        />
                      </Field>
                    </div>
                    <Field label={t.position}>
                      <Select
                        value={options.logoPosition}
                        onChange={(event) =>
                          patch(
                            'logoPosition',
                            event.target.value as ImageLogoPosition,
                          )
                        }
                      >
                        {positions.map(([value, key]) => (
                          <option key={value} value={value}>
                            {t[key]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
              </fieldset>
              <div className="image-export-preview">
                {source && <img src={source.url} alt={source.name} />}
                <dl>
                  <div>
                    <dt>{t.sourceDimensions}</dt>
                    <dd>
                      {source?.width && source.height
                        ? `${source.width} × ${source.height}`
                        : t.unknownDimensions}
                    </dd>
                  </div>
                  <div>
                    <dt>{t.outputDimensions}</dt>
                    <dd>
                      {dimensions
                        ? `${dimensions.width} × ${dimensions.height}`
                        : t.unknownDimensions}
                    </dd>
                  </div>
                </dl>
                <p className="field-hint">
                  {upscaled ? t.upscaled : t.preserved}
                </p>
                <p className="field-hint">{t.transparent}</p>
              </div>
            </div>
            <p className="field-hint">{t.local}</p>
            <Button
              disabled={busy || !source}
              onClick={() => void createExport()}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              {busy ? t.exporting : t.export}
            </Button>
            {result && (
              <div className="image-export-result">
                <img src={result.media.url} alt={t.result} />
                <div>
                  <strong>
                    {result.metadata.width} × {result.metadata.height}
                  </strong>
                  <p className="field-hint">
                    {result.metadata.upscaled ? t.upscaled : t.preserved}
                  </p>
                  <a
                    className="button button-secondary button-md"
                    href={result.media.url}
                    download={result.media.name}
                  >
                    <Download size={15} />
                    {t.download}
                  </a>
                </div>
              </div>
            )}
          </>
        )}
        {notice && (
          <p role="status" className="image-export-notice">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="image-export-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
