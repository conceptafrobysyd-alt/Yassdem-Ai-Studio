import { SaxesParser } from 'saxes';
import sharp from 'sharp';
import { ApiError } from './http';

export const SVG_LOGO_LIMIT = 512 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_PIXELS = 16_000_000;
const numberPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const singleNumber = new RegExp(`^${numberPattern}$`);
const dimensions = new RegExp(`^(${numberPattern})(?:px)?$`);
const numericAttributes = new Set([
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'stroke-width',
  'stroke-miterlimit',
  'pathLength',
]);
const common = [
  'id',
  'fill',
  'color',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'fill-rule',
  'clip-rule',
  'transform',
];
const elementAttributes: Record<string, Set<string>> = Object.fromEntries(
  Object.entries({
    svg: ['width', 'height', 'viewBox', 'preserveAspectRatio', 'version'],
    g: [],
    path: ['d', 'pathLength'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    line: ['x1', 'x2', 'y1', 'y2'],
    polyline: ['points'],
    polygon: ['points'],
    title: [],
    desc: [],
  }).map(([name, attributes]) => [
    name,
    new Set(
      name === 'title' || name === 'desc' ? [] : [...common, ...attributes],
    ),
  ]),
);

const unsafe = () => new ApiError(400, 'UNSAFE_SVG_LOGO');
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
function number(value: string) {
  if (!singleNumber.test(value.trim())) throw unsafe();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000) throw unsafe();
  return parsed;
}
function numberList(value: string) {
  const values = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(number);
  if (!values.length) throw unsafe();
  return values;
}
function color(value: string) {
  if (
    /^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{1,24})$/i.test(
      value,
    )
  )
    return;
  const match = /^(rgb|rgba)\(([^()]*)\)$/i.exec(value);
  if (!match) throw unsafe();
  const channels = match[2].split(',').map((part) => part.trim());
  if (channels.length !== (match[1].toLowerCase() === 'rgb' ? 3 : 4))
    throw unsafe();
  channels.forEach((part, index) => {
    const percentage = part.endsWith('%');
    const channel = number(percentage ? part.slice(0, -1) : part);
    if (channel < 0 || channel > (percentage ? 100 : index === 3 ? 1 : 255))
      throw unsafe();
  });
}
function attribute(name: string, value: string) {
  if (
    value.length > 100_000 ||
    /url\s*\(|(?:https?|file|data|javascript)\s*:/i.test(value)
  )
    throw unsafe();
  if (name === 'id') {
    if (!/^[A-Za-z_][\w-]{0,79}$/.test(value)) throw unsafe();
  } else if (['fill', 'stroke', 'color'].includes(name)) color(value);
  else if (['opacity', 'fill-opacity', 'stroke-opacity'].includes(name)) {
    const n = number(value);
    if (n < 0 || n > 1) throw unsafe();
  } else if (numericAttributes.has(name)) {
    const n = number(value.replace(/px$/, ''));
    if (
      [
        'r',
        'rx',
        'ry',
        'width',
        'height',
        'stroke-width',
        'stroke-miterlimit',
        'pathLength',
      ].includes(name) &&
      n < 0
    )
      throw unsafe();
  } else if (name === 'd') {
    if (!value || !/^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/.test(value))
      throw unsafe();
    for (const token of value.match(new RegExp(numberPattern, 'g')) ?? [])
      number(token);
  } else if (name === 'points') {
    if (numberList(value).length % 2) throw unsafe();
  } else if (name === 'viewBox') {
    const box = numberList(value);
    if (box.length !== 4 || box[2] <= 0 || box[3] <= 0) throw unsafe();
  } else if (name === 'transform') {
    const tokens = [
      ...value.matchAll(
        /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/g,
      ),
    ];
    if (
      !tokens.length ||
      value
        .replace(
          /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/g,
          '',
        )
        .replace(/[\s,]/g, '')
    )
      throw unsafe();
    for (const token of tokens) {
      const size = numberList(token[2]).length;
      const counts =
        token[1] === 'matrix'
          ? [6]
          : token[1] === 'rotate'
            ? [1, 3]
            : token[1].startsWith('skew')
              ? [1]
              : [1, 2];
      if (!counts.includes(size)) throw unsafe();
    }
  } else if (name === 'stroke-linecap') {
    if (!['butt', 'round', 'square'].includes(value)) throw unsafe();
  } else if (name === 'stroke-linejoin') {
    if (!['miter', 'round', 'bevel'].includes(value)) throw unsafe();
  } else if (name === 'fill-rule' || name === 'clip-rule') {
    if (!['nonzero', 'evenodd'].includes(value)) throw unsafe();
  } else if (name === 'version') {
    if (!['1.0', '1.1', '2.0'].includes(value)) throw unsafe();
  } else if (name === 'preserveAspectRatio') {
    if (
      !/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(
        value,
      )
    )
      throw unsafe();
  }
}

/** Accept a deliberately small, inert SVG subset, reconstruct it, then discard
 * the XML after rasterizing. The rasterizer never sees unvalidated source XML.
 * CSS, fonts, references, entities, embedded media and executable elements are
 * unsupported; use PNG for logos requiring these features.
 */
export async function rasterizeSvgLogo(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > SVG_LOGO_LIMIT)
    throw new ApiError(413, 'SVG_LOGO_TOO_LARGE');
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw unsafe();
  }
  if (!source.trim() || /&|<!DOCTYPE|<!ENTITY/i.test(source)) throw unsafe();
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  const output: string[] = [];
  let seenRoot = false;
  let nodes = 0;
  let geometryNumbers = 0;
  let transformFunctions = 0;
  let width = 0;
  let height = 0;
  parser.on('error', () => {
    throw unsafe();
  });
  parser.on('doctype', () => {
    throw unsafe();
  });
  parser.on('processinginstruction', () => {
    throw unsafe();
  });
  parser.on('cdata', () => {
    throw unsafe();
  });
  parser.on('xmldecl', (declaration) => {
    if (
      declaration.version !== '1.0' ||
      (declaration.encoding && !/^utf-?8$/i.test(declaration.encoding))
    )
      throw unsafe();
  });
  parser.on('opentag', (node) => {
    if (
      ++nodes > 2000 ||
      stack.length >= 32 ||
      node.prefix ||
      !['', SVG_NS].includes(node.uri) ||
      !Object.hasOwn(elementAttributes, node.local)
    )
      throw unsafe();
    if (!stack.length) {
      if (seenRoot || node.local !== 'svg') throw unsafe();
      seenRoot = true;
    } else if (
      node.local === 'svg' ||
      !['svg', 'g'].includes(stack[stack.length - 1])
    )
      throw unsafe();
    const attributes: Record<string, string> = {};
    for (const attr of Object.values(node.attributes)) {
      if (attr.name === 'xmlns' && !stack.length && attr.value === SVG_NS)
        continue;
      if (
        attr.prefix ||
        attr.uri ||
        !elementAttributes[node.local].has(attr.name)
      )
        throw unsafe();
      attribute(attr.name, attr.value);
      if (attr.name === 'transform') {
        transformFunctions += (attr.value.match(/\(/g) ?? []).length;
        if (transformFunctions > 32) throw unsafe();
      }
      geometryNumbers += (
        attr.value.match(new RegExp(numberPattern, 'g')) ?? []
      ).length;
      if (geometryNumbers > 20_000) throw unsafe();
      attributes[attr.name] = attr.value;
    }
    if (!stack.length) {
      const viewBox = attributes.viewBox
        ? numberList(attributes.viewBox)
        : undefined;
      const dimension = (name: 'width' | 'height', fallback?: number) => {
        const value = attributes[name];
        if (!value) return fallback ?? 0;
        const match = dimensions.exec(value);
        if (!match) throw unsafe();
        return number(match[1]);
      };
      width = Math.ceil(dimension('width', viewBox?.[2]));
      height = Math.ceil(dimension('height', viewBox?.[3]));
      if (
        width <= 0 ||
        height <= 0 ||
        width > 4096 ||
        height > 4096 ||
        width * height > MAX_PIXELS
      )
        throw unsafe();
      attributes.width = String(width);
      attributes.height = String(height);
      attributes.xmlns = SVG_NS;
    }
    output.push(
      `<${node.local}${Object.entries(attributes)
        .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
        .join('')}>`,
    );
    stack.push(node.local);
  });
  parser.on('text', (value) => {
    if (
      stack[stack.length - 1] === 'title' ||
      stack[stack.length - 1] === 'desc'
    ) {
      if (value.length > 1000) throw unsafe();
      output.push(escapeXml(value));
    } else if (value.trim()) throw unsafe();
  });
  parser.on('closetag', (node) => {
    if (stack.pop() !== node.local) throw unsafe();
    output.push(`</${node.local}>`);
  });
  try {
    parser.write(source).close();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unsafe();
  }
  if (!seenRoot || stack.length) throw unsafe();
  try {
    const png = await sharp(Buffer.from(output.join('')), {
      limitInputPixels: MAX_PIXELS,
      density: 72,
    })
      .resize(width, height)
      .ensureAlpha()
      .png()
      .timeout({ seconds: 5 })
      .toBuffer();
    if (png.length > 5 * 1024 * 1024)
      throw new ApiError(413, 'IMAGE_TOO_LARGE');
    return png;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unsafe();
  }
}
