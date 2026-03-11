import { BRAND_CATALOG } from './brands';
import type { FeedSource } from './types';

export const RESELL_MIN_PRICE_USD = 30;
export const RESELL_MAX_PRICE_USD = 300;
export const RESELL_SOFT_CAP_USD = 220;

export const RESELL_CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 1 / 150,
  RUB: 1 / 90,
  BYN: 1 / 3.1,
  MYR: 0.22,
  SGD: 0.74,
  KRW: 1 / 1330,
  CNY: 1 / 7.2,
  HKD: 1 / 7.8,
  AUD: 0.65,
  CAD: 0.74,
  PLN: 0.25,
  DKK: 0.145,
  SEK: 0.096
};

export function toResaleUsd(amount: number, currency = 'USD'): number {
  const rate = RESELL_CURRENCY_RATES[currency.toUpperCase()];
  if (!rate) return amount;
  return Math.round(amount * rate * 100) / 100;
}

export const GRAILED_TIER_S = [
  'Rick Owens',
  'Chrome Hearts',
  'Guidi',
  'Carol Christian Poell',
  'Boris Bidjan Saberi',
  'Maison Margiela',
  'Undercover',
  'Kapital',
  'Visvim',
  'Yohji Yamamoto'
] as const;

export const GRAILED_TIER_A = [
  'Ann Demeulemeester',
  'Helmut Lang',
  'Raf Simons',
  'Comme des Garçons Homme Plus',
  'Junya Watanabe',
  'Issey Miyake',
  'Number (N)ine',
  'Takahiromiyashita The Soloist',
  'L.G.B.',
  'KMRii'
] as const;

export const GRAILED_TIER_B = [
  'Julius',
  'Devoa',
  'The Viridi-Anne',
  'Sulvam',
  'Ethosens',
  'Attachment',
  'Kazuyuki Kumagai',
  'Ripvanwinkle'
] as const;

const ENGLISH_RESELL_HINTS = [
  'archive jacket',
  'archive coat',
  'designer leather jacket',
  'avant garde coat',
  'darkwear jacket',
  'artisanal leather',
  'rare japanese designer',
  'vintage designer jacket'
] as const;

const JAPANESE_RESELL_HINTS = [
  '本人期',
  '初期',
  'アーカイブ ジャケット',
  'レザー ジャケット',
  'ホースレザー',
  'デザイナーズ コート',
  'ヨウジヤマモト',
  'アンダーカバー'
] as const;

const RUSSIAN_RESELL_HINTS = [
  'архивная одежда',
  'дизайнерская куртка',
  'кожаная куртка дизайнер',
  'винтаж дизайнер куртка',
  'авангард куртка',
  'японский дизайнер',
  'пальто дизайнер'
] as const;

function tierRank(tier: string): number {
  if (tier === 'S') return 5;
  if (tier === 'A') return 4;
  if (tier === 'B') return 3;
  if (tier === 'C') return 2;
  return 1;
}

const grailedPriority = new Map<string, number>([
  ...GRAILED_TIER_S.map((brand, index) => [brand, 300 - index] as const),
  ...GRAILED_TIER_A.map((brand, index) => [brand, 200 - index] as const),
  ...GRAILED_TIER_B.map((brand, index) => [brand, 100 - index] as const)
]);

function queryLabelForSource(canonical: string, source: FeedSource): string {
  const entry = BRAND_CATALOG.find((brand) => brand.canonical === canonical);
  if (!entry) return canonical;

  if (source === 'mercari_jp' || source === 'rakuma') {
    const localized = entry.aliases.find((alias) => /[\u3040-\u30ff\u3400-\u9fff]/.test(alias));
    return localized ?? canonical;
  }

  return canonical;
}

export const RESELL_BRAND_POOL = BRAND_CATALOG
  .filter((brand) => brand.resaleScore >= 58 || tierRank(brand.tier) >= 3 || grailedPriority.has(brand.canonical))
  .sort((left, right) => {
    const grailedDelta = (grailedPriority.get(right.canonical) ?? 0) - (grailedPriority.get(left.canonical) ?? 0);
    if (grailedDelta !== 0) return grailedDelta;
    const resaleDelta = right.resaleScore - left.resaleScore;
    if (resaleDelta !== 0) return resaleDelta;
    const demandDelta = right.demandScore - left.demandScore;
    if (demandDelta !== 0) return demandDelta;
    const tierDelta = tierRank(right.tier) - tierRank(left.tier);
    if (tierDelta !== 0) return tierDelta;
    return left.canonical.localeCompare(right.canonical);
  })
  .map((brand) => brand.canonical);

export function buildSourceResaleQueryPool(source: FeedSource, focusedBrands: string[] = RESELL_BRAND_POOL): string[] {
  const hints = source === 'mercari_jp' || source === 'rakuma'
    ? JAPANESE_RESELL_HINTS
    : source === 'avito' || source === 'kufar'
      ? RUSSIAN_RESELL_HINTS
      : ENGLISH_RESELL_HINTS;

  const output: string[] = [];
  const seen = new Set<string>();

  for (const brand of focusedBrands) {
    const query = queryLabelForSource(brand, source).trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    output.push(query);
  }

  for (const hint of hints) {
    if (seen.has(hint)) continue;
    seen.add(hint);
    output.push(hint);
  }

  return output;
}
