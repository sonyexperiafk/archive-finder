import type { FeedSource } from './types';
import { CATEGORIES } from './categories';

export type SearchCategoryKey =
  | 'jackets'
  | 'hoodies'
  | 'coats'
  | 'shirts'
  | 'pants'
  | 'boots'
  | 'bags'
  | 'accessories'
  | 'leather'
  | 'knitwear'
  | 'denim'
  | 'jewelry';

export type SearchPresetKey =
  | 'dark_artisan'
  | 'japanese_archive'
  | 'yohji_mode'
  | 'leather_boots'
  | 'rock_glam'
  | 'high_demand';

export interface SearchSourceOption {
  key: FeedSource;
  label: string;
  description: string;
  region: 'JP' | 'BY' | 'EU' | 'INTL' | 'RU';
  supportsAssisted: boolean;
}

export interface SearchCategoryPreset {
  key: SearchCategoryKey;
  label: string;
  labelEn: string;
  description: string;
  keywords: string[];
  quickQueryBySource: Partial<Record<FeedSource, string>>;
}

export interface SearchPresetDefinition {
  id: SearchPresetKey;
  name: string;
  description: string;
  priorityBrands: string[];
  secondaryBrands: string[];
  categories: SearchCategoryKey[];
  requiredTags: string[];
  boostTags: string[];
  scoringBias: number;
  enabledByDefault?: boolean;
}

export interface SearchPreset {
  key: SearchPresetKey;
  label: string;
  description: string;
  categories: SearchCategoryKey[];
  tags: string[];
  brandFocus: string[];
  scoreBoostTags: string[];
}

export const SEARCH_SOURCES: SearchSourceOption[] = [
  { key: 'avito', label: 'Avito RU', description: 'Российский fashion marketplace с HTML search страницами.', region: 'RU', supportsAssisted: false },
  { key: 'mercari_jp', label: 'Mercari JP', description: 'Основной японский источник.', region: 'JP', supportsAssisted: false },
  { key: 'kufar', label: 'Kufar BY', description: 'Белорусский marketplace с direct JSON API.', region: 'BY', supportsAssisted: false },
  { key: 'vinted', label: 'Vinted', description: 'Европейский resale source с cookie-backed API.', region: 'EU', supportsAssisted: false },
  { key: 'carousell', label: 'Carousell MY', description: 'Malaysia resale source that benefits from logged-in sessions.', region: 'INTL', supportsAssisted: false },
  { key: 'rakuma', label: 'Rakuten Rakuma', description: 'Японский resale source с JSON API.', region: 'JP', supportsAssisted: false }
];

export const SEARCH_CATEGORIES: SearchCategoryPreset[] = CATEGORIES.map((category) => ({
  key: category.key as SearchCategoryKey,
  label: category.labelRu,
  labelEn: category.labelEn,
  description: `${category.labelRu} / ${category.labelEn}`,
  keywords: [...category.keywordsEn, ...category.keywordsJa, ...category.keywordsRu],
  quickQueryBySource: {
    avito: category.keywordsRu[0] ?? category.keywordsEn[0],
    mercari_jp: category.keywordsJa[0],
    kufar: category.keywordsRu[0] ?? category.keywordsEn[0],
    vinted: category.keywordsEn[0],
    carousell: category.keywordsEn[0],
    rakuma: category.keywordsJa[0] ?? category.keywordsEn[0]
  }
}));

