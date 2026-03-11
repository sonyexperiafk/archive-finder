import type { SearchCategoryKey, SearchPresetKey } from './presets';
import type { ScoreBreakdown } from './scoring';

export type Vertical = 'fashion';

export type FeedSource =
  | 'avito'
  | 'mercari_jp'
  | 'kufar'
  | 'vinted'
  | 'carousell'
  | 'rakuma';
export type ListingsScope = 'all' | 'matched' | 'new';
export type TimeFilter = 'all' | 'today' | 'week';
export type SearchMode = 'quick' | 'exact_url';
export type FetchMode = 'direct' | 'assisted';
export type SourceStatus = 'active' | 'browser-mode' | 'blocked' | 'backoff' | 'paused' | 'degraded' | 'limited' | 'error';
export type Gender = 'men' | 'women' | 'unisex';
export type AgeConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type SellerTypePreference = 'any' | 'private' | 'business';
export type SellerType = 'private' | 'business' | 'unknown';
export type RuntimeCookieProvider = 'none' | 'imported' | 'spfa' | 'captured' | 'bootstrap';
export type RuntimeTransportMode = 'direct' | 'browser';

export interface SourceRuntimeDiagnostics {
  cookieProvider: RuntimeCookieProvider;
  transportMode: RuntimeTransportMode;
  lastRecoveryAction: string | null;
  proxyActive: boolean;
  blockReason: string | null;
}

export interface FeedFilter {
  feedId?: number;
  includeKeywords: string[];
  excludeKeywords: string[];
  brands: string[];
  minPriceValueOptional: number | null;
  maxPriceValueOptional: number | null;
  sellerTypePreference: SellerTypePreference;
  notes: string | null;
}

export interface Feed {
  id: number;
  source: FeedSource;
  vertical: Vertical;
  searchMode: SearchMode;
  fetchMode: FetchMode;
  categoryKey: SearchCategoryKey | null;
  presetKey: SearchPresetKey | null;
  customQuery: string | null;
  name: string;
  url: string;
  enabled: boolean;
  pollIntervalSec: number;
  effectivePollIntervalSec: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  sourceStatus: SourceStatus;
  lastBackoffReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  runtimeDiagnostics?: SourceRuntimeDiagnostics | null;
}

export interface FeedRun {
  id: number;
  feedId: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  listingsParsed: number;
  matchesFound: number;
  newMatchesFound: number;
  error: string | null;
  responseStatus: number | null;
  contentType: string | null;
  finalUrl: string | null;
  htmlLength: number | null;
  cardsFound: number;
  itemsExtracted: number;
  sampleTitles: string[];
  parseWarnings: string[];
  strategiesUsed: string[];
  suspectedReason: string | null;
  debugHtmlPath: string | null;
  debugReportPath: string | null;
  queryText?: string | null;
  itemsSkippedByAge?: number;
  itemsInserted?: number;
  itemsUnknownAge?: number;
}

export interface FeedWithFilter extends Feed {
  filter: FeedFilter;
  latestRun: FeedRun | null;
  isRunning: boolean;
}

export interface Listing {
  id: number;
  feedId: number;
  source: FeedSource;
  vertical?: Vertical;
  gender?: Gender;
  externalId: string | null;
  title: string;
  priceText: string | null;
  priceValueOptional: number | null;
  currencyTextOptional: string | null;
  priceOriginal?: number | null;
  currencyOriginal?: string | null;
  priceUsd?: number | null;
  url: string;
  canonicalUrl: string;
  locationText: string | null;
  sellerType: SellerType;
  imageUrl1: string | null;
  imageUrl2: string | null;
  matchedBrand: string | null;
  brandDetected?: string | null;
  matchedCategory: SearchCategoryKey | null;
  matchedTags: string[];
  publishedTextOptional: string | null;
  postedAt?: string | null;
  ageMinutesOptional?: number | null;
  ageConfidence?: AgeConfidence;
  unknownAge?: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  rawJson: string;
  isNew: boolean;
  isMatch: boolean;
  recommendationScore?: number | null;
  recommendationReasons?: string[];
  scoreBreakdown?: ScoreBreakdown | null;
  likedAt?: string | null;
  lastQuery?: string | null;
  feedName?: string;
}

