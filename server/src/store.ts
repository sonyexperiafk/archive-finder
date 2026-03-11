import { DatabaseSync } from 'node:sqlite';
import type {
  Feed,
  FeedFilter,
  FeedRun,
  FeedSource,
  FeedWithFilter,
  FetchMode,
  Gender,
  Like,
  Listing,
  ListingEvent,
  ListingsScope,
  Opportunity,
  ProxyHealth,
  QueryMetric,
  Recommendation,
  ScoreBreakdown,
  SessionHealth,
  SourceHealth,
  SourceStatus,
  SearchCategoryKey,
  SearchPresetKey,
  SearchMode,
  SellerTypePreference,
  TimeFilter,
  Vertical
} from '@avito-monitor/shared';
import {
  getSearchPreset,
  RESELL_MAX_PRICE_USD,
  RESELL_MIN_PRICE_USD,
  normalizeBrandSelection,
  passesFilters,
  passesGlobalFilter,
  RECOMMENDATION_THRESHOLD,
  scoreListing
} from '@avito-monitor/shared';
import type { MatchResult } from './services/matcher';
import type { ParsedListingCandidate } from './parser/types';
import { extractVintedImage, extractVintedMoney, formatVintedPriceText, normalizeVintedItemUrl } from './parser/vinted';
import { toUsd } from './lib/antiBan';
import { detectGender, isChildrenItem } from './services/genderDetector';
import { scoreCandidateForRecommendation } from './services/recommendations';

interface FeedRow {
  id: number;
  source: FeedSource;
  vertical: Vertical;
  search_mode: SearchMode;
  fetch_mode: FetchMode;
  category_key: SearchCategoryKey | null;
  preset_key: SearchPresetKey | null;
  custom_query: string | null;
  name: string;
  url: string;
  enabled: number;
  poll_interval_sec: number;
  effective_poll_interval_sec: number;
  consecutive_failures: number;
  consecutive_successes: number;
  source_status: SourceStatus;
  last_backoff_reason: string | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  last_checked_at: string | null;
  include_keywords: string | null;
  exclude_keywords: string | null;
  brands: string | null;
  min_price_value: number | null;
  max_price_value: number | null;
  seller_type_preference: SellerTypePreference | null;
  notes: string | null;
  run_id: number | null;
  run_started_at: string | null;
  run_finished_at: string | null;
  run_duration_ms: number | null;
  run_listings_parsed: number | null;
  run_matches_found: number | null;
  run_new_matches_found: number | null;
  run_error: string | null;
  run_response_status: number | null;
  run_content_type: string | null;
  run_final_url: string | null;
  run_html_length: number | null;
  run_cards_found: number | null;
  run_items_extracted: number | null;
  run_sample_titles_json: string | null;
  run_parse_warnings_json: string | null;
  run_strategies_used_json: string | null;
  run_suspected_reason: string | null;
  run_debug_html_path: string | null;
  run_debug_report_path: string | null;
  run_query_text: string | null;
  run_items_skipped_old: number | null;
  run_items_inserted: number | null;
  run_items_unknown_age: number | null;
}

interface ListingRow {
  id: number;
  feed_id: number;
  source: FeedSource;
  vertical: Vertical | null;
  gender: Gender | null;
  external_id: string | null;
  title: string;
  price_text: string | null;
  price_value: number | null;
  currency_text: string | null;
  price_original: number | null;
  currency_original: string | null;
  price_usd: number | null;
  url: string;
  canonical_url: string;
  location_text: string | null;
  seller_type: Listing['sellerType'];
  image_url_1: string | null;
  image_url_2: string | null;
  matched_brand: string | null;
  matched_category: SearchCategoryKey | null;
  matched_tags_json: string | null;
  published_text: string | null;
  posted_at: string | null;
  age_minutes: number | null;
  age_confidence: Listing['ageConfidence'] | null;
  unknown_age: number;
  last_query: string | null;
  first_seen_at: string;
  last_seen_at: string;
  raw_json: string;
  is_new: number;
  is_match: number;
  recommendation_score?: number | null;
  recommendation_reasons_json?: string | null;
  recommendation_score_breakdown_json?: string | null;
  liked_at?: string | null;
  feed_name?: string;
}

interface RecommendationRow {
  listing_id: number;
  score: number;
  reasons_json: string | null;
  score_breakdown_json: string | null;
  created_at: string;
  updated_at: string;
}

interface LikeRow {
  listing_id: number;
  created_at: string;
}

interface EventRow {
  id: number;
  listing_id: number;
  event_type: ListingEvent['eventType'];
  created_at: string;
}

interface ListingMetadataRow {
  id: number;
  title: string;
  raw_json: string;
  matched_category: SearchCategoryKey | null;
  published_text: string | null;
}

interface VintedBackfillRow {
  id: number;
  raw_json: string;
}

interface FeedRunRow {
  id: number;
  feed_id: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  listings_parsed: number;
  matches_found: number;
  new_matches_found: number;
  error: string | null;
  response_status: number | null;
  content_type: string | null;
  final_url: string | null;
  html_length: number | null;
  cards_found: number | null;
  items_extracted: number | null;
  sample_titles_json: string | null;
  parse_warnings_json: string | null;
  strategies_used_json: string | null;
  suspected_reason: string | null;
  debug_html_path: string | null;
  debug_report_path: string | null;
  query_text: string | null;
  items_skipped_old: number | null;
  items_inserted: number | null;
  items_unknown_age: number | null;
}

interface OpportunityRow {
  listing_id: number;
  score: number;
  reasons_json: string | null;
  created_at: string;
}

interface QueryMetricRow {
  source: FeedSource;
  query: string;
  total_runs: number;
  total_found: number;
  new_items_found: number;
  recommendations_produced: number;
  avg_recommendation_score: number;
  noise_ratio: number;
  query_quality_score: number;
  last_success_at: string | null;
  cooldown_until: string | null;
  updated_at: string;
}

interface SourceHealthRow {
  source: FeedSource;
  last_success_at: string | null;
  last_failure_at: string | null;
  success_rate_last50: number;
  avg_items_extracted: number;
  avg_new_items_inserted: number;
  avg_run_duration: number;
  current_backoff_level: number;
  current_parser_mode: string | null;
  anti_bot_warnings_last24h: number;
  updated_at: string;
}

interface SessionHealthRow {
  source: FeedSource;
  is_valid: number;
  last_success_at: string | null;
  last_403_at: string | null;
  last_captcha_at: string | null;
  last_items_extracted: number;
  consecutive_failures: number;
  updated_at: string;
}

