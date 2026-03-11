import { detectAllBrands, detectBrandEntry } from './brandAliases';
import { RESELL_MAX_PRICE_USD, RESELL_MIN_PRICE_USD, toResaleUsd } from './resale';
import { TAG_DICTIONARY } from './tagDictionary';
import type { AgeConfidence, FeedSource, Vertical } from './types';

export interface ScoreBreakdown {
  brandScore: number;
  brandTier: string;
  brandFound: string;
  categoryScore: number;
  categoryDemandScore: number;
  archiveScore: number;
  rarityScore: number;
  styleTagScore: number;
  tagQualityScore: number;
  leatherScore: number;
  bootsScore: number;
  imageQualityScore: number;
  imageConfidenceScore: number;
  priceOpportunityScore: number;
  recencyScore: number;
  ageFreshnessScore: number;
  sourceReliabilityScore: number;
  noisePenalty: number;
  unknownAgePenalty: number;
  lowValueCategoryPenalty: number;
  total: number;
  reasons: string[];
  signals: string[];
}

export const RECOMMENDATION_THRESHOLD = 48;

export const NEGATIVE_TAGS = [
  'replica',
  'fake',
  'copy',
  'counterfeit',
  'inspired',
  'custom inspired',
  'like zara',
  'zara like',
  'shein',
  'temu',
  'h&m style',
  'basic tee',
  'kids',
  'toy',
  'iphone case',
  'phone case',
  'damaged beyond repair',
  'junk'
] as const;

export const WEAK_TAGS = [
  'style',
  'in the style',
  'inspired by',
  'lookalike',
  'generic',
  'fast fashion',
  'dupe',
  'similar to',
  'budget version'
] as const;

export const SUSPICIOUS_TAGS = [
  'inspired',
  'style',
  'custom inspired',
  'look alike',
  '1:1',
  'aaa',
  'ua quality',
  'mirror quality',
  'no brand tag',
  'tag missing'
] as const;

const ARCHIVE_KEYWORDS = [
  '本人期',
  '初期',
  'アーカイブ',
  'archive',
  'vintage',
  'rare',
  'grail',
  'sample',
  'サンプル',
  '限定',
  'deadstock',
  'dead stock',
  'prototype',
  '2000s',
  'y2k',
  'runway'
] as const;

const RARE_KEYWORDS = [
  'rare',
  'grail',
  'limited',
  'exclusive',
  'sample',
  'prototype',
  'deadstock',
  'デッドストック',
  'レア',
  '希少',
  '名作',
  '本人期'
] as const;

const HIGH_QUALITY_TAGS = [
  'archive',
  'vintage',
  'deadstock',
  'sample',
  'prototype',
  'horsehide',
  'leather',
  'washed',
  'distressed',
  'draped',
  'artisanal',
  'military',
  'oversized',
  'avant-garde',
  'punk',
  'grunge',
  'アーカイブ',
  'ヴィンテージ',
  '本人期',
  '名作',
  'レザー'
] as const;

const LOW_VALUE_CATEGORY_TERMS = [
  'tee',
  't-shirt',
  'tank',
  'socks',
  'underwear',
  'keychain',
  'sticker',
  'poster'
] as const;

const SOURCE_RELIABILITY: Record<FeedSource, number> = {
  mercari_jp: 8,
  rakuma: 8,
  vinted: 7,
  kufar: 6,
  avito: 5,
  carousell: 4
};

const STRONG_CATEGORY_BIAS: Record<string, string[]> = {
  Guidi: ['boots', 'bags', 'accessories', 'leather'],
  'ISAMU KATAYAMA BACKLASH': ['outerwear', 'boots', 'belts', 'leather'],
  'Rick Owens': ['boots', 'outerwear', 'pants', 'hoodie'],
  'Yohji Yamamoto': ['coats', 'outerwear', 'pants'],
  Undercover: ['outerwear', 'hoodie', 'pants'],
  Kapital: ['denim', 'outerwear', 'knitwear'],
  'Chrome Hearts': ['jewelry', 'accessories', 'leather'],
  'Carol Christian Poell': ['boots', 'outerwear', 'leather'],
  'Boris Bidjan Saberi': ['outerwear', 'pants', 'sneakers', 'boots']
};

