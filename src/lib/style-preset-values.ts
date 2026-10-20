/** Shared values only; this module contains no database or Node imports. */
export interface StylePresetParameters {
  fit: 'regular' | 'fitted' | 'relaxed' | 'oversized' | 'custom';
  length: string;
  colors: string[];
  accessories: string[];
  layering: string;
  coverage: string;
  mood: string;
  decor: string;
  pose: string;
  bodyFeatures: string;
}
export interface StylePreset {
  id: string;
  name: string;
  parameters: StylePresetParameters;
  createdAt: string;
  updatedAt: string;
}
export const DEFAULT_STYLE_PARAMETERS: StylePresetParameters = {
  fit: 'regular',
  length: '',
  colors: [],
  accessories: [],
  layering: '',
  coverage: '',
  mood: '',
  decor: '',
  pose: '',
  bodyFeatures: '',
};
export const STYLE_DESCRIPTOR_KEYS = [
  'length',
  'layering',
  'coverage',
  'mood',
  'decor',
  'pose',
  'bodyFeatures',
] as const;

/** Applying is explicit. Lists combine, nonempty preset descriptors override the
 * corresponding look fields, and the last applied fit wins. Model selection,
 * hijab and the creative prompt are outside this function's editable fields. */
export function applyStylePresetToLook<
  T extends {
    styles: string[];
    fit: StylePresetParameters['fit'];
    colors: string[];
    accessories: string[];
  },
>(
  current: T,
  preset: Pick<StylePreset, 'name' | 'parameters'>,
): T & StylePresetParameters {
  const styles = [...new Set([...current.styles, preset.name])];
  const colors = [...new Set([...current.colors, ...preset.parameters.colors])];
  const accessories = [
    ...new Set([...current.accessories, ...preset.parameters.accessories]),
  ];
  if ([styles, colors, accessories].some((list) => list.length > 12))
    throw new Error('STYLE_PRESET_LIST_LIMIT');
  const result = {
    ...DEFAULT_STYLE_PARAMETERS,
    ...current,
    styles,
    colors,
    accessories,
    fit: preset.parameters.fit,
  };
  for (const key of STYLE_DESCRIPTOR_KEYS)
    if (preset.parameters[key]) result[key] = preset.parameters[key];
  return result;
}
