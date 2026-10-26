/** Shared browser/server data contract. This module never imports a service or executes a model. */
export type CreatorMode = 'ugc' | 'affiliate' | 'story' | 'youtube';
export type CreatorLanguage = 'fr' | 'en';
export type CreatorFormat = '9:16' | '16:9' | '1:1' | '4:5';
export type CreatorCharacter = { name: string; description: string };
export type CreatorBrief = {
  mode: CreatorMode;
  language: CreatorLanguage;
  subject: string;
  facts: string[];
  audience: string;
  tone: 'clear' | 'warm' | 'energetic';
  durationSeconds: number;
  format: CreatorFormat;
  affiliateUrl: string;
  characters: CreatorCharacter[];
  episode: number;
};
export type CreatorScene = {
  id: string;
  title: string;
  narration: string;
  onScreenText: string;
  visualDirection: string;
  durationSeconds: number;
  mediaId: string | null;
};
export type CreatorPlan = {
  version: 1;
  source: 'local' | 'ollama';
  mode: CreatorMode;
  language: CreatorLanguage;
  format: CreatorFormat;
  title: string;
  hook: string;
  description: string;
  cta: string;
  adDisclosure: string;
  affiliateUrl: string;
  characters: CreatorCharacter[];
  episode: number;
  scenes: CreatorScene[];
};
export const MAX_CREATOR_SCENES = 24;
export const MAX_CREATOR_PLAN_BYTES = 48 * 1024;
export class CreatorScriptError extends Error {
  readonly status = 400;
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CreatorScriptError';
  }
}
const modes = ['ugc', 'affiliate', 'story', 'youtube'];
const languages = ['fr', 'en'];
const formats = ['9:16', '16:9', '1:1', '4:5'];
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
function fail(code: string): never {
  throw new CreatorScriptError(code);
}
function object(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('CREATOR_INVALID_INPUT');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)))
    fail('CREATOR_INVALID_INPUT');
  return result;
}
function text(
  value: unknown,
  max: number,
  optional = false,
  multiline = false,
): string {
  if (value === undefined && optional) return '';
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  )
    fail('CREATOR_INVALID_TEXT');
  const normalized = value.replace(/\r\n?/g, '\n');
  const result = (
    multiline ? normalized : normalized.replace(/\s+/g, ' ')
  ).trim();
  if (!optional && !result) fail('CREATOR_INVALID_TEXT');
  return result;
}
function choice<T extends string>(
  value: unknown,
  allowed: readonly string[],
  fallback?: T,
): T {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value))
    fail('CREATOR_INVALID_INPUT');
  return value as T;
}
function number(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail('CREATOR_INVALID_DURATION');
  return Math.round(value * 1000) / 1000;
}
function episode(value: unknown): number {
  if (value === undefined) return 1;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 9999
  )
    fail('CREATOR_INVALID_EPISODE');
  return value;
}
function characters(value: unknown): CreatorCharacter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 6)
    fail('CREATOR_INVALID_CHARACTERS');
  const seen = new Set<string>();
  return value.map((item) => {
    const input = object(item, ['name', 'description']);
    const name = text(input.name, 60);
    const key = name.toLocaleLowerCase('fr');
    if (seen.has(key)) fail('CREATOR_DUPLICATE_CHARACTER');
    seen.add(key);
    return { name, description: text(input.description, 500, true) };
  });
}
/** Metadata only: no URL in a brief or plan is fetched by this module. */
export function validateCreatorAffiliateUrl(value: unknown): string {
  const raw = text(value, 2048, true);
  if (!raw) return '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail('CREATOR_INVALID_AFFILIATE_URL');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)
  )
    fail('CREATOR_INVALID_AFFILIATE_URL');
  return url.href;
}
export function creatorDisclosure(language: CreatorLanguage): string {
  return language === 'fr'
    ? 'Publicité · lien affilié.'
    : 'Ad · affiliate link.';
}
export function validateCreatorBrief(value: unknown): CreatorBrief {
  const input = object(value, [
    'mode',
    'language',
    'subject',
    'facts',
    'audience',
    'tone',
    'durationSeconds',
    'format',
    'affiliateUrl',
    'characters',
    'episode',
  ]);
  const mode = choice<CreatorMode>(input.mode, modes);
  const language = choice<CreatorLanguage>(input.language, languages, 'fr');
  const rawFacts = input.facts ?? [];
  if (!Array.isArray(rawFacts) || rawFacts.length > 16)
    fail('CREATOR_INVALID_FACTS');
  const facts = [...new Set(rawFacts.map((item) => text(item, 400)))];
  const affiliateUrl = validateCreatorAffiliateUrl(input.affiliateUrl);
  if (mode === 'affiliate' && !affiliateUrl)
    fail('CREATOR_AFFILIATE_URL_REQUIRED');
  return {
    mode,
    language,
    subject: text(input.subject, 500),
    facts,
    audience: text(input.audience, 160, true),
    tone: choice(input.tone, ['clear', 'warm', 'energetic'], 'clear'),
    durationSeconds: number(
      input.durationSeconds ??
        (mode === 'youtube' ? 180 : mode === 'story' ? 60 : 30),
      mode === 'youtube' ? 30 : 5,
      mode === 'youtube' ? 600 : 120,
    ),
    format: choice<CreatorFormat>(
      input.format,
      formats,
      mode === 'youtube' ? '16:9' : '9:16',
    ),
    affiliateUrl,
    characters: characters(input.characters),
    episode: episode(input.episode),
  };
}
const planKeys = [
  'version',
  'source',
  'mode',
  'language',
  'format',
  'title',
  'hook',
  'description',
  'cta',
  'adDisclosure',
  'affiliateUrl',
  'characters',
  'episode',
  'scenes',
];
export function validateCreatorPlan(
  value: unknown,
  brief?: CreatorBrief,
): CreatorPlan {
  const input = object(value, planKeys);
  if (input.version !== 1) fail('CREATOR_UNSUPPORTED_PLAN');
  const mode = choice<CreatorMode>(input.mode, modes);
  const language = choice<CreatorLanguage>(input.language, languages);
  const affiliateUrl = validateCreatorAffiliateUrl(input.affiliateUrl);
  if (mode === 'affiliate' && !affiliateUrl)
    fail('CREATOR_AFFILIATE_URL_REQUIRED');
  const adDisclosure = text(input.adDisclosure, 160, true);
  if (
    (mode === 'affiliate' || affiliateUrl) &&
    adDisclosure !== creatorDisclosure(language)
  )
    fail('CREATOR_DISCLOSURE_REQUIRED');
  if (
    !Array.isArray(input.scenes) ||
    !input.scenes.length ||
    input.scenes.length > MAX_CREATOR_SCENES
  )
    fail('CREATOR_SCENE_LIMIT');
  const seen = new Set<string>();
  const scenes = input.scenes.map((value) => {
    const scene = object(value, [
      'id',
      'title',
      'narration',
      'onScreenText',
      'visualDirection',
      'durationSeconds',
      'mediaId',
    ]);
    if (
      typeof scene.id !== 'string' ||
      !idPattern.test(scene.id) ||
      seen.has(scene.id)
    )
      fail('CREATOR_INVALID_SCENE_ID');
    seen.add(scene.id);
    const onScreenText = text(scene.onScreenText, 500, true, true);
    if (onScreenText.split('\n').length > 4) fail('CREATOR_CAPTION_LIMIT');
    const mediaId =
      scene.mediaId == null || scene.mediaId === '' ? null : scene.mediaId;
    if (
      mediaId !== null &&
      (typeof mediaId !== 'string' || !idPattern.test(mediaId))
    )
      fail('CREATOR_INVALID_MEDIA_ID');
    return {
      id: scene.id,
      title: text(scene.title, 160),
      narration: text(scene.narration, 2000, true, true),
      onScreenText,
      visualDirection: text(scene.visualDirection, 600, true, true),
      durationSeconds: number(scene.durationSeconds, 2, 60),
      mediaId,
    };
  });
  const duration =
    Math.round(
      scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) * 1000,
    ) / 1000;
  if (
    duration < (mode === 'youtube' ? 30 : 5) ||
    duration > (mode === 'youtube' ? 600 : 120)
  )
    fail('CREATOR_DURATION_LIMIT');
  const result: CreatorPlan = {
    version: 1,
    source: choice(input.source, ['local', 'ollama']),
    mode,
    language,
    format: choice<CreatorFormat>(input.format, formats),
    title: text(input.title, 180),
    hook: text(input.hook, 300),
    description: text(input.description, 3500, true, true),
    cta: text(input.cta, 300),
    adDisclosure,
    affiliateUrl,
    characters: characters(input.characters),
    episode: episode(input.episode),
    scenes,
  };
  if (mode === 'story' && !result.characters.length)
    fail('CREATOR_CHARACTERS_REQUIRED');
  if (
    brief &&
    (result.mode !== brief.mode ||
      result.language !== brief.language ||
      result.format !== brief.format ||
      result.affiliateUrl !== brief.affiliateUrl ||
      result.episode !== brief.episode)
  )
    fail('CREATOR_PLAN_BRIEF_MISMATCH');
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    MAX_CREATOR_PLAN_BYTES
  )
    fail('CREATOR_PLAN_TOO_LARGE');
  return result;
}
function clip(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
type SceneDraft = Omit<CreatorScene, 'id' | 'durationSeconds' | 'mediaId'>;
/** Editorial templates use supplied facts; they do not claim AI inference or a personal product experience. */
export function generateLocalCreatorPlan(value: CreatorBrief): CreatorPlan {
  const brief = validateCreatorBrief(value);
  const fr = brief.language === 'fr';
  const subject = clip(brief.subject, 180);
  const title = clip(
    brief.mode === 'story'
      ? `${subject} — ${fr ? 'Épisode' : 'Episode'} ${brief.episode}`
      : subject,
    180,
  );
  const adDisclosure = brief.affiliateUrl
    ? creatorDisclosure(brief.language)
    : '';
  const cta =
    brief.mode === 'story'
      ? fr
        ? 'Découvrez la suite au prochain épisode.'
        : 'Discover what happens in the next episode.'
      : brief.mode === 'youtube'
        ? fr
          ? 'Partagez votre question pour une prochaine vidéo.'
          : 'Share your question for a future video.'
        : brief.mode === 'affiliate'
          ? fr
            ? 'Consultez les détails via le lien affilié dans la description.'
            : 'Check the details through the affiliate link in the description.'
          : fr
            ? 'Consultez la fiche produit pour les détails.'
            : 'Check the product page for details.';
  const baseHook =
    brief.mode === 'story'
      ? fr
        ? `Un choix peut tout changer. ${subject}`
        : `One choice can change everything. ${subject}`
      : brief.mode === 'youtube'
        ? fr
          ? `Prenons le temps de comprendre : ${subject}.`
          : `Let’s take a closer look at ${subject}.`
        : fr
          ? `Avant de choisir ${subject}, regardons les détails.`
          : `Before choosing ${subject}, let’s look at the details.`;
  const toneIntro =
    brief.tone === 'warm'
      ? fr
        ? 'Découvrons cela ensemble. '
        : 'Let’s explore this together. '
      : brief.tone === 'energetic'
        ? fr
          ? 'Allons à l’essentiel ! '
          : 'Let’s get to it! '
        : '';
  const hook = clip(`${toneIntro}${baseHook}`, 300);
  const names =
    brief.mode === 'story'
      ? brief.characters.length
        ? brief.characters
        : [
            {
              name: fr ? 'Personnage A' : 'Character A',
              description: fr
                ? 'Cherche une réponse et hésite avant de décider.'
                : 'Seeks an answer and hesitates before deciding.',
            },
            {
              name: fr ? 'Personnage B' : 'Character B',
              description: fr
                ? 'Possède une information qui change la situation.'
                : 'Has information that changes the situation.',
            },
          ]
      : [];
  let drafts: SceneDraft[];
  const draft = (
    sceneTitle: string,
    narration: string,
    onScreenText: string,
    visualDirection: string,
  ): SceneDraft => ({
    title: sceneTitle,
    narration,
    onScreenText: clip(onScreenText, 500),
    visualDirection,
  });
  if (brief.mode === 'story') {
    const a = names[0].name,
      b = names[1]?.name ?? names[0].name;
    drafts = [
      draft(
        fr ? 'Accroche' : 'Hook',
        hook,
        `${fr ? 'Fiction · Épisode' : 'Fiction · Episode'} ${brief.episode}`,
        fr
          ? `Plan d'ouverture autour du thème « ${subject} ». Conserver l'apparence de ${a} d'un plan à l'autre.`
          : `Opening shot around “${subject}”. Keep ${a} visually consistent between scenes.`,
      ),
      draft(
        fr ? 'Les personnages' : 'The characters',
        names
          .map((person) => `${person.name}. ${person.description}`)
          .join(' '),
        names.map((person) => person.name).join(' · '),
        fr
          ? 'Présenter les personnages dans un même décor, avec leurs références habituelles.'
          : 'Introduce the characters in one setting, using their recurring references.',
      ),
      draft(
        fr ? 'Le déclencheur' : 'The incident',
        brief.facts[0] ||
          (fr
            ? `${a} s'apprête à prendre une décision. Un message de ${b} vient tout compliquer.`
            : `${a} is about to make a decision. A message from ${b} complicates everything.`),
        fr ? 'Un message inattendu' : 'An unexpected message',
        fr
          ? 'Montrer le message, puis une réaction. Utiliser des images ou séquences autorisées.'
          : 'Show the message, then a reaction. Use authorised images or footage.',
      ),
      draft(
        fr ? 'Le face-à-face' : 'The confrontation',
        fr
          ? `${a} : « Pourquoi ne pas me l'avoir dit ? » ${b} : « Je voulais comprendre avant de te répondre. »`
          : `${a}: “Why didn’t you tell me?” ${b}: “I wanted to understand before answering you.”`,
        fr ? 'Une réponse change tout' : 'One answer changes everything',
        fr
          ? `Alterner les plans de ${a} et ${b}, sans changer leur apparence.`
          : `Alternate between ${a} and ${b} while keeping their appearance consistent.`,
      ),
      draft(
        fr ? 'Le dilemme' : 'The dilemma',
        brief.facts[1] ||
          (fr
            ? `${a} hésite : poser une dernière question, ou partir sans connaître toute l'histoire. Le silence de ${b} devient difficile à ignorer.`
            : `${a} hesitates: ask one more question, or leave without knowing the whole story. ${b}'s silence is becoming hard to ignore.`),
        fr ? 'Que choisir ?' : 'What should happen next?',
        fr
          ? 'Ralentir le montage pour laisser la décision en suspens.'
          : 'Slow the edit to let the decision hang in the air.',
      ),
      draft(
        fr ? 'Suspense final' : 'Cliffhanger',
        fr
          ? `Au moment où ${a} va répondre, un nouveau message apparaît : « Il reste quelque chose que tu dois savoir. » ${cta}`
          : `Just as ${a} is about to answer, a new message appears: “There is something else you need to know.” ${cta}`,
        fr ? 'À suivre…' : 'To be continued…',
        fr
          ? 'Terminer sur un détail qui ouvre le prochain épisode, sans prétendre raconter un fait réel.'
          : 'End on a detail that opens the next episode, without presenting fiction as a real event.',
      ),
    ];
  } else if (brief.mode === 'youtube') {
    const target = Math.min(
      MAX_CREATOR_SCENES,
      Math.max(
        6,
        Math.ceil(brief.durationSeconds / 40),
        brief.facts.length + 4,
      ),
    );
    drafts = [
      draft(
        fr ? 'Introduction' : 'Introduction',
        `${hook} ${fr ? 'Voici les informations et les points à examiner pour se faire une idée.' : 'Here are the supplied details and the points to consider.'}`,
        subject,
        fr
          ? 'Ouvrir sur le sujet ou le produit, puis afficher le titre.'
          : 'Open on the topic or product, then show the title.',
      ),
      draft(
        fr ? 'Ce que nous allons voir' : 'What we will cover',
        fr
          ? `Nous allons présenter ${subject}, regarder les éléments disponibles, puis reprendre les points essentiels. ${brief.audience ? `Cette présentation s'adresse à ${brief.audience}.` : ''}`
          : `We will introduce ${subject}, examine the available information, then recap the main points. ${brief.audience ? `This presentation is for ${brief.audience}.` : ''}`,
        fr
          ? 'Présentation · détails · synthèse'
          : 'Introduction · details · recap',
        fr
          ? 'Afficher le déroulé en trois parties.'
          : 'Show the three-part outline.',
      ),
    ];
    for (let i = 0; i < target - 4; i++) {
      const fact = brief.facts[i];
      const point = fr ? `Point ${i + 1}` : `Point ${i + 1}`;
      drafts.push(
        draft(
          point,
          fact
            ? fr
              ? `${point}. ${fact} C'est l'un des éléments fournis pour cette présentation. Regardez le détail correspondant à l'image et vérifiez son importance pour votre situation.`
              : `${point}. ${fact} This is one of the supplied details for this presentation. Look at the corresponding visual and consider its relevance to your situation.`
            : fr
              ? `Pour approfondir ${subject}, observons les détails disponibles et la façon dont ils sont présentés. Les caractéristiques non renseignées doivent être vérifiées dans les sources d'origine.`
              : `To explore ${subject} further, look at the available details and how they are presented. Unspecified characteristics should be checked with the original source.`,
          clip(fact || subject, 240),
          fr
            ? 'Illustrer ce point avec votre photo, votre démonstration ou une séquence autorisée.'
            : 'Illustrate this point with your photo, demonstration, or authorised footage.',
        ),
      );
    }
    drafts.push(
      draft(
        fr ? 'Les points à retenir' : 'Key takeaways',
        clip(
          brief.facts.length
            ? brief.facts.join(' ')
            : fr
              ? `Pour ${subject}, appuyez-vous sur les informations disponibles et sur vos propres critères.`
              : `For ${subject}, rely on the available information and your own criteria.`,
          1800,
        ),
        fr ? 'Les points à retenir' : 'Key takeaways',
        fr
          ? 'Reprendre les visuels importants, sans ajouter de nouvelle promesse.'
          : 'Recap the important visuals without adding a new claim.',
      ),
    );
    drafts.push(
      draft(
        fr ? 'Conclusion' : 'Conclusion',
        cta,
        cta,
        fr
          ? 'Conclure sur une image claire et un appel à l’action.'
          : 'Close with a clear image and a call to action.',
      ),
    );
  } else {
    const facts = brief.facts.length
      ? brief.facts
      : [
          fr
            ? 'Regardez les détails visibles et consultez la fiche pour les caractéristiques complètes.'
            : 'Look at the visible details and check the product page for the full specifications.',
        ];
    const midpoint = Math.ceil(facts.length / 2);
    drafts = [
      draft(
        fr ? 'Accroche' : 'Hook',
        hook,
        `${adDisclosure ? `${adDisclosure}\n` : ''}${clip(subject, 180)}`,
        fr
          ? 'Montrer le produit en plan rapproché avec votre image ou votre vidéo.'
          : 'Show a close view of the product using your own image or video.',
      ),
      draft(
        fr ? 'Les détails du produit' : 'Product details',
        clip(facts.slice(0, midpoint).join(' '), 1800),
        clip(facts[0], 250),
        fr
          ? 'Mettre en évidence uniquement les éléments réellement visibles ou renseignés.'
          : 'Highlight only details that are visible or supplied.',
      ),
      draft(
        fr ? 'Présentation en situation' : 'In context',
        clip(
          facts.slice(midpoint).join(' ') ||
            (fr
              ? `Observez ${subject} dans cette présentation et comparez les détails avec vos besoins.`
              : `Look at ${subject} in this presentation and compare the details with your needs.`),
          1800,
        ),
        brief.audience ? clip(brief.audience, 160) : clip(subject, 180),
        fr
          ? 'Utiliser vos séquences pour montrer le produit, sans inventer un retour d’expérience.'
          : 'Use your footage to show the product without inventing personal experience.',
      ),
      draft(
        fr ? 'Pour aller plus loin' : 'Next step',
        cta,
        `${adDisclosure ? `${adDisclosure}\n` : ''}${cta}`,
        fr
          ? 'Terminer sur le produit et une invitation à consulter sa fiche.'
          : 'End on the product and an invitation to view its details.',
      ),
    ];
  }
  const count = Math.min(
    drafts.length,
    Math.max(1, Math.floor(brief.durationSeconds / 2)),
  );
  if (count < drafts.length)
    drafts =
      count === 1
        ? [drafts[0]]
        : [...drafts.slice(0, count - 1), drafts[drafts.length - 1]];
  const baseMillis = Math.floor((brief.durationSeconds * 1000) / drafts.length);
  const scenes = drafts.map((scene, index): CreatorScene => ({
    ...scene,
    id: `scene-${index + 1}`,
    durationSeconds:
      (index === drafts.length - 1
        ? Math.round(brief.durationSeconds * 1000) - baseMillis * index
        : baseMillis) / 1000,
    mediaId: null,
  }));
  const description = clip(
    [
      adDisclosure,
      brief.affiliateUrl,
      brief.mode === 'story'
        ? fr
          ? 'Fiction originale.'
          : 'Original fiction.'
        : '',
      subject,
      ...brief.facts,
    ]
      .filter(Boolean)
      .join('\n'),
    3500,
  );
  return validateCreatorPlan(
    {
      version: 1,
      source: 'local',
      mode: brief.mode,
      language: brief.language,
      format: brief.format,
      title,
      hook,
      description,
      cta,
      adDisclosure,
      affiliateUrl: brief.affiliateUrl,
      characters: names,
      episode: brief.episode,
      scenes,
    },
    brief,
  );
}