export interface Recommendation {
  listingId: number;
  score: number;
  reasons: string[];
  scoreBreakdown?: ScoreBreakdown | null;
  createdAt: string;
  updatedAt: string;
  listing: Listing;
}

export interface Opportunity {
  listingId: number;
  score: number;
  reasons: string[];
  createdAt: string;
  listing: Listing;
}

export interface Like {
  listingId: number;
  createdAt: string;
  listing: Listing;
}

export interface ListingEvent {
  id: number;
  listingId: number;
  eventType: 'new_match' | 'updated' | 'seen_again';
  createdAt: string;
  listing?: Listing;
}

export interface ParseReport {
  feedId: number;
  source: FeedSource;
  sourceUrl: string;
  fetchedAt: string;
  responseStatus: number | null;
  contentType: string | null;
  finalUrl: string | null;
  htmlLength: number;
  pageTitle: string | null;
  selectorsAttempted: string[];
  selectorHits: Record<string, number>;
  cardsFound: number;
  itemsExtracted: number;
  itemsMatched: number;
  sampleExtractedTitles: string[];
  parseWarnings: string[];
  strategiesUsed: string[];
  suspectedReason: string | null;
  debugHtmlPath: string | null;
  debugReportPath: string | null;
  runtimeDiagnostics?: SourceRuntimeDiagnostics | null;
  queryText?: string | null;
  itemsSkippedByAge?: number;
  itemsInserted?: number;
  itemsUnknownAge?: number;
}

export interface FeedStatusPayload {
  feedId: number;
  isRunning: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  latestRun: FeedRun | null;
  feed: FeedWithFilter | null;
}

export interface NewMatchPayload {
  listing: Listing;
  feed: FeedWithFilter | null;
}

export interface ListingUpsertPayload {
  listing: Listing;
  feed: FeedWithFilter | null;
}

export interface ListingsNewPayload {
  type: 'listings:new';
  items: Listing[];
  isHistorical?: boolean;
}

export interface QueryMetric {
  source: FeedSource;
  query: string;
  totalRuns: number;
  totalFound: number;
  newItemsFound: number;
  recommendationsProduced: number;
  avgRecommendationScore: number;
  noiseRatio: number;
  queryQualityScore: number;
  lastSuccessAt: string | null;
  cooldownUntil: string | null;
  updatedAt: string;
}

export interface SourceHealth {
  source: FeedSource;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  successRateLast50: number;
  avgItemsExtracted: number;
  avgNewItemsInserted: number;
  avgRunDuration: number;
  currentBackoffLevel: number;
  currentParserMode: string | null;
  antiBotWarningsLast24h: number;
  updatedAt: string;
}

export interface SessionHealth {
  source: FeedSource;
  isValid: boolean;
  lastSuccessAt: string | null;
  last403At: string | null;
  lastCaptchaAt: string | null;
  lastItemsExtracted: number;
  consecutiveFailures: number;
  updatedAt: string;
}

export interface ProxyHealth {
  source: FeedSource;
  proxyId: string;
  lastSuccessAt: string | null;
  avgLatency: number;
  banCount: number;
  captchaCount: number;
  extractionSuccessRate: number;
  updatedAt: string;
}

export type CustomCatalogKind = 'brand' | 'tag';

export interface CustomCatalogTerm {
  id: number;
  kind: CustomCatalogKind;
  term: string;
  normalizedTerm: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CookiePoolEntry {
  id: number;
  source: FeedSource;
  label: string | null;
  cookieCount: number;
  userAgent: string | null;
  notes: string | null;
  isValid: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticsSnapshot {
  sources: SourceHealth[];
  sessions: SessionHealth[];
  proxies: ProxyHealth[];
  queries: QueryMetric[];
}
