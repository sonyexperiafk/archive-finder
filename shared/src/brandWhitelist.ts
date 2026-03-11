import { detectBrand } from './brandAliases';
import { BRAND_CATALOG } from './brands';

const ARCHIVE_FALLBACK_TERMS = [
  '本人期',
  '初期',
  'アーカイブ',
  'archive',
  'avant garde',
  'artisanal',
  'darkwear',
  'designer leather',
  'ホースレザー',
  'コードバン'
] as const;

export const BRAND_WHITELIST: string[] = [
  ...new Set([
    ...BRAND_CATALOG.flatMap((brand) => [brand.canonical, ...brand.aliases]),
    ...ARCHIVE_FALLBACK_TERMS
  ])
];

// BLACKLIST: if any of these found in title/desc → REJECT immediately
export const BRAND_BLACKLIST: string[] = [
  'zara', 'h&m', 'hm', 'shein', 'primark', 'asos', 'boohoo', 'forever 21',
  'forever21', 'topshop', 'uniqlo', 'gap', 'old navy', 'target', 'walmart',
  'ユニクロ', 'しまむら',
  'kids', 'キッズ', 'child', 'children', 'baby', 'ベビー', 'toddler',
  'boys size', 'girls size', 'youth size', '子供', 'ジュニア',
  'replica', 'fake', 'inspired by', 'style like', 'lookalike', 'rep',
  'スーパーコピー', 'コピー品', 'レプリカ',
  'furniture', 'chair', 'table', 'lamp', 'shelf',
  'apartment', 'room for rent', '賃貸', '部屋',
  'квартира', 'комната', 'аренда', 'недвижимость',
  'smartphone', 'iphone', 'android', 'laptop', 'computer',
  'car', 'автомобиль', 'машина'
];

export function passesWhitelist(title: string, description = '', brand = ''): boolean {
  const text = `${title} ${description} ${brand}`.trim();
  if (!text) return false;
  if (detectBrand(text)) return true;

  const lower = text.toLowerCase();
  return ARCHIVE_FALLBACK_TERMS.some((term) => lower.includes(term.toLowerCase()));
}

export function passesBlacklist(title: string, description = '', brand = ''): boolean {
  const text = `${title} ${description} ${brand}`.toLowerCase();
  return !BRAND_BLACKLIST.some((term) => text.includes(term.toLowerCase()));
}

export function passesFilters(title: string, description = '', brand = ''): boolean {
  return passesBlacklist(title, description, brand) && passesWhitelist(title, description, brand);
}