type NormalizedCategory =
  | 'outerwear'
  | 'coats'
  | 'hoodie'
  | 'pants'
  | 'boots'
  | 'sneakers'
  | 'bags'
  | 'belts'
  | 'denim'
  | 'shirts'
  | 'knitwear'
  | 'vest'
  | 'jewelry'
  | 'accessories'
  | 'leather'
  | 'other';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectPrimaryCategory(text: string): NormalizedCategory {
  const lowered = text.toLowerCase();
  if (/\bcoat\b|\bparka\b/.test(lowered) || /コート|パーカー/.test(text)) return 'coats';
  if (/\bbomber\b|\bjacket\b|\bouterwear\b|blouson/.test(lowered) || /ジャケット/.test(text)) return 'outerwear';
  if (/\bhoodie\b|\bsweatshirt\b/.test(lowered) || /パーカー/.test(text)) return 'hoodie';
  if (/\bboots?\b/.test(lowered) || /ブーツ/.test(text)) return 'boots';
  if (/\bsneakers?\b/.test(lowered)) return 'sneakers';
  if (/\bbag\b|\bbackpack\b|\bwallet\b/.test(lowered) || /バッグ/.test(text)) return 'bags';
  if (/\bbelt\b/.test(lowered) || /ベルト/.test(text)) return 'belts';
  if (/\bjeans?\b|\bdenim\b/.test(lowered) || /デニム/.test(text)) return 'denim';
  if (/\bpants?\b|\btrousers?\b|\bcargo\b/.test(lowered) || /パンツ/.test(text)) return 'pants';
  if (/\bshirt\b|\btee\b|\bt-shirt\b/.test(lowered) || /シャツ/.test(text)) return 'shirts';
  if (/\bsweater\b|\bknit\b|\bcardigan\b/.test(lowered) || /ニット/.test(text)) return 'knitwear';
  if (/\bvest\b/.test(lowered)) return 'vest';
  if (/\bring\b|\bnecklace\b|\bbracelet\b|\bjewelry\b/.test(lowered)) return 'jewelry';
  if (/\baccessor/.test(lowered) || /アクセサリー/.test(text)) return 'accessories';
  if (/horsehide|cordovan|calfskin|lambskin|leather|レザー|革/.test(lowered)) return 'leather';
  return 'other';
}

function calcBrandScore(tier: string, demandScore: number): number {
  const tierBase = tier === 'S' ? 34 : tier === 'A' ? 26 : tier === 'B' ? 18 : tier === 'C' ? 10 : 4;
  return tierBase + Math.round(demandScore / 12);
}

function calcCategoryDemandScore(brandFound: string, brandCategories: string[], category: NormalizedCategory): number {
  if (category === 'other') return 0;
  const preferred = new Set([
    ...brandCategories.map((entry) => entry.toLowerCase()),
    ...(STRONG_CATEGORY_BIAS[brandFound] ?? []).map((entry) => entry.toLowerCase())
  ]);

  if (preferred.has(category)) return 14;
  if ((category === 'outerwear' || category === 'coats') && (preferred.has('outerwear') || preferred.has('coats') || preferred.has('jackets'))) return 12;
  if (category === 'hoodie' && preferred.has('hoodie')) return 10;
  if ((category === 'bags' || category === 'accessories' || category === 'belts') && (preferred.has('bags') || preferred.has('accessories') || preferred.has('belts'))) return 10;
  if ((category === 'pants' || category === 'denim') && (preferred.has('pants') || preferred.has('denim'))) return 9;
  if ((category === 'knitwear' || category === 'shirts' || category === 'vest') && (preferred.has('knitwear') || preferred.has('shirts'))) return 6;
  if (category === 'jewelry' && preferred.has('jewelry')) return 12;
  return category === 'shirts' ? -4 : 2;
}

function calcArchiveScore(text: string): { score: number; signal: string | null } {
  const lowered = text.toLowerCase();
  const found = ARCHIVE_KEYWORDS.find((keyword) => lowered.includes(keyword.toLowerCase()));
  if (found) {
    return { score: 12, signal: found };
  }
  const yearMatch = lowered.match(/\b(199\d|200\d|201[0-2])\b/);
  if (yearMatch) {
    return { score: 10, signal: yearMatch[1] };
  }
  return { score: 0, signal: null };
}

function calcRarityScore(text: string, baseRarity: number): { score: number; signal: string | null } {
  const lowered = text.toLowerCase();
  const matched = RARE_KEYWORDS.find((term) => lowered.includes(term.toLowerCase()));
  const score = clamp(Math.round(baseRarity / 15) + (matched ? 6 : 0), 0, 14);
  return { score, signal: matched ?? null };
}

function calcTagQualityScore(text: string): number {
  const lowered = text.toLowerCase();
  let score = 0;
  for (const entry of TAG_DICTIONARY) {
    const terms = [entry.tag, ...(entry.japaneseEquivalents ?? [])];
    if (terms.some((term) => lowered.includes(term.toLowerCase()))) {
      score += Math.min(entry.scoreBoost, 4);
    }
  }
  for (const tag of HIGH_QUALITY_TAGS) {
    if (lowered.includes(tag.toLowerCase())) {
      score += 2;
    }
  }
  return clamp(score, 0, 16);
}

