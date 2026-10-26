import { describe, expect, it } from 'vitest';
import {
  CreatorScriptError,
  creatorDisclosure,
  generateLocalCreatorPlan,
  MAX_CREATOR_PLAN_BYTES,
  validateCreatorAffiliateUrl,
  validateCreatorBrief,
  validateCreatorPlan,
} from '@/lib/creator-script';
import type { CreatorBrief, CreatorPlan } from '@/lib/creator-script';

const brief = (patch: Partial<CreatorBrief> = {}) =>
  validateCreatorBrief({
    mode: 'ugc',
    language: 'fr',
    subject: 'Sac Alba',
    facts: ['Deux poches intérieures', 'Coloris sable'],
    ...patch,
  });
function code(fn: () => unknown, expected: string) {
  try {
    fn();
    throw new Error('Expected validation to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(CreatorScriptError);
    expect((error as CreatorScriptError).code).toBe(expected);
  }
}

describe('creator brief and editorial plans', () => {
  it('prepares usable scene timing and factual UGC copy without inventing a testimonial', () => {
    const input = brief();
    const plan = generateLocalCreatorPlan(input);
    expect(plan.source).toBe('local');
    expect(plan.mode).toBe('ugc');
    expect(plan.format).toBe('9:16');
    expect(plan.scenes).toHaveLength(4);
    expect(
      plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    ).toBe(30);
    expect(
      plan.scenes.every(
        (scene) => scene.mediaId === null && scene.durationSeconds >= 2,
      ),
    ).toBe(true);
    const copy = [
      plan.hook,
      plan.description,
      ...plan.scenes.map((scene) => scene.narration),
    ].join(' ');
    for (const fact of input.facts) expect(copy).toContain(fact);
    expect(copy).not.toMatch(
      /j'ai testé|je recommande|best.?seller|garanti|livraison gratuite|discount|premium|certifié/i,
    );
    expect(validateCreatorPlan(plan, input)).toEqual(plan);
  });

  it('writes English editorial framing while preserving supplied names and facts', () => {
    const plan = generateLocalCreatorPlan(
      brief({ language: 'en', facts: ['Two inner pockets', 'Sand colour'] }),
    );
    expect(plan.language).toBe('en');
    expect(plan.hook).toContain('Before choosing');
    expect(plan.scenes.map((scene) => scene.narration).join(' ')).toContain(
      'Two inner pockets',
    );
    expect(plan.cta).toBe('Check the product page for details.');
    expect(plan.adDisclosure).toBe('');
  });

  it('makes the selected tone visible without changing supplied product facts', () => {
    const plain = generateLocalCreatorPlan(brief({ tone: 'clear' }));
    const warm = generateLocalCreatorPlan(brief({ tone: 'warm' }));
    const energetic = generateLocalCreatorPlan(brief({ tone: 'energetic' }));
    expect(warm.hook).toContain('Découvrons cela ensemble.');
    expect(energetic.hook).toContain('Allons à l’essentiel !');
    expect(new Set([plain.hook, warm.hook, energetic.hook]).size).toBe(3);
    expect(warm.scenes[1].narration).toBe(plain.scenes[1].narration);
    expect(energetic.scenes[1].narration).toBe(plain.scenes[1].narration);
  });

  it('keeps affiliate disclosure canonical in both languages and links as metadata', () => {
    for (const language of ['fr', 'en'] as const) {
      const input = brief({
        mode: 'affiliate',
        language,
        affiliateUrl: 'https://shop.example/item?ref=studio',
      });
      const plan = generateLocalCreatorPlan(input);
      expect(plan.adDisclosure).toBe(creatorDisclosure(language));
      expect(plan.description).toContain(plan.affiliateUrl);
      expect(plan.scenes[0].onScreenText).toContain(plan.adDisclosure);
      expect(plan.scenes.at(-1)?.onScreenText).toContain(plan.adDisclosure);
      code(
        () => validateCreatorPlan({ ...plan, adDisclosure: '' }),
        'CREATOR_DISCLOSURE_REQUIRED',
      );
      code(
        () => validateCreatorPlan({ ...plan, adDisclosure: 'Advertisement' }),
        'CREATOR_DISCLOSURE_REQUIRED',
      );
    }
    code(() => brief({ mode: 'affiliate' }), 'CREATOR_AFFILIATE_URL_REQUIRED');
    const ugcWithLink = generateLocalCreatorPlan(
      brief({ affiliateUrl: 'https://shop.example/ugc' }),
    );
    expect(ugcWithLink.adDisclosure).toBe(creatorDisclosure('fr'));
    const long = generateLocalCreatorPlan(
      brief({
        mode: 'affiliate',
        affiliateUrl: 'https://shop.example/long',
        facts: Array.from(
          { length: 16 },
          (_, index) => `${index} ${'Détail fourni '.repeat(25)}`,
        ),
      }),
    );
    expect(long.description.length).toBeLessThanOrEqual(3500);
    expect(long.description).toContain(long.adDisclosure);
    expect(long.description).toContain(long.affiliateUrl);
  });

  it('rejects executable, credential-bearing and private affiliate destination URLs', () => {
    for (const affiliateUrl of [
      'javascript:alert(1)',
      'file:///tmp/private',
      'http://shop.example/a',
      'https://user:password@shop.example',
      'https://127.0.0.1',
      'https://[::1]',
      'https://localhost',
      'https://shop.internal',
      'https://192.168.1.4',
    ])
      code(
        () => validateCreatorAffiliateUrl(affiliateUrl),
        'CREATOR_INVALID_AFFILIATE_URL',
      );
    expect(validateCreatorAffiliateUrl('')).toBe('');
    expect(
      validateCreatorAffiliateUrl('https://SHOP.example/produit?ref=été'),
    ).toBe('https://shop.example/produit?ref=%C3%A9t%C3%A9');
  });

  it('maintains a character bible across fictional episodes and supplies an actual cliffhanger', () => {
    const characters = [
      {
        name: 'Nora',
        description: 'Photographe, cheveux courts, veste bleue.',
      },
      { name: 'Awa', description: 'Sa sœur, manteau rouge et carnet noir.' },
    ];
    const first = generateLocalCreatorPlan(
      brief({
        mode: 'story',
        subject: 'La lettre oubliée',
        characters,
        facts: ['Une lettre arrive sans signature.'],
        episode: 1,
      }),
    );
    const second = generateLocalCreatorPlan(
      brief({
        mode: 'story',
        subject: 'La lettre oubliée',
        characters,
        episode: 2,
      }),
    );
    expect(first.characters).toEqual(characters);
    expect(second.characters).toEqual(characters);
    expect(first.title).toContain('Épisode 1');
    expect(second.title).toContain('Épisode 2');
    expect(first.description).toContain('Fiction originale.');
    expect(first.scenes.map((scene) => scene.narration).join(' ')).toContain(
      'Une lettre arrive sans signature.',
    );
    expect(first.scenes.at(-1)?.narration).toContain(
      'Il reste quelque chose que tu dois savoir.',
    );
    expect(first.scenes.at(-1)?.onScreenText).toBe('À suivre…');
    expect(
      first.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    ).toBe(60);
  });

  it('generates neutral fictional defaults without inventing a portrait or media reference', () => {
    const plan = generateLocalCreatorPlan(brief({ mode: 'story' }));
    expect(plan.characters).toHaveLength(2);
    expect(plan.characters[0].name).toBe('Personnage A');
    expect(plan.scenes.every((scene) => scene.mediaId === null)).toBe(true);
    code(
      () => validateCreatorPlan({ ...plan, characters: [] }),
      'CREATOR_CHARACTERS_REQUIRED',
    );
    code(
      () =>
        brief({
          characters: [
            { name: 'Nora', description: '' },
            { name: 'nora', description: '' },
          ],
        }),
      'CREATOR_DUPLICATE_CHARACTER',
    );
    code(() => brief({ episode: 1.5 }), 'CREATOR_INVALID_EPISODE');
  });

  it('supports ten-minute YouTube chapter plans and preserves all supplied facts', () => {
    const facts = Array.from(
      { length: 16 },
      (_, index) => `Information vérifiée numéro ${index + 1}.`,
    );
    const input = brief({ mode: 'youtube', durationSeconds: 600, facts });
    const plan = generateLocalCreatorPlan(input);
    expect(plan.format).toBe('16:9');
    expect(plan.scenes.length).toBeGreaterThanOrEqual(10);
    expect(plan.scenes.length).toBeLessThanOrEqual(24);
    expect(plan.scenes.every((scene) => scene.durationSeconds <= 60)).toBe(
      true,
    );
    expect(
      plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    ).toBeCloseTo(600, 3);
    const copy = plan.scenes.map((scene) => scene.narration).join(' ');
    for (const fact of facts) expect(copy).toContain(fact);
    expect(plan.scenes[1].title).toBe('Ce que nous allons voir');
    expect(plan.scenes.at(-2)?.title).toBe('Les points à retenir');
  });

  it('handles minimum short duration without invalid scenes or a duration drift', () => {
    for (const durationSeconds of [5, 5.001, 6, 7, 17, 119.999, 120]) {
      const plan = generateLocalCreatorPlan(brief({ durationSeconds }));
      expect(
        Math.round(
          plan.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) *
            1000,
        ),
      ).toBe(Math.round(durationSeconds * 1000));
      expect(
        plan.scenes.every(
          (scene) => scene.durationSeconds >= 2 && scene.durationSeconds <= 60,
        ),
      ).toBe(true);
    }
  });

  it('rejects unsupported fields, malformed content and excessive duration at the boundary', () => {
    code(
      () => validateCreatorBrief({ ...brief(), provider: 'paid' }),
      'CREATOR_INVALID_INPUT',
    );
    code(
      () => validateCreatorBrief({ ...brief(), mode: 'unknown' }),
      'CREATOR_INVALID_INPUT',
    );
    code(() => brief({ subject: '\x00' }), 'CREATOR_INVALID_TEXT');
    code(
      () => brief({ facts: Array(17).fill('A fact') }),
      'CREATOR_INVALID_FACTS',
    );
    for (const durationSeconds of [
      0,
      4.99,
      121,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])
      code(() => brief({ durationSeconds }), 'CREATOR_INVALID_DURATION');
    code(
      () => brief({ mode: 'youtube', durationSeconds: 601 }),
      'CREATOR_INVALID_DURATION',
    );
    code(
      () => brief({ mode: 'youtube', durationSeconds: 29 }),
      'CREATOR_INVALID_DURATION',
    );
  });

  it('validates editable scenes, media IDs, text bounds and immutable campaign context', () => {
    const input = brief();
    const plan = generateLocalCreatorPlan(input);
    const scene = plan.scenes[0];
    const edited = {
      ...plan,
      scenes: [
        {
          ...scene,
          narration: 'Voici ma présentation relue.',
          mediaId: 'authorised-image_1',
        },
        ...plan.scenes.slice(1),
      ],
    };
    expect(validateCreatorPlan(edited, input).scenes[0].mediaId).toBe(
      'authorised-image_1',
    );
    code(
      () =>
        validateCreatorPlan({
          ...plan,
          scenes: [{ ...scene, mediaId: '../secret' }, ...plan.scenes.slice(1)],
        }),
      'CREATOR_INVALID_MEDIA_ID',
    );
    code(
      () => validateCreatorPlan({ ...plan, scenes: [scene, scene] }),
      'CREATOR_INVALID_SCENE_ID',
    );
    code(
      () =>
        validateCreatorPlan({
          ...plan,
          scenes: [
            { ...scene, onScreenText: '1\n2\n3\n4\n5' },
            ...plan.scenes.slice(1),
          ],
        }),
      'CREATOR_CAPTION_LIMIT',
    );
    code(
      () =>
        validateCreatorPlan({
          ...plan,
          scenes: [
            { ...scene, narration: 'A'.repeat(2001) },
            ...plan.scenes.slice(1),
          ],
        }),
      'CREATOR_INVALID_TEXT',
    );
    code(
      () =>
        validateCreatorPlan(
          {
            ...plan,
            mode: 'story',
            characters: [{ name: 'A', description: '' }],
          },
          input,
        ),
      'CREATOR_PLAN_BRIEF_MISMATCH',
    );
    code(
      () => validateCreatorPlan({ ...plan, scenes: [] }),
      'CREATOR_SCENE_LIMIT',
    );
  });

  it('bounds the full UTF-8 plan as well as individual fields', () => {
    const source = generateLocalCreatorPlan(
      brief({ mode: 'youtube', durationSeconds: 600 }),
    );
    const plan: CreatorPlan = {
      ...source,
      scenes: Array.from({ length: 24 }, (_, index) => ({
        id: `scene-${index}`,
        title: 'Une scène',
        narration: 'é'.repeat(1900),
        onScreenText: 'Texte',
        visualDirection: 'Un visuel',
        durationSeconds: 2,
        mediaId: null,
      })),
    };
    expect(
      new TextEncoder().encode(JSON.stringify(plan)).byteLength,
    ).toBeGreaterThan(MAX_CREATOR_PLAN_BYTES);
    code(() => validateCreatorPlan(plan), 'CREATOR_PLAN_TOO_LARGE');
  });
});