export const SEARCH_PRESET_DEFINITIONS: SearchPresetDefinition[] = [
  {
    id: 'dark_artisan',
    name: 'Dark Artisan',
    description: 'Darkwear, artisanal leather, LEB, Layer-0, Backlash, Guidi',
    priorityBrands: ['Carol Christian Poell', 'Boris Bidjan Saberi', 'Guidi', 'm.a+', 'Leon Emanuel Blanck', 'Layer-0', 'Isaac Sellam', 'A1923', 'Augusta'],
    secondaryBrands: ['Julius', 'Devoa', 'The Viridi-Anne', 'Forme d\'Expression', 'Label Under Construction', 'Incarnation', 'ISAMU KATAYAMA BACKLASH', 'STRUM', 'Individual Sentiments', 'Werkstatt München', 'D.HYGEN', 'nude:masahiko maruyama', 'Klasica', 'Attachment', 'Kazuyuki Kumagai', 'Ripvanwinkle', 'OURET', 'Bajra', 'N/07', 'N4', 'Masnada', 'Thom Krom', 'Transit Uomo', 'Lost & Found', '10sei0otto', 'Officine Creative', 'Guidi & Rosellini', 'Ziggy Chen', 'Poeme Bohemien', 'The RERACS'],
    categories: ['jackets', 'coats', 'boots', 'leather', 'bags'],
    requiredTags: [],
    boostTags: ['artisanal', 'avant-garde', 'darkwear', 'leather', 'horsehide', 'archive'],
    scoringBias: 1.3,
    enabledByDefault: true
  },
  {
    id: 'japanese_archive',
    name: 'Japanese Archive',
    description: 'Undercover, Number Nine, Yohji, CDG, beauty:beast, 20471120',
    priorityBrands: ['Undercover', 'Number (N)ine', 'Takahiromiyashita The Soloist', 'beauty:beast', '20471120', 'Yohji Yamamoto', 'Comme des Garçons Homme Plus', 'Junya Watanabe', 'Issey Miyake', 'L.G.B.', 'KMRii'],
    secondaryBrands: ['Comme des Garçons', 'Comme des Garçons Homme', 'Comme des Garçons SHIRT', 'Noir Kei Ninomiya', 'Homme Plissé Issey Miyake', 'Hysteric Glamour', 'Lad Musician', 'Roen', 'Shellac', 'Tornado Mart', 'If Six Was Nine', 'Dresscamp', 'Mastermind Japan', 'Na+H', 'AFFA', 'Bounty Hunter', 'Devilock', 'Diet Butcher Slim Skin', 'Maison Mihara Yasuhiro', 'Sacai', 'Kolor', 'Needles', 'Kapital', 'Visvim', 'N.Hoolywood', 'White Mountaineering', 'Auralee', 'Graphpaper', 'Markaware', 'Stein', 'Yoke', 'Jieda', 'UJOH', 'Yuki Hashimoto', 'Irenisa', 'TAAKK', 'Children of the Discordance', 'NICENESS', 'CULLNI', 'Unused', 'Kuon'],
    categories: ['jackets', 'hoodies', 'pants', 'boots', 'accessories'],
    requiredTags: [],
    boostTags: ['archive', 'vintage', '00s', 'y2k', 'rare', 'early', 'first season'],
    scoringBias: 1.25,
    enabledByDefault: true
  },
  {
    id: 'yohji_mode',
    name: 'Yohji / CDG / Mode',
    description: 'Yohji, Y’s, Ground Y, CDG, Junya, Issey, mode tailors',
    priorityBrands: ['Yohji Yamamoto', 'Y’s', 'Ground Y', 'S’yte', 'LIMI feu', 'Comme des Garçons Homme Plus', 'Comme des Garçons', 'Junya Watanabe', 'Noir Kei Ninomiya', 'Issey Miyake', 'Issey Miyake Men'],
    secondaryBrands: ['Comme des Garçons Homme', 'Comme des Garçons SHIRT', 'Homme Plissé Issey Miyake', 'Sulvam', 'Sacai', 'Kolor', 'Auralee', 'Graphpaper', 'Markaware', 'Stein', 'Yoke', 'UJOH', 'Studio Nicholson'],
    categories: ['coats', 'jackets', 'shirts', 'pants', 'knitwear'],
    requiredTags: [],
    boostTags: ['avant-garde', 'draped', 'oversized', 'tailored', 'deconstructed'],
    scoringBias: 1.2
  },
  {
    id: 'leather_boots',
    name: 'Leather + Boots',
    description: 'Guidi, Backlash, A1923, Augusta, CCP, artisan leather',
    priorityBrands: ['Guidi', 'ISAMU KATAYAMA BACKLASH', 'Incarnation', 'A1923', 'Augusta', 'Carol Christian Poell', 'Isaac Sellam', 'STRUM', 'm.a+', 'Officine Creative'],
    secondaryBrands: ['Ann Demeulemeester', 'Dirk Bikkembergs', 'Werkstatt München', 'Guidi & Rosellini', 'Gunda', 'Chrome Hearts', 'Boris Bidjan Saberi', 'Leon Emanuel Blanck', '10sei0otto'],
    categories: ['boots', 'leather', 'jackets', 'bags', 'accessories'],
    requiredTags: [],
    boostTags: ['leather', 'horsehide', 'calfskin', 'backzip', 'side zip', 'boots'],
    scoringBias: 1.3
  },
  {
    id: 'rock_glam',
    name: 'Rock / Glam / Host',
    description: 'L.G.B., KMRii, GalaabenD, Roen, If Six Was Nine, host kei',
    priorityBrands: ['L.G.B.', 'If Six Was Nine', 'KMRii', 'GalaabenD', 'Roen', 'Shellac', 'Tornado Mart'],
    secondaryBrands: ['No ID.', 'FAGASSENT', 'Dresscamp', 'Diet Butcher Slim Skin', 'Jun Hashimoto', 'Buffalo Bobs', 'CIVARIZE', 'Moonage Devilment', 'Black by VANQUISH', 'Vanquish', 'Royal Flash', 'Varosh', 'In The Attic', 'Vice Fairy', 'AKM', 'WJK', 'Kiryuyrik', 'Glamb'],
    categories: ['jackets', 'hoodies', 'pants', 'boots', 'accessories'],
    requiredTags: [],
    boostTags: ['rock', 'glam', 'archive', 'leather', 'y2k'],
    scoringBias: 1.2
  },
  {
    id: 'high_demand',
    name: 'High Demand Designers',
    description: 'Grailed-tier resale brands under a resale-friendly budget',
    priorityBrands: ['Rick Owens', 'Chrome Hearts', 'Guidi', 'Carol Christian Poell', 'Boris Bidjan Saberi', 'Maison Margiela', 'Undercover', 'Kapital', 'Visvim', 'Yohji Yamamoto'],
    secondaryBrands: ['Ann Demeulemeester', 'Helmut Lang', 'Raf Simons', 'Comme des Garçons Homme Plus', 'Junya Watanabe', 'Issey Miyake', 'Number (N)ine', 'Takahiromiyashita The Soloist', 'L.G.B.', 'KMRii', 'Julius', 'Devoa', 'The Viridi-Anne', 'Sulvam', 'Ethosens', 'Attachment', 'Kazuyuki Kumagai', 'Ripvanwinkle', 'DRKSHDW', 'Saint Laurent Paris', 'Hedi Slimane Dior', 'Maison Mihara Yasuhiro', 'Sacai', 'Kolor', 'Needles', 'Neighborhood', 'WTAPS', 'Human Made', 'Cav Empt', 'BAPE', 'Fragment Design', 'Damir Doma', 'Lemaire', 'Jil Sander', 'Craig Green', 'Kiko Kostadinov'],
    categories: ['jackets', 'boots', 'coats', 'accessories', 'leather', 'hoodies'],
    requiredTags: [],
    boostTags: ['archive', 'rare', 'collectible', 'grail'],
    scoringBias: 1.25
  }
];

export const SEARCH_PRESETS: SearchPreset[] = SEARCH_PRESET_DEFINITIONS.map((preset) => ({
  key: preset.id,
  label: preset.name,
  description: preset.description,
  categories: preset.categories,
  tags: [...preset.requiredTags, ...preset.boostTags],
  brandFocus: [...preset.priorityBrands, ...preset.secondaryBrands],
  scoreBoostTags: preset.boostTags
}));

const CATEGORY_MAP = new Map(SEARCH_CATEGORIES.map((category) => [category.key, category]));
const PRESET_MAP = new Map(SEARCH_PRESETS.map((preset) => [preset.key, preset]));

export function getSearchCategory(key: SearchCategoryKey): SearchCategoryPreset {
  const category = CATEGORY_MAP.get(key);
  if (!category) throw new Error(`Unknown category: ${key}`);
  return category;
}

export function getSearchPreset(key: SearchPresetKey): SearchPreset {
  const preset = PRESET_MAP.get(key);
  if (!preset) throw new Error(`Unknown preset: ${key}`);
  return preset;
}
