import { getRecommendationThreshold, scoreListing, type ScoreBreakdown } from '@avito-monitor/shared';
import type { ParsedListingCandidate } from '../parser/types';
import { detectCustomBrand, matchCustomTags } from './customCatalog';
import type { MatchResult } from './matcher';

export interface RecommendationScore {
  score: number;
  reasons: string[];
  recommended: boolean;
  scoreBreakdown: ScoreBreakdown;
}

export function scoreCandidateForRecommendation(candidate: ParsedListingCandidate, match: MatchResult): RecommendationScore {
  const customBrand = detectCustomBrand(`${candidate.title} ${candidate.description ?? ''}`);
  const customTags = matchCustomTags(`${candidate.title} ${candidate.description ?? ''} ${candidate.publishedTextOptional ?? ''}`);
  const breakdown = scoreListing({
    title: candidate.title,
    description: [candidate.description, candidate.publishedTextOptional, candidate.locationText, JSON.stringify(candidate.raw ?? {})].filter(Boolean).join(' '),
    category: match.matchedCategory ?? undefined,
    price: candidate.priceValueOptional ?? undefined,
    currency: candidate.currencyTextOptional ?? undefined,
    source: candidate.source,
    vertical: candidate.vertical ?? 'fashion',
    imageUrl: candidate.imageUrl1 ?? candidate.imageUrl2 ?? undefined,
    postedAt: candidate.postedAt ?? candidate.publishedTextOptional ?? null,
    brandDetected: candidate.brandDetected ?? match.matchedBrand ?? undefined,
    ageMinutesOptional: candidate.ageMinutesOptional ?? null,
    ageConfidence: candidate.ageConfidence
  });
  const customBrandBoost = customBrand && customBrand === (candidate.brandDetected ?? match.matchedBrand ?? customBrand) ? 8 : 0;
  const customTagBoost = Math.min(8, customTags.length * 2);
  const adjustedTotal = breakdown.total + customBrandBoost + customTagBoost;
  const scoreBreakdown: ScoreBreakdown = {
    ...breakdown,
    total: adjustedTotal,
    reasons: [
      ...(customBrandBoost > 0 ? [`Tracked brand: ${customBrand}`] : []),
      ...customTags.slice(0, 3).map((tag) => `Tracked tag: ${tag}`),
      ...breakdown.reasons
    ],
    signals: [
      ...(customBrandBoost > 0 ? ['Tracked brand'] : []),
      ...(customTags.length > 0 ? ['Tracked tags'] : []),
      ...breakdown.signals
    ].slice(0, 6)
  };

  const reasons = scoreBreakdown.reasons.length > 0
    ? scoreBreakdown.reasons
      : match.matchedBrand
        ? [match.matchedBrand]
        : [];

  const strongUnknownAge = Boolean(candidate.unknownAgeOptional
    && scoreBreakdown.brandScore + customBrandBoost >= 20
    && scoreBreakdown.categoryDemandScore >= 10
    && scoreBreakdown.archiveScore + scoreBreakdown.rarityScore >= 12);

  return {
    score: adjustedTotal,
    reasons,
    recommended: candidate.unknownAgeOptional
      ? strongUnknownAge && adjustedTotal >= getRecommendationThreshold(candidate.vertical ?? 'fashion') + 10
      : adjustedTotal >= getRecommendationThreshold(candidate.vertical ?? 'fashion'),
    scoreBreakdown
  };
}
