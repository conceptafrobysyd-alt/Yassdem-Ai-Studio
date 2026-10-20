import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { rasterizeSvgLogo, SVG_LOGO_LIMIT } from '@/lib/svg-logo';
const svg = (content: string, attrs = 'width="32" height="24"') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${content}</svg>`,
  );

describe('restricted SVG logo rasterization', () => {
  it('renders real pixels from shapes and paths while retaining transparency', async () => {
    const png = await rasterizeSvgLogo(
      svg(
        '<title>Logo</title><g transform="translate(4,4)" opacity="0.5"><path d="M 0 0 L 16 0 L 16 12 L 0 12 Z" fill="#ff0000"/></g>',
      ),
    );
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 32, height: 24, channels: 4 });
    expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    const offset = (6 * info.width + 6) * 4;
    expect(data[offset]).toBe(255);
    expect(data[offset + 1]).toBe(0);
    expect(data[offset + 3]).toBeGreaterThanOrEqual(127);
    expect(data[offset + 3]).toBeLessThanOrEqual(128);
  });
  it('uses a bounded viewBox when explicit pixel dimensions are absent', async () => {
    const output = await rasterizeSvgLogo(
      svg(
        '<circle cx="10" cy="8" r="5" fill="rgb(0,128,255)"/>',
        'viewBox="0 0 20 16"',
      ),
    );
    expect(await sharp(output).metadata()).toMatchObject({
      width: 20,
      height: 16,
      format: 'png',
    });
  });
  it.each([
    '<script>alert(1)</script>',
    '<constructor/>',
    '<toString/>',
    '<__proto__/>',
    '<rect width="10" height="10" onload="alert(1)"/>',
    '<foreignObject><div>text</div></foreignObject>',
    '<image href="https://example.com/logo.png"/>',
    '<use href="#shape"/>',
    '<rect width="10" height="10" style="fill:red"/>',
    '<style>rect{fill:red}</style>',
    '<rect width="10" height="10" fill="url(https://example.com/a)"/>',
    '<animate attributeName="fill"/>',
    '<text x="1" y="5">font</text>',
    '<g xmlns="https://example.com/not-svg"><rect/></g>',
    '<rect xml:base="https://example.com/"/>',
    '<![CDATA[<rect/>]]>',
    '<path d="M0,0 L1,1" transform="translate(1) url(https://example.com)"/>',
  ])(
    'rejects executable, referenced or unsupported constructs: %s',
    async (content) => {
      await expect(rasterizeSvgLogo(svg(content))).rejects.toMatchObject({
        code: 'UNSAFE_SVG_LOGO',
      });
    },
  );
  it.each([
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg width="32" height="24">&xxe;</svg>',
    '<svg width="32" height="24"><title>&#x41;</title></svg>',
    '<?xml-stylesheet href="https://example.com/a.css"?><svg width="32" height="24"/>',
    '<svg width="32" height="24"><g></svg>',
    '<svg width="32" height="24"/><svg width="32" height="24"/>',
  ])('rejects declarations, entities and malformed XML', async (content) => {
    await expect(rasterizeSvgLogo(Buffer.from(content))).rejects.toMatchObject({
      code: 'UNSAFE_SVG_LOGO',
    });
  });
  it.each([
    'width="4097" height="1"',
    'width="4096" height="4096"',
    'width="0" height="12"',
    'width="100%" height="24"',
    'viewBox="0 0 1000000000 10"',
  ])('rejects unsafe or ambiguous dimensions: %s', async (attrs) => {
    await expect(
      rasterizeSvgLogo(svg('<rect width="10" height="10"/>', attrs)),
    ).rejects.toMatchObject({ code: 'UNSAFE_SVG_LOGO' });
  });
  it('caps source size before parsing and caps node complexity', async () => {
    await expect(
      rasterizeSvgLogo(Buffer.alloc(SVG_LOGO_LIMIT + 1, 32)),
    ).rejects.toMatchObject({ code: 'SVG_LOGO_TOO_LARGE' });
    await expect(
      rasterizeSvgLogo(svg('<rect/>'.repeat(2001))),
    ).rejects.toMatchObject({ code: 'UNSAFE_SVG_LOGO' });
    await expect(
      rasterizeSvgLogo(
        svg(
          `<g transform="${'scale(10000000) '.repeat(33)}"><rect width="1" height="1"/></g>`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'UNSAFE_SVG_LOGO' });
  });
});
