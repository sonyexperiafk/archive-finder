import {
  CATEGORIES,
  TAG_DICTIONARY,
  detectBrand,
  getRecommendationThreshold,
  includesNormalizedTerm,
  normalizeBrandSelection,
  normalizeText,
  passesGlobalFilter,
  scoreListing,
  type FeedFilter,
  type SearchCategoryKey,
  type SellerType
} from '@avito-monitor/shared';
import type { ParsedListingCandidate } from '../parser/types';
import { detectCustomBrand, matchCustomTags } from './customCatalog';

export interface MatchResult {
  isMatch: boolean;
  matchedBrand: string | null;
  matchedCategory: SearchCategoryKey | null;
  matchedTags: string[];
}

function matchesSellerPreference(candidateSellerType: SellerType, preference: FeedFilter['sellerTypePreference']): boolean {
  return preference === 'any' ? true : candidateSellerType === preference;
}

function detectCategory(text: string): SearchCategoryKey | null {
  const normalized = normalizeText(text);
  let best: { key: SearchCategoryKey; score: number } | null = null;

  for (const category of CATEGORIES) {
    const terms = [...category.keywordsEn, ...category.keywordsJa, ...category.keywordsRu];
    const hitLength = Math.max(
      0,
      ...terms
        .filter((term) => includesNormalizedTerm(normalized, term))
        .map((term) => normalizeText(term).length)
    );
    if (hitLength <= 0) continue;
    if (!best || hitLength > best.score) {
      best = { key: category.key as SearchCategoryKey, score: hitLength };
    }
  }

  return best?.key ?? null;
}

function detectTags(text: string, source: ParsedListingCandidate['source']): string[] {
  const normalized = normalizeText(text);
  const matched = new Set<string>();

  for (const entry of TAG_DICTIONARY) {
    if (entry.group === 'negative') continue;
    const terms = [entry.tag, ...(entry.japaneseEquivalents ?? [])];
    if (terms.some((term) => includesNormalizedTerm(normalized, term))) {
      matched.add(entry.tag);
    }
  }

  if (source === 'mercari_jp') matched.add('JP');
  if (source === 'kufar') matched.add('BY');
  if (source === 'vinted') matched.add('EU');
  if (source === 'rakuma') matched.add('JP');
  for (const tag of matchCustomTags(text)) {
    matched.add(tag);
  }

  return [...matched];
}

export function matchListing(candidate: ParsedListingCandidate, filter: FeedFilter): MatchResult {
  const normalizedTitle = normalizeText(candidate.title);
  const combinedText = `${candidate.title} ${candidate.description ?? ''} ${candidate.publishedTextOptional ?? ''}`;
  const matchedCategory = detectCategory(combinedText);
  const matchedTags = detectTags(combinedText, candidate.source);
  const detectedBrand = candidate.brandDetected ?? detectBrand(combinedText) ?? detectCustomBrand(combinedText);

  if (filter.excludeKeywords.some((keyword) => includesNormalizedTerm(normalizedTitle, keyword))) {
    return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  if (filter.includeKeywords.length > 0) {
    const hasIncludedKeyword = filter.includeKeywords.some((keyword) => includesNormalizedTerm(combinedText, keyword));
    if (!hasIncludedKeyword) {
      return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
    }
  }

  if (!matchesSellerPreference(candidate.sellerType, filter.sellerTypePreference)) {
    return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  if (!passesGlobalFilter(candidate.priceUsd ?? null)) {
    return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  if (filter.minPriceValueOptional !== null && (candidate.priceValueOptional === null || candidate.priceValueOptional < filter.minPriceValueOptional)) {
    return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  if (filter.maxPriceValueOptional !== null && (candidate.priceValueOptional === null || candidate.priceValueOptional > filter.maxPriceValueOptional)) {
    return { isMatch: false, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  if (filter.brands.length === 0) {
    return { isMatch: true, matchedBrand: detectedBrand, matchedCategory, matchedTags };
  }

  const allowedBrands = new Set(normalizeBrandSelection(filter.brands));
  const score = scoreListing({
    title: candidate.title,
    description: candidate.description ?? '',
    price: candidate.priceValueOptional ?? undefined,
    currency: candidate.currencyTextOptional ?? undefined,
    imageUrl: candidate.imageUrl1 ?? undefined,
    vertical: candidate.vertical ?? 'fashion',
    postedAt: candidate.postedAt ?? candidate.publishedTextOptional ?? null,
    brandDetected: detectedBrand ?? undefined
  }).total;

  return {
    isMatch: (detectedBrand !== null && allowedBrands.has(detectedBrand)) || score >= getRecommendationThreshold(candidate.vertical ?? 'fashion'),
    matchedBrand: detectedBrand,
    matchedCategory,
    matchedTags
  };
}
