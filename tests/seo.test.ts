import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  project: {
    id: 'product-1',
    parameters: JSON.stringify({
      fashion: { lookId: 'keep-me' },
      timeline: ['clip-1'],
    }),
  } as { id: string; parameters: string } | null,
  generateJson: vi.fn(),
  writes: vi.fn(),
}));
vi.mock('@/lib/db', () => {
  const project = {
    findUnique: vi.fn(async () =>
      state.project ? { ...state.project } : null,
    ),
    update: vi.fn(async ({ data }: { data: { parameters: string } }) => {
      state.writes(data);
      if (state.project) state.project.parameters = data.parameters;
      return state.project;
    }),
  };
  return {
    db: {
      project,
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ project }),
    },
  };
});
vi.mock('@/lib/providers/ollama', () => ({
  OllamaProvider: class {
    generateJson = state.generateJson;
  },
}));
import {
  createSeoDocument,
  editSeoDocument,
  generateLocalSeo,
  getSeoDocument,
  seoCsvCell,
  seoToCsv,
  validateSeoInput,
  validateSeoUrl,
  validateSeoVersions,
} from '@/lib/seo';
import type { SeoInput } from '@/lib/seo';

const brief = (override: Partial<SeoInput> = {}) =>
  validateSeoInput({
    productName: 'Sac Alba',
    brand: 'Yassdem',
    category: 'Sacs',
    features: ['Deux poches intérieures', 'Coloris sable'],
    audience: '',
    keywords: ['sac Alba', 'sac sable', 'accessoires'],
    language: 'both',
    ...override,
  });
beforeEach(() => {
  state.project = {
    id: 'product-1',
    parameters: JSON.stringify({
      fashion: { lookId: 'keep-me' },
      timeline: ['clip-1'],
    }),
  };
  state.generateJson.mockReset();
  state.writes.mockReset();
});

describe('SEO fact based writing', () => {
  it('creates distinct bilingual copy from supplied facts without fabricated promises', () => {
    const input = brief();
    const versions = generateLocalSeo(input);
    expect(versions.map((entry) => entry.language)).toEqual(['fr', 'en']);
    for (const version of versions) {
      expect(new Set(version.titles).size).toBe(3);
      expect(new Set(version.descriptions).size).toBe(2);
      expect(version.titles.every((item) => item.includes('Sac Alba'))).toBe(
        true,
      );
      expect(version.descriptions[0]).toContain('Deux poches intérieures');
      expect(version.primaryKeyword).toBe('sac Alba');
      expect(version.secondaryKeywords).toEqual(['sac sable', 'accessoires']);
      expect(JSON.stringify(version)).not.toMatch(
        /gratuit|discount|bestseller|durable|garanti|livraison|shipping|sustainable|premium/i,
      );
    }
    expect(versions[0].cta).toBe('Consulter la fiche produit');
    expect(versions[1].cta).toBe('View product details');
    expect(validateSeoVersions(versions, input)).toEqual(versions);
  });
  it('honours content language independently of the interface', () => {
    expect(
      generateLocalSeo(brief({ language: 'en' })).map(
        (entry) => entry.language,
      ),
    ).toEqual(['en']);
    expect(generateLocalSeo(brief({ language: 'fr' }))[0].titles[1]).toContain(
      'Découvrir',
    );
    expect(() => validateSeoInput({ ...brief(), language: 'de' })).toThrow();
  });
  it('keeps long copy and required disclosures within natural Pinterest limits', () => {
    const input = brief({
      productName:
        'Produit avec un nom particulièrement long à afficher et des informations complémentaires utiles',
      brand: 'Une marque avec des informations complémentaires',
      category:
        'Accessoires et objets pour une présentation de collection détaillée',
      features: Array.from(
        { length: 8 },
        (_, index) => `${index} ${'Information produit '.repeat(7)}`,
      ),
      audience:
        'Un public souhaitant consulter les détails du produit avant toute décision',
      affiliateUrl: 'https://boutique.example/affiliation?ref=studio',
      adDisclosure:
        'Je peux percevoir une commission si vous passez commande depuis ce lien.',
    });
    for (const version of validateSeoVersions(generateLocalSeo(input), input)) {
      expect(version.titles.every((item) => item.length <= 100)).toBe(true);
      expect(
        version.descriptions.every(
          (item) => item.length <= 500 && item.endsWith(version.adDisclosure),
        ),
      ).toBe(true);
      expect(version.altText.length).toBeLessThanOrEqual(500);
      expect(version.board.length).toBeLessThanOrEqual(50);
    }
  });
  it('requires and preserves affiliate disclosures when editing', () => {
    expect(() =>
      brief({ affiliateUrl: 'https://shop.example/ref' }),
    ).toThrowError('SEO_DISCLOSURE_REQUIRED');
    const input = brief({
      affiliateUrl: 'https://shop.example/ref',
      adDisclosure: 'Commission possible.',
    });
    const versions = generateLocalSeo(input);
    expect(versions[0].adDisclosure).toContain('Publicité · lien affilié.');
    expect(versions[1].adDisclosure).toContain('Ad · affiliate link.');
    versions[0].descriptions[0] = 'Sans mention publicitaire.';
    expect(() => validateSeoVersions(versions, input)).toThrowError(
      'SEO_DISCLOSURE_REQUIRED',
    );
  });
  it('rejects duplicate, oversized or missing output instead of silently accepting it', () => {
    const input = brief({ language: 'fr' });
    const versions = generateLocalSeo(input);
    versions[0].titles[1] = versions[0].titles[0].toUpperCase();
    expect(() => validateSeoVersions(versions, input)).toThrow();
    const long = generateLocalSeo(input);
    long[0].titles[0] = 'x'.repeat(101);
    expect(() => validateSeoVersions(long, input)).toThrow();
    expect(() => validateSeoVersions([], input)).toThrow();
  });
  it('deduplicates keywords and bounds the supplied brief', () => {
    expect(brief({ keywords: ['Sac', 'sac', 'Accessoires'] }).keywords).toEqual(
      ['Sac', 'Accessoires'],
    );
    expect(() =>
      brief({ features: Array(9).fill('Une caractéristique') }),
    ).toThrow();
    expect(() => brief({ features: ['a'.repeat(161)] })).toThrow();
    expect(() => brief({ productName: '' })).toThrow();
  });
});