function calcImageConfidence(imageUrl: string): number {
  if (!imageUrl) return 0;
  if (/(1200|1080|1000|800|790|640|624)/.test(imageUrl)) return 6;
  if (/(430|320|300|240)/.test(imageUrl)) return 3;
  return 4;
}

function calcPriceOpportunity(priceUsd: number | null, tier: string): { score: number; signal: string | null } {
  if (priceUsd === null || priceUsd <= 0) return { score: 0, signal: null };
  if (priceUsd < RESELL_MIN_PRICE_USD) return { score: -14, signal: 'Too cheap / suspicious' };
  if (priceUsd > RESELL_MAX_PRICE_USD) return { score: -20, signal: 'Over resale window' };

  const strongDealCap = tier === 'S' ? 160 : tier === 'A' ? 140 : 120;
  const goodDealCap = tier === 'S' ? 220 : 180;
  if (priceUsd <= strongDealCap) return { score: 18, signal: 'Good price' };
  if (priceUsd <= goodDealCap) return { score: 10, signal: 'Within resale window' };
  return { score: 3, signal: 'Near budget cap' };
}

function deriveAgeMinutes(postedAt?: string | null): number | null {
  if (!postedAt) return null;
  const parsed = Date.parse(postedAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function calcAgeFreshnessScore(ageMinutes: number | null): { score: number; signal: string | null } {
  if (ageMinutes === null) return { score: 0, signal: null };
  if (ageMinutes <= 15) return { score: 14, signal: 'Fresh < 15m' };
  if (ageMinutes <= 30) return { score: 10, signal: 'Fresh < 30m' };
  if (ageMinutes <= 60) return { score: 6, signal: 'Fresh < 60m' };
  if (ageMinutes <= 180) return { score: -8, signal: 'Aged out' };
  return { score: -14, signal: 'Old listing' };
}

function calcSourceReliabilityScore(source?: FeedSource): number {
  if (!source) return 0;
  return SOURCE_RELIABILITY[source];
}

function calcNoisePenalty(text: string, primaryBrand: string | null): { penalty: number; reasons: string[] } {
  const lowered = text.toLowerCase();
  const reasons: string[] = [];
  let penalty = 0;

  for (const tag of NEGATIVE_TAGS) {
    if (lowered.includes(tag.toLowerCase())) {
      penalty -= 18;
      reasons.push(`Noise: ${tag}`);
    }
  }
  for (const tag of WEAK_TAGS) {
    if (lowered.includes(tag.toLowerCase())) {
      penalty -= 6;
    }
  }
  for (const tag of SUSPICIOUS_TAGS) {
    if (lowered.includes(tag.toLowerCase())) {
      penalty -= 8;
    }
  }

  const detectedBrands = detectAllBrands(text);
  const extraBrands = detectedBrands.filter((brand) => brand !== primaryBrand);
  if (extraBrands.length >= 2) {
    penalty -= Math.min(18, extraBrands.length * 4);
    reasons.push('Noise: multiple brands in title');
  } else if (extraBrands.length === 1 && primaryBrand) {
    penalty -= 6;
    reasons.push('Noise: mixed brand signal');
  }

  return { penalty: clamp(penalty, -36, 0), reasons };
}

function calcLowValueCategoryPenalty(text: string, category: NormalizedCategory): number {
  const lowered = text.toLowerCase();
  if (LOW_VALUE_CATEGORY_TERMS.some((term) => lowered.includes(term))) return -10;
  if (category === 'shirts') return -4;
  return 0;
}

function calcUnknownAgePenalty(ageMinutes: number | null, ageConfidence: AgeConfidence | undefined): number {
  if (ageMinutes !== null) return 0;
  if (ageConfidence === 'medium') return -8;
  if (ageConfidence === 'low') return -12;
  return -16;
}

export function getRecommendationThreshold(_vertical: Vertical = 'fashion'): number {
  return RECOMMENDATION_THRESHOLD;
}

export function passesGlobalFilter(priceUsd: number | null): boolean {
  if (priceUsd === null) return true;
  return priceUsd >= RESELL_MIN_PRICE_USD && priceUsd <= RESELL_MAX_PRICE_USD;
}

export function scoreImageQuality(imageUrl: string): number {
  return calcImageConfidence(imageUrl);
}

export function scoreListing(listing: {
  title: string;
  description?: string;
  category?: string;
  price?: number;
  currency?: string;
  priceUsd?: number | null;
  source?: FeedSource;
  vertical?: Vertical;
  imageUrl?: string;
  postedAt?: string | null;
  brandDetected?: string | null;
  ageMinutesOptional?: number | null;
  ageConfidence?: AgeConfidence;
}): ScoreBreakdown {
  const fullText = `${listing.title} ${listing.description ?? ''} ${listing.category ?? ''}`.trim();
  const lowered = fullText.toLowerCase();
  const normalizedPriceUsd = listing.priceUsd ?? (
    typeof listing.price === 'number'
      ? toResaleUsd(listing.price, listing.currency ?? 'USD')
      : null
  );

  const brandEntry = detectBrandEntry(listing.brandDetected ?? fullText);
  const category = detectPrimaryCategory(fullText);
  const ageMinutes = listing.ageMinutesOptional ?? deriveAgeMinutes(listing.postedAt);
  const { penalty: noisePenalty, reasons: noiseReasons } = calcNoisePenalty(fullText, brandEntry?.canonical ?? null);
  const lowValueCategoryPenalty = calcLowValueCategoryPenalty(fullText, category);
  const unknownAgePenalty = calcUnknownAgePenalty(ageMinutes, listing.ageConfidence);
  const { score: archiveScore, signal: archiveSignal } = calcArchiveScore(fullText);
  const { score: rarityScore, signal: raritySignal } = calcRarityScore(fullText, brandEntry?.rarityScore ?? 0);
  const tagQualityScore = calcTagQualityScore(fullText);
  const imageConfidenceScore = calcImageConfidence(listing.imageUrl ?? '');
  const sourceReliabilityScore = calcSourceReliabilityScore(listing.source);
  const { score: priceOpportunityScore, signal: priceSignal } = calcPriceOpportunity(normalizedPriceUsd, brandEntry?.tier ?? 'D');
  const { score: ageFreshnessScore, signal: ageSignal } = calcAgeFreshnessScore(ageMinutes);
  const leatherScore = /horsehide|cordovan|calfskin|lambskin|leather|レザー|革/.test(lowered) ? 6 : 0;
  const bootsScore = /\bboots?\b|ブーツ/.test(lowered) ? 5 : 0;
  const brandScore = brandEntry ? calcBrandScore(brandEntry.tier, brandEntry.demandScore) : 0;
  const categoryDemandScore = brandEntry
    ? calcCategoryDemandScore(brandEntry.canonical, brandEntry.highValueCategories, category)
    : (category === 'boots' || category === 'outerwear' || category === 'coats' ? 4 : 0);

  const total = Math.max(
    0,
    brandScore
      + categoryDemandScore
      + archiveScore
      + rarityScore
      + tagQualityScore
      + priceOpportunityScore
      + sourceReliabilityScore
      + ageFreshnessScore
      + imageConfidenceScore
      + leatherScore
      + bootsScore
      + noisePenalty
      + unknownAgePenalty
      + lowValueCategoryPenalty
  );

  const reasons = [
    brandEntry ? `${brandEntry.canonical} (Tier ${brandEntry.tier})` : null,
    categoryDemandScore >= 10 ? 'High demand category' : null,
    archiveSignal ? `Archive tag: ${archiveSignal}` : null,
    raritySignal ? `Rare signal: ${raritySignal}` : null,
    leatherScore > 0 ? 'Leather item' : null,
    bootsScore > 0 ? 'Boots / footwear bias' : null,
    priceSignal,
    ageSignal,
    noisePenalty <= -18 ? 'Noise penalty applied' : null,
    unknownAgePenalty < 0 ? 'Unknown age penalty' : null
  ].filter((reason): reason is string => Boolean(reason));

  const signals = [
    brandEntry?.tier === 'S' ? 'Strong brand' : null,
    brandEntry?.tier === 'A' ? 'High demand brand' : null,
    archiveScore >= 10 ? 'Archive tag' : null,
    rarityScore >= 10 ? 'Rare category' : null,
    leatherScore > 0 ? 'Leather item' : null,
    bootsScore > 0 ? 'Boots / Leather bias' : null,
    priceOpportunityScore >= 12 ? 'Good price' : null,
    ageSignal,
    sourceReliabilityScore >= 7 ? 'Reliable source' : null
  ].filter((signal): signal is string => Boolean(signal)).slice(0, 5);

  return {
    brandScore,
    brandTier: brandEntry?.tier ?? 'unknown',
    brandFound: brandEntry?.canonical ?? '',
    categoryScore: categoryDemandScore,
    categoryDemandScore,
    archiveScore,
    rarityScore,
    styleTagScore: tagQualityScore,
    tagQualityScore,
    leatherScore,
    bootsScore,
    imageQualityScore: imageConfidenceScore,
    imageConfidenceScore,
    priceOpportunityScore,
    recencyScore: ageFreshnessScore,
    ageFreshnessScore,
    sourceReliabilityScore,
    noisePenalty,
    unknownAgePenalty,
    lowValueCategoryPenalty,
    total,
    reasons: [...noiseReasons, ...reasons],
    signals
  };
}