interface ProxyHealthRow {
  source: FeedSource;
  proxy_id: string;
  last_success_at: string | null;
  avg_latency: number;
  ban_count: number;
  captcha_count: number;
  extraction_success_rate: number;
  updated_at: string;
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function serializeJsonArray(value: string[]): string {
  return JSON.stringify(value.map((entry) => entry.trim()).filter(Boolean));
}

function parseJsonObject<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function defaultFilter(feedId?: number): FeedFilter {
  return {
    feedId,
    includeKeywords: [],
    excludeKeywords: [],
    brands: [],
    minPriceValueOptional: null,
    maxPriceValueOptional: null,
    sellerTypePreference: 'any',
    notes: null
  };
}

function normalizeVertical(value: string | null | undefined): Vertical {
  return 'fashion';
}

function normalizeGender(value: string | null | undefined): Gender {
  if (value === 'men' || value === 'women') return value;
  return 'unisex';
}

function mapRunRow(row: FeedRunRow): FeedRun {
  return {
    id: row.id,
    feedId: row.feed_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    listingsParsed: row.listings_parsed ?? 0,
    matchesFound: row.matches_found ?? 0,
    newMatchesFound: row.new_matches_found ?? 0,
    error: row.error,
    responseStatus: row.response_status,
    contentType: row.content_type,
    finalUrl: row.final_url,
    htmlLength: row.html_length,
    cardsFound: row.cards_found ?? 0,
    itemsExtracted: row.items_extracted ?? 0,
    sampleTitles: parseJsonArray(row.sample_titles_json),
    parseWarnings: parseJsonArray(row.parse_warnings_json),
    strategiesUsed: parseJsonArray(row.strategies_used_json),
    suspectedReason: row.suspected_reason,
    debugHtmlPath: row.debug_html_path,
    debugReportPath: row.debug_report_path,
    queryText: row.query_text,
    itemsSkippedByAge: row.items_skipped_old ?? 0,
    itemsInserted: row.items_inserted ?? 0,
    itemsUnknownAge: row.items_unknown_age ?? 0
  };
}

function mapRun(row: FeedRow): FeedRun | null {
  if (!row.run_id || !row.run_started_at) {
    return null;
  }

  return {
    id: row.run_id,
    feedId: row.id,
    startedAt: row.run_started_at,
    finishedAt: row.run_finished_at,
    durationMs: row.run_duration_ms,
    listingsParsed: row.run_listings_parsed ?? 0,
    matchesFound: row.run_matches_found ?? 0,
    newMatchesFound: row.run_new_matches_found ?? 0,
    error: row.run_error,
    responseStatus: row.run_response_status,
    contentType: row.run_content_type,
    finalUrl: row.run_final_url,
    htmlLength: row.run_html_length,
    cardsFound: row.run_cards_found ?? 0,
    itemsExtracted: row.run_items_extracted ?? 0,
    sampleTitles: parseJsonArray(row.run_sample_titles_json),
    parseWarnings: parseJsonArray(row.run_parse_warnings_json),
    strategiesUsed: parseJsonArray(row.run_strategies_used_json),
    suspectedReason: row.run_suspected_reason,
    debugHtmlPath: row.run_debug_html_path,
    debugReportPath: row.run_debug_report_path,
    queryText: row.run_query_text,
    itemsSkippedByAge: row.run_items_skipped_old ?? 0,
    itemsInserted: row.run_items_inserted ?? 0,
    itemsUnknownAge: row.run_items_unknown_age ?? 0
  };
}

function mapFeed(row: FeedRow): Feed {
  const status = row.source_status ?? (row.enabled ? 'active' : 'paused');
  return {
    id: row.id,
    source: row.source,
    vertical: normalizeVertical(row.vertical),
    searchMode: row.search_mode,
    fetchMode: row.fetch_mode,
    categoryKey: row.category_key,
    presetKey: row.preset_key,
    customQuery: row.custom_query,
    name: row.name,
    url: row.url,
    enabled: Boolean(row.enabled),
    pollIntervalSec: row.poll_interval_sec,
    effectivePollIntervalSec: row.effective_poll_interval_sec ?? row.poll_interval_sec,
    consecutiveFailures: row.consecutive_failures ?? 0,
    consecutiveSuccesses: row.consecutive_successes ?? 0,
    sourceStatus: status,
    lastBackoffReason: row.last_backoff_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at
  };
}

function mapFeedWithFilter(row: FeedRow, runningFeedIds: Set<number>): FeedWithFilter {
  const presetBrands = row.preset_key ? getSearchPreset(row.preset_key).brandFocus : [];
  const storedBrands = parseJsonArray(row.brands);
  const brands = presetBrands.length > 0
    ? normalizeBrandSelection([...presetBrands, ...storedBrands])
    : storedBrands;

  return {
    ...mapFeed(row),
    filter: {
      feedId: row.id,
      includeKeywords: parseJsonArray(row.include_keywords),
      excludeKeywords: parseJsonArray(row.exclude_keywords),
      brands,
      minPriceValueOptional: row.min_price_value,
      maxPriceValueOptional: row.max_price_value,
      sellerTypePreference: row.seller_type_preference ?? 'any',
      notes: row.notes
    },
    latestRun: mapRun(row),
    isRunning: runningFeedIds.has(row.id)
  };
}

function mapListing(row: ListingRow): Listing {
  const fallbackScoreBreakdown = row.recommendation_score !== null && row.recommendation_score !== undefined
    ? scoreListing({
        title: row.title,
        description: row.raw_json,
        category: row.matched_category ?? undefined,
        price: row.price_original ?? row.price_value ?? row.price_usd ?? undefined,
        currency: row.price_original !== null && row.price_original !== undefined
          ? (row.currency_original ?? row.currency_text ?? undefined)
          : 'USD',
        source: row.source,
        vertical: normalizeVertical(row.vertical),
        imageUrl: row.image_url_1 ?? row.image_url_2 ?? undefined,
        postedAt: row.posted_at,
        brandDetected: row.matched_brand ?? undefined,
        ageMinutesOptional: row.age_minutes,
        ageConfidence: row.age_confidence ?? 'unknown'
      })
    : null;
  const scoreBreakdown = parseJsonObject<ScoreBreakdown>(row.recommendation_score_breakdown_json) ?? fallbackScoreBreakdown;
  const recommendationReasons = parseJsonArray(row.recommendation_reasons_json);

  return {
    id: row.id,
    feedId: row.feed_id,
    source: row.source,
    vertical: normalizeVertical(row.vertical),
    gender: normalizeGender(row.gender),
    externalId: row.external_id,
    title: row.title,
    priceText: row.price_text,
    priceValueOptional: row.price_value,
    currencyTextOptional: row.currency_text,
    priceOriginal: row.price_original,
    currencyOriginal: row.currency_original,
    priceUsd: row.price_usd,
    url: row.url,
    canonicalUrl: row.canonical_url,
    locationText: row.location_text,
    sellerType: row.seller_type,
    imageUrl1: row.image_url_1,
    imageUrl2: row.image_url_2,
    matchedBrand: row.matched_brand,
    brandDetected: row.matched_brand,
    matchedCategory: row.matched_category,
    matchedTags: parseJsonArray(row.matched_tags_json),
    publishedTextOptional: row.published_text,
    postedAt: row.posted_at ?? row.published_text,
    ageMinutesOptional: row.age_minutes,
    ageConfidence: row.age_confidence ?? 'unknown',
    unknownAge: Boolean(row.unknown_age),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    rawJson: row.raw_json,
    isNew: Boolean(row.is_new),
    isMatch: Boolean(row.is_match),
    recommendationScore: row.recommendation_score ?? null,
    recommendationReasons: recommendationReasons.length > 0 ? recommendationReasons : (scoreBreakdown?.reasons ?? []),
    scoreBreakdown,
    likedAt: row.liked_at ?? null,
    lastQuery: row.last_query,
    feedName: row.feed_name
  };
}

function mapQueryMetric(row: QueryMetricRow): QueryMetric {
  return {
    source: row.source,
    query: row.query,
    totalRuns: row.total_runs,
    totalFound: row.total_found,
    newItemsFound: row.new_items_found,
    recommendationsProduced: row.recommendations_produced,
    avgRecommendationScore: row.avg_recommendation_score,
    noiseRatio: row.noise_ratio,
    queryQualityScore: row.query_quality_score,
    lastSuccessAt: row.last_success_at,
    cooldownUntil: row.cooldown_until,
    updatedAt: row.updated_at
  };
}

function mapSourceHealth(row: SourceHealthRow): SourceHealth {
  return {
    source: row.source,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    successRateLast50: row.success_rate_last50,
    avgItemsExtracted: row.avg_items_extracted,
    avgNewItemsInserted: row.avg_new_items_inserted,
    avgRunDuration: row.avg_run_duration,
    currentBackoffLevel: row.current_backoff_level,
    currentParserMode: row.current_parser_mode,
    antiBotWarningsLast24h: row.anti_bot_warnings_last24h,
    updatedAt: row.updated_at
  };
}

function mapSessionHealth(row: SessionHealthRow): SessionHealth {
  return {
    source: row.source,
    isValid: Boolean(row.is_valid),
    lastSuccessAt: row.last_success_at,
    last403At: row.last_403_at,
    lastCaptchaAt: row.last_captcha_at,
    lastItemsExtracted: row.last_items_extracted,
    consecutiveFailures: row.consecutive_failures,
    updatedAt: row.updated_at
  };
}

function mapProxyHealth(row: ProxyHealthRow): ProxyHealth {
  return {
    source: row.source,
    proxyId: row.proxy_id,
    lastSuccessAt: row.last_success_at,
    avgLatency: row.avg_latency,
    banCount: row.ban_count,
    captchaCount: row.captcha_count,
    extractionSuccessRate: row.extraction_success_rate,
    updatedAt: row.updated_at
  };
}

export interface FeedInput {
  source?: FeedSource;
  vertical?: Vertical;
  searchMode?: SearchMode;
  fetchMode?: FetchMode;
  categoryKey?: SearchCategoryKey | null;
  presetKey?: SearchPresetKey | null;
  customQuery?: string | null;
  name: string;
  url: string;
  enabled?: boolean;
  pollIntervalSec?: number;
  filter?: Partial<FeedFilter>;
}

export interface ListListingsOptions {
  feedId?: number;
  source?: FeedSource;
  vertical?: Vertical;
  gender?: Gender;
  scope?: ListingsScope;
  timeFilter?: TimeFilter;
  minPriceUsd?: number;
  maxPriceUsd?: number;
  withPhotoOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface UpsertListingResult {
  listing: Listing | null;
  eventType: ListingEvent['eventType'] | null;
  isNewListing: boolean;
}

export interface FinishFeedRunPayload {
  finishedAt: string;
  durationMs: number;
  listingsParsed: number;
  matchesFound: number;
  newMatchesFound: number;
  error: string | null;
  responseStatus: number | null;
  contentType: string | null;
  finalUrl: string | null;
  htmlLength: number;
  cardsFound: number;
  itemsExtracted: number;
  sampleTitles: string[];
  parseWarnings: string[];
  strategiesUsed: string[];
  suspectedReason: string | null;
  debugHtmlPath: string | null;
  debugReportPath: string | null;
  queryText: string | null;
  itemsSkippedByAge: number;
  itemsInserted: number;
  itemsUnknownAge: number;
}

export interface FeedRuntimeStateInput {
  effectivePollIntervalSec: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  sourceStatus: SourceStatus;
  lastBackoffReason: string | null;
}

function cleanupAgeDays(source: FeedSource): number {
  if (source === 'carousell') return 2;
  return 1;
}

export function createStore(db: DatabaseSync) {
  const baseFeedQuery = `
    SELECT
      f.id,
      f.source,
      f.vertical,
      f.search_mode,
      f.fetch_mode,
      f.category_key,
      f.preset_key,
      f.custom_query,
      f.name,
      f.url,
      f.enabled,
      f.poll_interval_sec,
      f.effective_poll_interval_sec,
      f.consecutive_failures,
      f.consecutive_successes,
      f.source_status,
      f.last_backoff_reason,
      f.created_at,
      f.updated_at,
      f.last_error,
      f.last_checked_at,
      ff.include_keywords,
      ff.exclude_keywords,
      ff.brands,
      ff.min_price_value,
      ff.max_price_value,
      ff.seller_type_preference,
      ff.notes,
      fr.id AS run_id,
      fr.started_at AS run_started_at,
      fr.finished_at AS run_finished_at,
      fr.duration_ms AS run_duration_ms,
      fr.listings_parsed AS run_listings_parsed,
      fr.matches_found AS run_matches_found,
      fr.new_matches_found AS run_new_matches_found,
      fr.error AS run_error,
      fr.response_status AS run_response_status,
      fr.content_type AS run_content_type,
      fr.final_url AS run_final_url,
      fr.html_length AS run_html_length,
      fr.cards_found AS run_cards_found,
      fr.items_extracted AS run_items_extracted,
      fr.sample_titles_json AS run_sample_titles_json,
      fr.parse_warnings_json AS run_parse_warnings_json,
      fr.strategies_used_json AS run_strategies_used_json,
      fr.suspected_reason AS run_suspected_reason,
      fr.debug_html_path AS run_debug_html_path,
      fr.debug_report_path AS run_debug_report_path,
      fr.query_text AS run_query_text,
      fr.items_skipped_old AS run_items_skipped_old,
      fr.items_inserted AS run_items_inserted,
      fr.items_unknown_age AS run_items_unknown_age
    FROM feeds f
    LEFT JOIN feed_filters ff ON ff.feed_id = f.id
    LEFT JOIN feed_runs fr ON fr.id = (
      SELECT fr2.id
      FROM feed_runs fr2
      WHERE fr2.feed_id = f.id
      ORDER BY fr2.started_at DESC
      LIMIT 1
    )
  `;

  const listFeedsStmt = db.prepare(`${baseFeedQuery} ORDER BY COALESCE(f.last_checked_at, f.created_at) DESC, f.created_at DESC`);
  const getFeedStmt = db.prepare(`${baseFeedQuery} WHERE f.id = ? LIMIT 1`);
  const insertFeedStmt = db.prepare(`
    INSERT INTO feeds (
      source,
      vertical,
      search_mode,
      fetch_mode,
      category_key,
      preset_key,
      custom_query,
      name,
      url,
      enabled,
      poll_interval_sec,
      effective_poll_interval_sec,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertFilterStmt = db.prepare(`
    INSERT INTO feed_filters (
      feed_id,
      include_keywords,
      exclude_keywords,
      brands,
      min_price_value,
      max_price_value,
      seller_type_preference,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(feed_id) DO UPDATE SET
      include_keywords = excluded.include_keywords,
      exclude_keywords = excluded.exclude_keywords,
      brands = excluded.brands,
      min_price_value = excluded.min_price_value,
      max_price_value = excluded.max_price_value,
      seller_type_preference = excluded.seller_type_preference,
      notes = excluded.notes
  `);
  const updateFeedStmt = db.prepare(`
    UPDATE feeds
    SET source = ?,
        vertical = ?,
        search_mode = ?,
        fetch_mode = ?,
        category_key = ?,
        preset_key = ?,
        custom_query = ?,
        name = ?,
        url = ?,
        enabled = ?,
        poll_interval_sec = ?,
        effective_poll_interval_sec = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const updateFeedFetchModeStmt = db.prepare(`
    UPDATE feeds
    SET fetch_mode = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateFeedRuntimeStmt = db.prepare(`
    UPDATE feeds
    SET effective_poll_interval_sec = ?,
        consecutive_failures = ?,
        consecutive_successes = ?,
        source_status = ?,
        last_backoff_reason = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const deleteFeedStmt = db.prepare(`DELETE FROM feeds WHERE id = ?`);
  const deleteListingStmt = db.prepare(`DELETE FROM listings WHERE id = ?`);
  const listEventsStmt = db.prepare(`
    SELECT e.id, e.listing_id, e.event_type, e.created_at
    FROM listing_events e
    ORDER BY e.created_at DESC
    LIMIT ?
  `);
  const findListingByIdentityStmt = db.prepare(`
    SELECT *
    FROM listings
    WHERE source = ?
      AND ((? IS NOT NULL AND external_id = ?) OR canonical_url = ?)
    LIMIT 1
  `);
  const insertListingStmt = db.prepare(`
    INSERT INTO listings (
      feed_id,
      source,
      vertical,
      gender,
      external_id,
      title,
      price_text,
      price_value,
      currency_text,
      price_original,
      currency_original,
      price_usd,
      url,
      canonical_url,
      location_text,
      seller_type,
      image_url_1,
      image_url_2,
      matched_brand,
      matched_category,
      matched_tags_json,
      published_text,
      posted_at,
      age_minutes,
      age_confidence,
      unknown_age,
      last_query,
      first_seen_at,
      last_seen_at,
      raw_json,
      is_new,
      is_match
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateListingStmt = db.prepare(`
    UPDATE listings
    SET vertical = ?,
        gender = ?,
        title = ?,
        price_text = ?,
        price_value = ?,
        currency_text = ?,
        price_original = ?,
        currency_original = ?,
        price_usd = ?,
        url = ?,
        canonical_url = ?,
        location_text = ?,
        seller_type = ?,
        image_url_1 = ?,
        image_url_2 = ?,
        matched_brand = ?,
        matched_category = ?,
        matched_tags_json = ?,
        published_text = ?,
        posted_at = ?,
        age_minutes = ?,
        age_confidence = ?,
        unknown_age = ?,
        last_query = ?,
        last_seen_at = ?,
        raw_json = ?,
        is_new = 0,
        is_match = ?
    WHERE id = ?
  `);
  const insertEventStmt = db.prepare(`
    INSERT INTO listing_events (listing_id, event_type, created_at)
    VALUES (?, ?, ?)
  `);
  const updateFeedCheckStmt = db.prepare(`
    UPDATE feeds
    SET last_checked_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `);
  const insertFeedRunStmt = db.prepare(`
    INSERT INTO feed_runs (feed_id, started_at)
    VALUES (?, ?)
  `);
  const finishFeedRunStmt = db.prepare(`
    UPDATE feed_runs
    SET finished_at = ?,
        duration_ms = ?,
        listings_parsed = ?,
        matches_found = ?,
        new_matches_found = ?,
        error = ?,
        response_status = ?,
        content_type = ?,
        final_url = ?,
        html_length = ?,
        cards_found = ?,
        items_extracted = ?,
        sample_titles_json = ?,
        parse_warnings_json = ?,
        strategies_used_json = ?,
        suspected_reason = ?,
        debug_html_path = ?,
        debug_report_path = ?,
        query_text = ?,
        items_skipped_old = ?,
        items_inserted = ?,
        items_unknown_age = ?
    WHERE id = ?
  `);
  const clearIsNewStmt = db.prepare(`
    UPDATE listings
    SET is_new = 0
    WHERE feed_id = ? AND first_seen_at < ?
  `);
  const listListingMetadataStmt = db.prepare(`
    SELECT id, title, raw_json, matched_category, published_text
    FROM listings
  `);
  const listVintedBackfillStmt = db.prepare(`
    SELECT id, raw_json
    FROM listings
    WHERE source = 'vinted'
      AND (price_usd IS NULL OR price_value IS NULL OR image_url_1 IS NULL OR price_text LIKE 'NaN %')
  `);
  const updateListingGenderStmt = db.prepare(`
    UPDATE listings
    SET gender = ?
    WHERE id = ?
  `);
  const updateVintedBackfillStmt = db.prepare(`
    UPDATE listings
    SET price_text = COALESCE(?, price_text),
        price_value = COALESCE(?, price_value),
        currency_text = COALESCE(?, currency_text),
        price_original = COALESCE(?, price_original),
        currency_original = COALESCE(?, currency_original),
        price_usd = COALESCE(?, price_usd),
        image_url_1 = COALESCE(?, image_url_1),
        url = COALESCE(?, url),
        canonical_url = COALESCE(?, canonical_url)
    WHERE id = ?
  `);
  const getListingByIdStmt = db.prepare(`
    SELECT
      l.*,
      f.name AS feed_name,
      r.score AS recommendation_score,
      r.reasons_json AS recommendation_reasons_json,
      r.score_breakdown_json AS recommendation_score_breakdown_json,
      ll.created_at AS liked_at
    FROM listings l
    INNER JOIN feeds f ON f.id = l.feed_id
    LEFT JOIN recommendations r ON r.listing_id = l.id
    LEFT JOIN listing_likes ll ON ll.listing_id = l.id
    WHERE l.id = ?
    LIMIT 1
  `);
  const upsertRecommendationStmt = db.prepare(`
    INSERT INTO recommendations (listing_id, score, reasons_json, score_breakdown_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET
      score = excluded.score,
      reasons_json = excluded.reasons_json,
      score_breakdown_json = excluded.score_breakdown_json,
      updated_at = excluded.updated_at
  `);
  const deleteRecommendationStmt = db.prepare(`DELETE FROM recommendations WHERE listing_id = ?`);
  const listRecommendationsStmt = db.prepare(`
    SELECT
      r.listing_id,
      r.score,
      r.score AS recommendation_score,
      r.reasons_json,
      r.reasons_json AS recommendation_reasons_json,
      r.score_breakdown_json AS recommendation_score_breakdown_json,
      r.created_at,
      r.updated_at,
      l.*,
      f.name AS feed_name,
      ll.created_at AS liked_at
    FROM recommendations r
    INNER JOIN listings l ON l.id = r.listing_id
    INNER JOIN feeds f ON f.id = l.feed_id
    LEFT JOIN listing_likes ll ON ll.listing_id = l.id
    ORDER BY l.is_new DESC, r.score DESC, r.updated_at DESC
    LIMIT ?
    OFFSET ?
  `);
  const insertLikeStmt = db.prepare(`
    INSERT INTO listing_likes (listing_id, created_at)
    VALUES (?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET created_at = excluded.created_at
  `);
  const deleteLikeStmt = db.prepare(`DELETE FROM listing_likes WHERE listing_id = ?`);
  const listLikesStmt = db.prepare(`
    SELECT
      ll.listing_id,
      ll.created_at,
      l.*,
      f.name AS feed_name,
      r.score AS recommendation_score,
      r.reasons_json AS recommendation_reasons_json,
      r.score_breakdown_json AS recommendation_score_breakdown_json
    FROM listing_likes ll
    INNER JOIN listings l ON l.id = ll.listing_id
    INNER JOIN feeds f ON f.id = l.feed_id
    LEFT JOIN recommendations r ON r.listing_id = l.id
    ORDER BY ll.created_at DESC
    LIMIT ?
    OFFSET ?
  `);
  const upsertOpportunityStmt = db.prepare(`
    INSERT INTO opportunities (listing_id, score, reasons_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET
      score = excluded.score,
      reasons_json = excluded.reasons_json,
      created_at = excluded.created_at
  `);
  const deleteOpportunityStmt = db.prepare(`DELETE FROM opportunities WHERE listing_id = ?`);
  const listOpportunitiesStmt = db.prepare(`
    SELECT
      o.listing_id,
      o.score,
      o.reasons_json,
      o.created_at,
      l.*,
      f.name AS feed_name,
      r.score AS recommendation_score,
      r.reasons_json AS recommendation_reasons_json,
      r.score_breakdown_json AS recommendation_score_breakdown_json,
      ll.created_at AS liked_at
    FROM opportunities o
    INNER JOIN listings l ON l.id = o.listing_id
    INNER JOIN feeds f ON f.id = l.feed_id
    LEFT JOIN recommendations r ON r.listing_id = l.id
    LEFT JOIN listing_likes ll ON ll.listing_id = l.id
    WHERE l.age_minutes IS NOT NULL
      AND l.age_minutes <= 60
    ORDER BY o.score DESC, o.created_at DESC
    LIMIT ?
    OFFSET ?
  `);
  const upsertNotifyCandidateStmt = db.prepare(`
    INSERT INTO notify_candidates (listing_id, score, reasons_json, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(listing_id) DO UPDATE SET
      score = excluded.score,
      reasons_json = excluded.reasons_json,
      created_at = excluded.created_at
  `);
  const upsertQueryMetricStmt = db.prepare(`
    INSERT INTO query_metrics (
      source,
      query,
      total_runs,
      total_found,
      new_items_found,
      recommendations_produced,
      avg_recommendation_score,
      noise_ratio,
      query_quality_score,
      last_success_at,
      cooldown_until,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, query) DO UPDATE SET
      total_runs = excluded.total_runs,
      total_found = excluded.total_found,
      new_items_found = excluded.new_items_found,
      recommendations_produced = excluded.recommendations_produced,
      avg_recommendation_score = excluded.avg_recommendation_score,
      noise_ratio = excluded.noise_ratio,
      query_quality_score = excluded.query_quality_score,
      last_success_at = excluded.last_success_at,
      cooldown_until = excluded.cooldown_until,
      updated_at = excluded.updated_at
  `);
  const listQueryMetricsStmt = db.prepare(`
    SELECT *
    FROM query_metrics
    WHERE (? IS NULL OR source = ?)
    ORDER BY query_quality_score DESC, updated_at DESC
    LIMIT ?
  `);
  const upsertSourceHealthStmt = db.prepare(`
    INSERT INTO source_health (
      source,
      last_success_at,
      last_failure_at,
      success_rate_last50,
      avg_items_extracted,
      avg_new_items_inserted,
      avg_run_duration,
      current_backoff_level,
      current_parser_mode,
      anti_bot_warnings_last24h,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      last_success_at = excluded.last_success_at,
      last_failure_at = excluded.last_failure_at,
      success_rate_last50 = excluded.success_rate_last50,
      avg_items_extracted = excluded.avg_items_extracted,
      avg_new_items_inserted = excluded.avg_new_items_inserted,
      avg_run_duration = excluded.avg_run_duration,
      current_backoff_level = excluded.current_backoff_level,
      current_parser_mode = excluded.current_parser_mode,
      anti_bot_warnings_last24h = excluded.anti_bot_warnings_last24h,
      updated_at = excluded.updated_at
  `);
  const listSourceHealthStmt = db.prepare(`
    SELECT *
    FROM source_health
    ORDER BY source ASC
  `);
  const upsertSessionHealthStmt = db.prepare(`
    INSERT INTO session_health (
      source,
      is_valid,
      last_success_at,
      last_403_at,
      last_captcha_at,
      last_items_extracted,
      consecutive_failures,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source) DO UPDATE SET
      is_valid = excluded.is_valid,
      last_success_at = excluded.last_success_at,
      last_403_at = excluded.last_403_at,
      last_captcha_at = excluded.last_captcha_at,
      last_items_extracted = excluded.last_items_extracted,
      consecutive_failures = excluded.consecutive_failures,
      updated_at = excluded.updated_at
  `);
  const listSessionHealthStmt = db.prepare(`
    SELECT *
    FROM session_health
    ORDER BY source ASC
  `);
  const upsertProxyHealthStmt = db.prepare(`
    INSERT INTO proxy_health (
      source,
      proxy_id,
      last_success_at,
      avg_latency,
      ban_count,
      captcha_count,
      extraction_success_rate,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, proxy_id) DO UPDATE SET
      last_success_at = excluded.last_success_at,
      avg_latency = excluded.avg_latency,
      ban_count = excluded.ban_count,
      captcha_count = excluded.captcha_count,
      extraction_success_rate = excluded.extraction_success_rate,
      updated_at = excluded.updated_at
  `);
  const listProxyHealthStmt = db.prepare(`
    SELECT *
    FROM proxy_health
    ORDER BY source ASC, proxy_id ASC
  `);
  const trimListingsBySourceStmt = db.prepare(`
    DELETE FROM listings
    WHERE id IN (
      SELECT id
      FROM listings
      WHERE source = ?
      ORDER BY COALESCE(posted_at, first_seen_at) DESC, first_seen_at DESC
      LIMIT -1 OFFSET ?
    )
  `);
  const deleteOldListingsBySourceStmt = db.prepare(`
    DELETE FROM listings
    WHERE source = ?
      AND COALESCE(posted_at, first_seen_at) < ?
  `);

  return {
    listFeeds(runningFeedIds = new Set<number>()): FeedWithFilter[] {
      return (listFeedsStmt.all() as unknown as FeedRow[]).map((row) => mapFeedWithFilter(row, runningFeedIds));
    },

    getFeedById(id: number, runningFeedIds = new Set<number>()): FeedWithFilter | null {
      const row = getFeedStmt.get(id) as unknown as FeedRow | undefined;
      return row ? mapFeedWithFilter(row, runningFeedIds) : null;
    },

    createFeed(input: FeedInput): FeedWithFilter {
      const now = new Date().toISOString();
      const enabled = input.enabled ?? true;
      const pollIntervalSec = input.pollIntervalSec ?? 60;
      const info = insertFeedStmt.run(
        input.source ?? 'mercari_jp',
        input.vertical ?? 'fashion',
        input.searchMode ?? 'exact_url',
        input.fetchMode ?? 'direct',
        input.categoryKey ?? null,
        input.presetKey ?? null,
        input.customQuery ?? null,
        input.name,
        input.url,
        enabled ? 1 : 0,
        pollIntervalSec,
        pollIntervalSec,
        now,
        now
      );
      const feedId = Number(info.lastInsertRowid);
      const filter = { ...defaultFilter(feedId), ...(input.filter ?? {}) };

      upsertFilterStmt.run(
        feedId,
        serializeJsonArray(filter.includeKeywords ?? []),
        serializeJsonArray(filter.excludeKeywords ?? []),
        serializeJsonArray(normalizeBrandSelection(filter.brands ?? [])),
        filter.minPriceValueOptional ?? null,
        filter.maxPriceValueOptional ?? null,
        filter.sellerTypePreference ?? 'any',
        filter.notes ?? null
      );

      return this.getFeedById(feedId) as FeedWithFilter;
    },

    updateFeed(id: number, input: FeedInput): FeedWithFilter | null {
      const existing = this.getFeedById(id);
      if (!existing) {
        return null;
      }

      const nextFeed = {
        source: input.source ?? existing.source,
        vertical: input.vertical ?? existing.vertical,
        searchMode: input.searchMode ?? existing.searchMode,
        fetchMode: input.fetchMode ?? existing.fetchMode,
        categoryKey: input.categoryKey ?? existing.categoryKey,
        presetKey: input.presetKey ?? existing.presetKey,
        customQuery: input.customQuery ?? existing.customQuery,
        name: input.name ?? existing.name,
        url: input.url ?? existing.url,
        enabled: input.enabled ?? existing.enabled,
        pollIntervalSec: input.pollIntervalSec ?? existing.pollIntervalSec
      };
      const now = new Date().toISOString();

      updateFeedStmt.run(
        nextFeed.source,
        nextFeed.vertical,
        nextFeed.searchMode,
        nextFeed.fetchMode,
        nextFeed.categoryKey,
        nextFeed.presetKey,
        nextFeed.customQuery,
        nextFeed.name,
        nextFeed.url,
        nextFeed.enabled ? 1 : 0,
        nextFeed.pollIntervalSec,
        Math.max(nextFeed.pollIntervalSec, existing.effectivePollIntervalSec),
        now,
        id
      );

      const nextFilter = {
        ...existing.filter,
        ...(input.filter ?? {})
      };

      upsertFilterStmt.run(
        id,
        serializeJsonArray(nextFilter.includeKeywords),
        serializeJsonArray(nextFilter.excludeKeywords),
        serializeJsonArray(normalizeBrandSelection(nextFilter.brands)),
        nextFilter.minPriceValueOptional,
        nextFilter.maxPriceValueOptional,
        nextFilter.sellerTypePreference,
        nextFilter.notes ?? null
      );

      return this.getFeedById(id) as FeedWithFilter;
    },

    setFeedFetchMode(id: number, fetchMode: FetchMode): FeedWithFilter | null {
      const existing = this.getFeedById(id);
      if (!existing) {
        return null;
      }
      updateFeedFetchModeStmt.run(fetchMode, new Date().toISOString(), id);
      return this.getFeedById(id) as FeedWithFilter;
    },

    deleteFeed(id: number): boolean {
      const info = deleteFeedStmt.run(id);
      return info.changes > 0;
    },

    listListings(options: ListListingsOptions = {}): Listing[] {
      const conditions = ['1 = 1'];
      const params: Array<number | string> = [];

      if (options.feedId) {
        conditions.push('l.feed_id = ?');
        params.push(options.feedId);
      }

      if (options.source) {
        conditions.push('l.source = ?');
        params.push(options.source);
      }

      if (options.vertical) {
        conditions.push('l.vertical = ?');
        params.push(options.vertical);
      }

      if (options.gender && options.gender !== 'unisex') {
        conditions.push("(l.gender = ? OR l.gender = 'unisex' OR l.gender IS NULL)");
        params.push(options.gender);
      }

      conditions.push("(l.gender != 'children' OR l.gender IS NULL)");

      if (options.scope === 'matched') {
        conditions.push('l.is_match = 1');
      } else if (options.scope === 'new') {
        conditions.push('l.is_new = 1');
      }

      if (options.timeFilter && options.timeFilter !== 'all') {
        const windowMs = options.timeFilter === 'today'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
        conditions.push('COALESCE(l.posted_at, l.first_seen_at) >= ?');
        params.push(new Date(Date.now() - windowMs).toISOString());
      }

      if (options.withPhotoOnly) {
        conditions.push('(l.image_url_1 IS NOT NULL OR l.image_url_2 IS NOT NULL)');
      }

      if (options.minPriceUsd !== undefined) {
        conditions.push('l.price_usd >= ?');
        params.push(options.minPriceUsd);
      }

      if (options.maxPriceUsd !== undefined) {
        conditions.push('l.price_usd <= ?');
        params.push(options.maxPriceUsd);
      }

      conditions.push('l.age_minutes IS NOT NULL AND l.age_minutes <= 60');

      const limit = options.limit ?? 250;
      const offset = options.offset ?? 0;
      const query = db.prepare(`
        SELECT
          l.*,
          f.name AS feed_name,
          r.score AS recommendation_score,
          r.reasons_json AS recommendation_reasons_json,
          r.score_breakdown_json AS recommendation_score_breakdown_json,
          ll.created_at AS liked_at
        FROM listings l
        INNER JOIN feeds f ON f.id = l.feed_id
        LEFT JOIN recommendations r ON r.listing_id = l.id
        LEFT JOIN listing_likes ll ON ll.listing_id = l.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY l.is_new DESC, COALESCE(l.age_minutes, 999999) ASC, COALESCE(l.posted_at, l.first_seen_at) DESC, l.first_seen_at DESC
        LIMIT ?
        OFFSET ?
      `);

      return (query.all(...params, limit, offset) as unknown as ListingRow[]).map(mapListing);
    },

    getListingById(id: number): Listing | null {
      const row = getListingByIdStmt.get(id) as unknown as ListingRow | undefined;
      return row ? mapListing(row) : null;
    },

    listRecommendations(limit = 120, offset = 0, timeFilter: TimeFilter = 'all', vertical?: Vertical, minPriceUsd?: number, maxPriceUsd?: number): Recommendation[] {
      const conditions = ['1 = 1'];
      const params: Array<number | string> = [];

      if (timeFilter !== 'all') {
        const windowMs = timeFilter === 'today'
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
        conditions.push('COALESCE(l.posted_at, l.first_seen_at) >= ?');
        params.push(new Date(Date.now() - windowMs).toISOString());
      }

      if (vertical) {
        conditions.push('l.vertical = ?');
        params.push(vertical);
      }

      if (minPriceUsd !== undefined) {
        conditions.push('l.price_usd >= ?');
        params.push(minPriceUsd);
      }

      if (maxPriceUsd !== undefined) {
        conditions.push('l.price_usd <= ?');
        params.push(maxPriceUsd);
      }

      conditions.push('l.age_minutes IS NOT NULL AND l.age_minutes <= 60');

      const query = db.prepare(`
        SELECT
          r.listing_id,
          r.score,
          r.score AS recommendation_score,
          r.reasons_json,
          r.reasons_json AS recommendation_reasons_json,
          r.score_breakdown_json,
          r.score_breakdown_json AS recommendation_score_breakdown_json,
          r.created_at,
          r.updated_at,
          l.*,
          f.name AS feed_name,
          ll.created_at AS liked_at
        FROM recommendations r
        INNER JOIN listings l ON l.id = r.listing_id
        INNER JOIN feeds f ON f.id = l.feed_id
        LEFT JOIN listing_likes ll ON ll.listing_id = l.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY COALESCE(l.age_minutes, 999999) ASC, r.score DESC, COALESCE(l.posted_at, l.first_seen_at) DESC
        LIMIT ?
        OFFSET ?
      `);

      return (query.all(...params, limit, offset) as unknown as Array<RecommendationRow & ListingRow>).map((row) => ({
        ...(function () {
          const listing = mapListing(row);
          const scoreBreakdown = parseJsonObject<ScoreBreakdown>(row.score_breakdown_json) ?? listing.scoreBreakdown ?? null;
          return {
            listingId: row.listing_id,
            score: row.score,
            reasons: parseJsonArray(row.reasons_json).length > 0 ? parseJsonArray(row.reasons_json) : (scoreBreakdown?.reasons ?? []),
            scoreBreakdown,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            listing: {
              ...listing,
              scoreBreakdown: listing.scoreBreakdown ?? scoreBreakdown,
              recommendationScore: listing.recommendationScore ?? row.score,
              recommendationReasons: listing.recommendationReasons?.length ? listing.recommendationReasons : (scoreBreakdown?.reasons ?? [])
            }
          };
        })()
      }));
    },

    listLikes(limit = 120, offset = 0): Like[] {
      return (listLikesStmt.all(limit, offset) as unknown as Array<LikeRow & ListingRow>).map((row) => ({
        listingId: row.listing_id,
        createdAt: row.created_at,
        listing: mapListing(row)
      }));
    },

    toggleLikeListing(listingId: number): { listing: Listing | null; liked: boolean } {
      const existing = db.prepare('SELECT listing_id FROM listing_likes WHERE listing_id = ? LIMIT 1').get(listingId) as { listing_id: number } | undefined;
      if (existing) {
        deleteLikeStmt.run(listingId);
        return { listing: this.getListingById(listingId), liked: false };
      }
      const now = new Date().toISOString();
      insertLikeStmt.run(listingId, now);
      return { listing: this.getListingById(listingId), liked: true };
    },

    likeListing(listingId: number): Listing | null {
      const now = new Date().toISOString();
      insertLikeStmt.run(listingId, now);
      return this.getListingById(listingId);
    },

    unlikeListing(listingId: number): Listing | null {
      deleteLikeStmt.run(listingId);
      return this.getListingById(listingId);
    },

    listOpportunities(limit = 40, offset = 0): Opportunity[] {
      return (listOpportunitiesStmt.all(limit, offset) as unknown as Array<OpportunityRow & ListingRow>).map((row) => ({
        listingId: row.listing_id,
        score: row.score,
        reasons: parseJsonArray(row.reasons_json),
        createdAt: row.created_at,
        listing: mapListing(row)
      }));
    },

    listRecentEvents(limit = 50): ListingEvent[] {
      const rows = listEventsStmt.all(limit) as unknown as EventRow[];
      return rows.map((row) => ({
        id: row.id,
        listingId: row.listing_id,
        eventType: row.event_type,
        createdAt: row.created_at
      }));
    },

    listFeedRuns(feedId: number, limit = 20): FeedRun[] {
      const query = db.prepare(`
        SELECT *
        FROM feed_runs
        WHERE feed_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `);

      return (query.all(feedId, limit) as unknown as FeedRunRow[]).map(mapRunRow);
    },

    listQueryMetrics(source?: FeedSource, limit = 200): QueryMetric[] {
      return (listQueryMetricsStmt.all(source ?? null, source ?? null, limit) as unknown as QueryMetricRow[]).map(mapQueryMetric);
    },

    upsertQueryMetric(metric: QueryMetric): void {
      upsertQueryMetricStmt.run(
        metric.source,
        metric.query,
        metric.totalRuns,
        metric.totalFound,
        metric.newItemsFound,
        metric.recommendationsProduced,
        metric.avgRecommendationScore,
        metric.noiseRatio,
        metric.queryQualityScore,
        metric.lastSuccessAt ?? null,
        metric.cooldownUntil ?? null,
        metric.updatedAt ?? new Date().toISOString()
      );
    },

    listSourceHealth(): SourceHealth[] {
      return (listSourceHealthStmt.all() as unknown as SourceHealthRow[]).map(mapSourceHealth);
    },

    upsertSourceHealth(entry: SourceHealth): void {
      upsertSourceHealthStmt.run(
        entry.source,
        entry.lastSuccessAt ?? null,
        entry.lastFailureAt ?? null,
        entry.successRateLast50,
        entry.avgItemsExtracted,
        entry.avgNewItemsInserted,
        entry.avgRunDuration,
        entry.currentBackoffLevel,
        entry.currentParserMode ?? null,
        entry.antiBotWarningsLast24h,
        entry.updatedAt ?? new Date().toISOString()
      );
    },

    listSessionHealth(): SessionHealth[] {
      return (listSessionHealthStmt.all() as unknown as SessionHealthRow[]).map(mapSessionHealth);
    },

    upsertSessionHealth(entry: SessionHealth): void {
      upsertSessionHealthStmt.run(
        entry.source,
        entry.isValid ? 1 : 0,
        entry.lastSuccessAt ?? null,
        entry.last403At ?? null,
        entry.lastCaptchaAt ?? null,
        entry.lastItemsExtracted,
        entry.consecutiveFailures,
        entry.updatedAt ?? new Date().toISOString()
      );
    },

    listProxyHealth(): ProxyHealth[] {
      return (listProxyHealthStmt.all() as unknown as ProxyHealthRow[]).map(mapProxyHealth);
    },

    upsertProxyHealth(entry: ProxyHealth): void {
      upsertProxyHealthStmt.run(
        entry.source,
        entry.proxyId ?? 'direct',
        entry.lastSuccessAt ?? null,
        entry.avgLatency,
        entry.banCount,
        entry.captchaCount,
        entry.extractionSuccessRate,
        entry.updatedAt ?? new Date().toISOString()
      );
    },

    cleanOldListings(source: FeedSource): number {
      const cutoff = new Date(Date.now() - cleanupAgeDays(source) * 24 * 60 * 60 * 1000).toISOString();
      const result = deleteOldListingsBySourceStmt.run(source, cutoff);
      return Number(result.changes ?? 0);
    },

    resetLiveState(): void {
      db.exec(`
        DELETE FROM notify_candidates;
        DELETE FROM opportunities;
        DELETE FROM recommendations;
        DELETE FROM listing_events;
        DELETE FROM listing_likes;
        DELETE FROM listings;
      `);
    },

    backfillListingGender(): { updated: number; removed: number } {
      const rows = listListingMetadataStmt.all() as unknown as ListingMetadataRow[];
      let updated = 0;
      let removed = 0;

      for (const row of rows) {
        const category = row.matched_category ?? '';
        const description = `${row.published_text ?? ''} ${row.raw_json}`;
        if (isChildrenItem(row.title, description, category)) {
          deleteListingStmt.run(row.id);
          removed += 1;
          continue;
        }

        updateListingGenderStmt.run(detectGender(row.title, description, category), row.id);
        updated += 1;
      }

      return { updated, removed };
    },

    backfillVintedListings(): { updated: number } {
      const rows = listVintedBackfillStmt.all() as unknown as VintedBackfillRow[];
      let updated = 0;

      for (const row of rows) {
        const payload = parseJsonObject<Record<string, unknown>>(row.raw_json);
        if (!payload) continue;

        const { price, currency } = extractVintedMoney(payload);
        const imageUrl = extractVintedImage(payload);
        const normalizedUrl = normalizeVintedItemUrl(payload);
        const info = updateVintedBackfillStmt.run(
          formatVintedPriceText(price, currency),
          price,
          currency,
          price,
          currency,
          price !== null && currency ? toUsd(price, currency) : null,
          imageUrl,
          normalizedUrl,
          normalizedUrl,
          row.id
        );

        if ((info.changes ?? 0) > 0) {
          updated += 1;
        }
      }

      return { updated };
    },

    updateFeedCheck(feedId: number, lastCheckedAt: string, lastError: string | null): void {
      updateFeedCheckStmt.run(lastCheckedAt, lastError, lastCheckedAt, feedId);
      clearIsNewStmt.run(feedId, new Date(Date.now() - 60 * 60 * 1000).toISOString());
    },

    updateFeedRuntime(feedId: number, payload: FeedRuntimeStateInput): void {
      updateFeedRuntimeStmt.run(
        payload.effectivePollIntervalSec,
        payload.consecutiveFailures,
        payload.consecutiveSuccesses,
        payload.sourceStatus,
        payload.lastBackoffReason,
        new Date().toISOString(),
        feedId
      );
    },

    createFeedRun(feedId: number, startedAt: string): number {
      const info = insertFeedRunStmt.run(feedId, startedAt);
      return Number(info.lastInsertRowid);
    },

    finishFeedRun(runId: number, payload: FinishFeedRunPayload): void {
      finishFeedRunStmt.run(
        payload.finishedAt,
        payload.durationMs,
        payload.listingsParsed,
        payload.matchesFound,
        payload.newMatchesFound,
        payload.error,
        payload.responseStatus,
        payload.contentType,
        payload.finalUrl,
        payload.htmlLength,
        payload.cardsFound,
        payload.itemsExtracted,
        serializeJsonArray(payload.sampleTitles),
        serializeJsonArray(payload.parseWarnings),
        serializeJsonArray(payload.strategiesUsed),
        payload.suspectedReason,
        payload.debugHtmlPath,
        payload.debugReportPath,
        payload.queryText,
        payload.itemsSkippedByAge,
        payload.itemsInserted,
        payload.itemsUnknownAge,
        runId
      );
    },

    upsertListing(
      feedId: number,
      candidate: ParsedListingCandidate,
      match: MatchResult,
      seenAt: string,
      context: { queryText?: string | null } = {}
    ): UpsertListingResult {
      if (!passesFilters(candidate.title, candidate.description ?? '', candidate.brandDetected ?? '')) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }

      if (!passesGlobalFilter(candidate.priceUsd ?? null)) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }

      const children = isChildrenItem(candidate.title, candidate.description ?? '', candidate.category ?? '');
      if (children) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }

      const postedAt = candidate.postedAt ?? candidate.publishedTextOptional ?? null;
      if (candidate.ageMinutesOptional === null || candidate.ageMinutesOptional === undefined) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }

      if (candidate.ageMinutesOptional > 60) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }

      const recommendation = scoreCandidateForRecommendation(candidate, match);
      if (recommendation.scoreBreakdown.noisePenalty <= -24) {
        return {
          listing: null,
          eventType: null,
          isNewListing: false
        };
      }
      const detectedBrand = candidate.brandDetected ?? match.matchedBrand;
      const gender = detectGender(candidate.title, candidate.description ?? '', candidate.category ?? '');
      const existing = findListingByIdentityStmt.get(
        candidate.source,
        candidate.externalId,
        candidate.externalId,
        candidate.canonicalUrl
      ) as unknown as ListingRow | undefined;

      if (!existing) {
        const info = insertListingStmt.run(
          feedId,
          candidate.source,
          candidate.vertical ?? 'fashion',
          gender,
          candidate.externalId,
          candidate.title,
          candidate.priceText,
          candidate.priceValueOptional,
          candidate.currencyTextOptional,
          candidate.priceOriginal ?? candidate.priceValueOptional,
          candidate.currencyOriginal ?? candidate.currencyTextOptional,
          candidate.priceUsd ?? null,
          candidate.url,
          candidate.canonicalUrl,
          candidate.locationText,
          candidate.sellerType,
          candidate.imageUrl1,
          candidate.imageUrl2,
          detectedBrand,
          match.matchedCategory,
          serializeJsonArray(match.matchedTags),
          candidate.publishedTextOptional,
          postedAt,
          candidate.ageMinutesOptional ?? null,
          candidate.ageConfidence ?? 'unknown',
          candidate.unknownAgeOptional ? 1 : 0,
          context.queryText ?? null,
          seenAt,
          seenAt,
          JSON.stringify(candidate.raw),
          1,
          match.isMatch ? 1 : 0
        );
        const insertedId = Number(info.lastInsertRowid);

        if (recommendation.recommended) {
          upsertRecommendationStmt.run(
            insertedId,
            recommendation.score,
            serializeJsonArray(recommendation.reasons),
            JSON.stringify(recommendation.scoreBreakdown),
            seenAt,
            seenAt
          );
        } else {
          deleteRecommendationStmt.run(insertedId);
        }

        if (recommendation.recommended && (candidate.ageMinutesOptional ?? 999999) <= 60 && recommendation.score >= RECOMMENDATION_THRESHOLD + 8) {
          upsertOpportunityStmt.run(insertedId, recommendation.score, serializeJsonArray(recommendation.reasons), seenAt);
        } else {
          deleteOpportunityStmt.run(insertedId);
        }

        if (recommendation.recommended && recommendation.score >= RECOMMENDATION_THRESHOLD + 18 && (candidate.ageMinutesOptional ?? 999999) <= 60) {
          upsertNotifyCandidateStmt.run(insertedId, recommendation.score, serializeJsonArray(recommendation.reasons), seenAt);
        }

        const listing = getListingByIdStmt.get(insertedId) as unknown as ListingRow;
        let eventType: ListingEvent['eventType'] | null = null;

        if (match.isMatch) {
          eventType = 'new_match';
          insertEventStmt.run(insertedId, eventType, seenAt);
        }

        trimListingsBySourceStmt.run(candidate.source, 500);

        return {
          listing: mapListing(listing),
          eventType,
          isNewListing: true
        };
      }

      updateListingStmt.run(
        candidate.vertical ?? 'fashion',
        gender,
        candidate.title,
        candidate.priceText,
        candidate.priceValueOptional,
        candidate.currencyTextOptional,
        candidate.priceOriginal ?? candidate.priceValueOptional,
        candidate.currencyOriginal ?? candidate.currencyTextOptional,
        candidate.priceUsd ?? null,
        candidate.url,
        candidate.canonicalUrl,
        candidate.locationText,
        candidate.sellerType,
        candidate.imageUrl1,
        candidate.imageUrl2,
        detectedBrand,
        match.matchedCategory,
        serializeJsonArray(match.matchedTags),
        candidate.publishedTextOptional,
        postedAt,
        candidate.ageMinutesOptional ?? null,
        candidate.ageConfidence ?? 'unknown',
        candidate.unknownAgeOptional ? 1 : 0,
        context.queryText ?? null,
        seenAt,
        JSON.stringify(candidate.raw),
        match.isMatch ? 1 : 0,
        existing.id
      );

      if (recommendation.recommended) {
        upsertRecommendationStmt.run(
          existing.id,
          recommendation.score,
          serializeJsonArray(recommendation.reasons),
          JSON.stringify(recommendation.scoreBreakdown),
          seenAt,
          seenAt
        );
      } else {
        deleteRecommendationStmt.run(existing.id);
      }

      if (recommendation.recommended && (candidate.ageMinutesOptional ?? 999999) <= 60 && recommendation.score >= RECOMMENDATION_THRESHOLD + 8) {
        upsertOpportunityStmt.run(existing.id, recommendation.score, serializeJsonArray(recommendation.reasons), seenAt);
      } else {
        deleteOpportunityStmt.run(existing.id);
      }

      if (recommendation.recommended && recommendation.score >= RECOMMENDATION_THRESHOLD + 18 && (candidate.ageMinutesOptional ?? 999999) <= 60) {
        upsertNotifyCandidateStmt.run(existing.id, recommendation.score, serializeJsonArray(recommendation.reasons), seenAt);
      }

      trimListingsBySourceStmt.run(candidate.source, 500);

      const eventType: ListingEvent['eventType'] = 'seen_again';
      const listing = getListingByIdStmt.get(existing.id) as unknown as ListingRow;
      return {
        listing: mapListing(listing),
        eventType,
        isNewListing: false
      };
    }
  };
}

export type Store = ReturnType<typeof createStore>;