describe('destination metadata safety', () => {
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://127.1',
    'http://2130706433',
    'http://10.0.0.1',
    'https://192.168.1.2',
    'https://172.16.1.1',
    'https://[::1]',
    'https://[fc00::1]',
    'https://user:password@shop.example',
    'https://metadata.google.internal',
    'https://shop.local',
  ])('rejects unsafe or non-public URL %s', (url) =>
    expect(() => validateSeoUrl(url)).toThrow(),
  );
  it('allows public product metadata without fetching its destination', () => {
    expect(validateSeoUrl('http://shop.example/products/sac?color=sable')).toBe(
      'http://shop.example/products/sac?color=sable',
    );
    expect(validateSeoUrl('https://boutique.example/produit', true)).toBe(
      'https://boutique.example/produit',
    );
    expect(() => validateSeoUrl('http://shop.example/ref', true)).toThrow();
  });
});

describe('saved content and exports', () => {
  it('merges creation and human edits without losing project parameters', async () => {
    const created = await createSeoDocument('product-1', {
      input: brief(),
      mode: 'local',
    });
    expect(created.source).toBe('local');
    expect(state.generateJson).not.toHaveBeenCalled();
    const versions = structuredClone(created.versions);
    versions[0].titles[0] = 'Sac Alba · notre sélection';
    versions[0].board = 'Accessoires à découvrir';
    const edited = await editSeoDocument('product-1', { versions });
    expect(edited.versions[0].titles[0]).toBe('Sac Alba · notre sélection');
    expect(edited.createdAt).toBe(created.createdAt);
    expect(JSON.parse(state.project!.parameters)).toMatchObject({
      fashion: { lookId: 'keep-me' },
      timeline: ['clip-1'],
      seo: { source: 'local' },
    });
    expect(await getSeoDocument('product-1')).toEqual(edited);
  });
  it('saves only validated Ollama responses with truthful provenance', async () => {
    const input = brief({ language: 'en' });
    state.generateJson.mockResolvedValue({ versions: generateLocalSeo(input) });
    const created = await createSeoDocument('product-1', {
      input,
      mode: 'ollama',
    });
    expect(created.source).toBe('ollama');
    expect(state.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 2048,
        system: expect.stringContaining('Never invent'),
      }),
    );
    state.writes.mockClear();
    state.generateJson.mockResolvedValue({
      versions: [{ titles: ['fabricated'] }],
    });
    await expect(
      createSeoDocument('product-1', { input, mode: 'ollama' }),
    ).rejects.toMatchObject({ code: 'SEO_INVALID_MODEL_OUTPUT' });
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('does not disguise an unavailable AI provider as a successful local generation', async () => {
    state.generateJson.mockRejectedValue(new Error('OLLAMA_NOT_CONFIGURED'));
    await expect(
      createSeoDocument('product-1', { input: brief(), mode: 'ollama' }),
    ).rejects.toThrow('OLLAMA_NOT_CONFIGURED');
    expect(state.writes).not.toHaveBeenCalled();
  });
  it('rejects absent projects and missing saved content', async () => {
    expect(await getSeoDocument('product-1')).toBeNull();
    await expect(
      editSeoDocument('product-1', { versions: [] }),
    ).rejects.toMatchObject({ code: 'SEO_NOT_FOUND' });
    state.project = null;
    await expect(
      createSeoDocument('product-1', { input: brief() }),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });
  it('quotes CSV, guards spreadsheet formulas, and exports standard Pinterest columns', async () => {
    expect(seoCsvCell('Mot, "citation"\nSuite')).toBe(
      '"Mot, ""citation""\nSuite"',
    );
    for (const value of [
      '=HYPERLINK("https://bad.example")',
      '+SUM(1,1)',
      '-1+2',
      '@SUM(1)',
      ' \n=1',
    ])
      expect(seoCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    const document = await createSeoDocument('product-1', {
      input: brief({ url: 'https://shop.example/sac' }),
    });
    const csv = seoToCsv(document);
    expect(csv.startsWith('\uFEFF"Title","Media URL","Pinterest board"')).toBe(
      true,
    );
    expect(csv).toContain('"https://shop.example/sac"');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(7);
    expect(csv).toContain('Découvrir');
    expect(csv).toContain('Explore');
  });
});
