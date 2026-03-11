import type {
  FeedRun,
  FeedStatusPayload,
  FeedWithFilter,
  Listing,
  ListingsNewPayload,
  ListingUpsertPayload,
  NewMatchPayload,
  ParseReport,
  QueryMetric,
  SourceRuntimeDiagnostics,
  SourceStatus,
  FeedSource,
  Vertical
} from '@avito-monitor/shared';
import { detectBrand, getBrandTier, getSearchCategory, getSearchPreset, RECOMMENDATION_THRESHOLD } from '@avito-monitor/shared';
import { config } from '../config';
import { isBlocked, jitteredMs } from '../lib/antiBan';
import { saveDebugArtifacts } from '../lib/debug';
import { logger } from '../logger';
import { fetchAvitoSearch, parseAvitoSearchHtml } from '../parser/avito';
import { fetchCarousellSearch } from '../parser/carousell';
import { buildKufarUrl, fetchKufarSearch } from '../parser/kufar';
import { parseMercariSearchHtml, parseMercariSearchPayload, type MercariSearchPayload } from '../parser/mercari';
import { fetchRakumaSearch } from '../parser/rakuma';
import type { ParsedListingCandidate } from '../parser/types';
import { fetchVintedSearch } from '../parser/vinted';
import type { FinishFeedRunPayload, Store } from '../store';
import { BrowserService } from './browser';
import { freshWindowMinutes, normalizeCandidateAge } from './listingAge';
import { matchListing } from './matcher';
import { listEnabledCustomBrands, listEnabledCustomTags } from './customCatalog';
import { writeDiagnosticsReport } from './diagnosticsReport';
import { enqueueNotifyJob, markStandaloneCrawlFinish, markStandaloneCrawlStart, queueRuntimeMode } from './queue';
import { buildQueryPlan } from './queryPlanner';
import { getNextQuery, queryQualityScore } from './queryPool';
import { scoreCandidateForRecommendation } from './recommendations';
import { getRenderWaitSelectors } from './search';

interface PollerEvents {
  emitFeedStatus(payload: FeedStatusPayload): void;
  emitNewMatch(payload: NewMatchPayload): void;
  emitListingUpsert(payload: ListingUpsertPayload): void;
  emitListingsNew(payload: ListingsNewPayload): void;
}

export interface RunFeedResult {
  feed: FeedWithFilter | null;
  latestRun: FeedRun | null;
  report: ParseReport;
}

interface InspectMeta {
  htmlBlob: string;
  statuses: number[];
  contentTypes: string[];
  finalUrls: string[];
  pageTitles: string[];
  selectorHits: Record<string, number>;
  selectorsAttempted: string[];
  cardsFound: number;
  strategiesUsed: string[];
  warnings: string[];
  suspectedReason: string | null;
  runtimeDiagnostics: SourceRuntimeDiagnostics | null;
}

interface FreshnessState {
  startedAt: number;
  staleCount: number;
  recentNewCounts: number[];
}

type ActiveSource = Extract<FeedSource, 'avito' | 'mercari_jp' | 'kufar' | 'vinted' | 'carousell' | 'rakuma'>;
type QueryCategory =
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
  | null;

function randomQueryDelayMs(): number {
  return 1_000 + Math.floor(Math.random() * 2_001);
}

async function pauseBetweenQueries(index: number, total: number): Promise<void> {
  if (index >= total - 1) return;
  await new Promise((resolve) => setTimeout(resolve, randomQueryDelayMs()));
}

function getBasePollIntervalSec(feed: FeedWithFilter): number {
  return Math.max(feed.pollIntervalSec, 30);
}

function nextBackoffInterval(feed: FeedWithFilter, consecutiveFailures: number, errorMessage: string | null): number {
  const baseIntervalSec = getBasePollIntervalSec(feed);
  const restricted = ['401', '403', '429', '503'].some((code) => errorMessage?.includes(code));

  if (restricted) {
    if (consecutiveFailures <= 1) return baseIntervalSec * 2;
    if (consecutiveFailures === 2) return baseIntervalSec * 3;
    return baseIntervalSec * 4;
  }

  if (consecutiveFailures <= 1) return Math.ceil(baseIntervalSec * 1.5);
  if (consecutiveFailures === 2) return baseIntervalSec * 2;
  return baseIntervalSec * 3;
}

function recoverInterval(currentIntervalSec: number, baseIntervalSec: number): number {
  if (currentIntervalSec <= baseIntervalSec) return baseIntervalSec;
  return Math.max(baseIntervalSec, Math.ceil(currentIntervalSec * 0.75));
}

function deriveRuntimeState(feed: FeedWithFilter, report: ParseReport | null, errorMessage: string | null): {
  effectivePollIntervalSec: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  sourceStatus: SourceStatus;
  lastBackoffReason: string | null;
} {
  if (!feed.enabled) {
    return {
      effectivePollIntervalSec: getBasePollIntervalSec(feed),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      sourceStatus: 'paused',
      lastBackoffReason: null
    };
  }

  const basePollIntervalSec = getBasePollIntervalSec(feed);
  const blockReason = report?.runtimeDiagnostics?.blockReason ?? null;
  if (blockReason === 'no_session' && feed.source === 'carousell') {
    return {
      effectivePollIntervalSec: basePollIntervalSec,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      sourceStatus: 'paused',
      lastBackoffReason: errorMessage
    };
  }

  if (blockReason === 'proxy_required' && feed.source === 'avito') {
    return {
      effectivePollIntervalSec: basePollIntervalSec,
      consecutiveFailures: feed.consecutiveFailures,
      consecutiveSuccesses: 0,
      sourceStatus: 'degraded',
      lastBackoffReason: errorMessage
    };
  }

  if (!errorMessage && feed.source === 'avito' && report?.runtimeDiagnostics?.proxyActive === false) {
    return {
      effectivePollIntervalSec: basePollIntervalSec,
      consecutiveFailures: 0,
      consecutiveSuccesses: feed.consecutiveSuccesses + 1,
      sourceStatus: 'degraded',
      lastBackoffReason: 'Avito is running without a static proxy and may become unstable.'
    };
  }

  if (errorMessage) {
    const consecutiveFailures = feed.consecutiveFailures + 1;
    const restricted = report?.responseStatus === 401 || report?.responseStatus === 403 || report?.responseStatus === 429 || report?.responseStatus === 503;
    return {
      effectivePollIntervalSec: nextBackoffInterval(feed, consecutiveFailures, errorMessage),
      consecutiveFailures,
      consecutiveSuccesses: 0,
      sourceStatus: restricted ? 'blocked' : 'backoff',
      lastBackoffReason: errorMessage
    };
  }

  const consecutiveSuccesses = feed.consecutiveSuccesses + 1;
  const effectivePollIntervalSec = feed.consecutiveFailures === 0
    ? basePollIntervalSec
    : (consecutiveSuccesses >= 2 ? recoverInterval(feed.effectivePollIntervalSec, basePollIntervalSec) : Math.max(basePollIntervalSec, feed.effectivePollIntervalSec));

  return {
    effectivePollIntervalSec,
    consecutiveFailures: 0,
    consecutiveSuccesses,
    sourceStatus: effectivePollIntervalSec > basePollIntervalSec ? 'backoff' : 'active',
    lastBackoffReason: effectivePollIntervalSec > basePollIntervalSec ? 'Polling interval is temporarily raised after previous errors.' : null
  };
}

function buildRunError(report: ParseReport): string | null {
  if (report.responseStatus && report.responseStatus >= 400) {
    return report.suspectedReason ? `${report.suspectedReason} HTTP ${report.responseStatus}.` : `Source returned HTTP ${report.responseStatus}.`;
  }

  const normalizedReason = report.suspectedReason?.toLowerCase() ?? '';
  const warningText = report.parseWarnings.join(' ').toLowerCase();
  const looksOperational = /blocked|captcha|cloudflare|auth|authorization|proxy|required|request failed|crawl failed|browser crawl failed|recognizable listing cards|no cookies|no session|challenge|access restriction|forbidden|429|403|503/.test(
    `${normalizedReason} ${warningText}`
  );

  if (report.itemsExtracted === 0 && report.suspectedReason && looksOperational) {
    return report.suspectedReason;
  }
  return null;
}

function sourceQueryUrl(source: ActiveSource, query: string, vertical: Vertical): string {
  if (source === 'avito') {
    const url = new URL('https://www.avito.ru/rossiya/odezhda_obuv_aksessuary');
    url.searchParams.set('q', query);
    url.searchParams.set('s', '104');
    return url.toString();
  }
  if (source === 'mercari_jp') {
    const url = new URL('https://jp.mercari.com/search');
    url.searchParams.set('keyword', query);
    url.searchParams.set('status', 'on_sale');
    url.searchParams.set('sort', 'created_time');
    url.searchParams.set('order', 'desc');
    return url.toString();
  }
  if (source === 'kufar') {
    return buildKufarUrl(query, vertical);
  }
  if (source === 'vinted') {
    const url = new URL('https://www.vinted.com/api/v2/catalog/items');
    url.searchParams.set('search_text', query);
    url.searchParams.set('per_page', '30');
    url.searchParams.set('order', 'newest_first');
    return url.toString();
  }
  if (source === 'carousell') {
    return `https://www.carousell.com.my/search/${encodeURIComponent(query)}?addRecent=true&canChangeKeyword=true&includeSuggestions=true&t-search_query_source=direct_search`;
  }
  if (source === 'rakuma') {
    const url = new URL('https://api.fril.jp/v1/items/search.json');
    url.searchParams.set('keyword', query);
    url.searchParams.set('sort', 'created_at_desc');
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', '30');
    return url.toString();
  }
  throw new Error(`Unsupported source query url for ${source}`);
}

function dedupeCandidates(candidates: ParsedListingCandidate[]): ParsedListingCandidate[] {
  const seen = new Set<string>();
  const output: ParsedListingCandidate[] = [];
  for (const candidate of candidates) {
    const identity = `${candidate.source}:${candidate.externalId ?? candidate.canonicalUrl}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    output.push(candidate);
  }
  return output;
}

function extractQueryFromUrl(urlString: string, source: FeedSource): string | null {
  try {
    const url = new URL(urlString);
    if (source === 'avito') return url.searchParams.get('q');
    if (source === 'mercari_jp') return url.searchParams.get('keyword');
    if (source === 'kufar') return url.searchParams.get('query');
    if (source === 'vinted') return url.searchParams.get('search_text');
    if (source === 'carousell') return url.searchParams.get('q') ?? url.searchParams.get('query');
    if (source === 'rakuma') {
      if (url.searchParams.get('keyword')) return url.searchParams.get('keyword');
      if (url.pathname.startsWith('/search/')) {
        return decodeURIComponent(url.pathname.replace(/^\/search\//, ''));
      }
    }
    return null;
  } catch {
    return null;
  }
}

function collectQueries(feed: FeedWithFilter): string[] {
  if (feed.searchMode === 'exact_url') {
    const exactQuery = extractQueryFromUrl(feed.url, feed.source);
    return exactQuery ? [exactQuery] : [];
  }

  const presetIds = feed.presetKey ? [feed.presetKey] : [];
  const maxQueries = feed.source === 'mercari_jp' ? 30 : feed.source === 'carousell' ? 8 : feed.source === 'avito' ? 10 : 12;
  const plan = buildQueryPlan(presetIds, feed.source as ActiveSource, feed.categoryKey, feed.customQuery, maxQueries, feed.vertical);
  if (plan.length > 0) {
    return plan;
  }

  const category = feed.categoryKey ? getSearchCategory(feed.categoryKey) : null;
  const fallback = feed.customQuery?.trim()
    || category?.quickQueryBySource[feed.source]
    || category?.keywords[0]
    || 'archive';
  return [fallback];
}

function blend(previous: number, next: number, weight = 0.2): number {
  return previous <= 0 ? next : (previous * (1 - weight)) + (next * weight);
}

function currentParserMode(report: ParseReport): string | null {
  if (report.runtimeDiagnostics?.transportMode) {
    return report.runtimeDiagnostics.transportMode;
  }
  return report.strategiesUsed[0] ?? null;
}

function sourceBrandFocus(feed: FeedWithFilter): string[] {
  const presetFocus = feed.presetKey ? getSearchPreset(feed.presetKey).brandFocus : [];
  return [...new Set([...presetFocus, ...(feed.filter.brands ?? [])])];
}

function brandNamesAligned(left: string, right: string): boolean {
  const a = left.toLowerCase().trim();
  const b = right.toLowerCase().trim();
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const tokensA = new Set(a.split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u3400-\u9fff]+/i).filter((token) => token.length >= 3));
  const tokensB = new Set(b.split(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u3400-\u9fff]+/i).filter((token) => token.length >= 3));
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      return true;
    }
  }
  return false;
}

function queryCategoryFromText(text: string): QueryCategory {
  const lowered = text.toLowerCase();
  if (/\bcoat\b|\bparka\b/.test(lowered) || /コート|пальто|парка/.test(text)) return 'coats';
  if (/\bbomber\b|\bjacket\b|\bouterwear\b|blouson/.test(lowered) || /ジャケット|куртк|бомбер|ветровк|косух/.test(text)) return 'outerwear';
  if (/\bhoodie\b|\bsweatshirt\b/.test(lowered) || /パーカー|худи|толстовк/.test(text)) return 'hoodie';
  if (/\bboots?\b/.test(lowered) || /ブーツ|сапог|ботин/.test(text)) return 'boots';
  if (/\bsneakers?\b/.test(lowered) || /スニーカー|кроссов/.test(text)) return 'sneakers';
  if (/\bbag\b|\bbackpack\b|\bwallet\b/.test(lowered) || /バッグ|сумк|рюкзак|кошелек/.test(text)) return 'bags';
  if (/\bbelt\b/.test(lowered) || /ベルト|ремень/.test(text)) return 'belts';
  if (/\bjeans?\b|\bdenim\b/.test(lowered) || /デニム|джинс/.test(text)) return 'denim';
  if (/\bpants?\b|\btrousers?\b|\bcargo\b/.test(lowered) || /パンツ|брюк|штаны|карго/.test(text)) return 'pants';
  if (/\bshirt\b|\btee\b|\bt-shirt\b/.test(lowered) || /シャツ|рубашк|футболк/.test(text)) return 'shirts';
  if (/\bsweater\b|\bknit\b|\bcardigan\b/.test(lowered) || /ニット|кардиган|свитер|джемпер/.test(text)) return 'knitwear';
  if (/\bvest\b/.test(lowered) || /ベスト|жилет/.test(text)) return 'vest';
  return null;
}

function categoriesCompatible(expected: QueryCategory, actual: QueryCategory): boolean {
  if (!expected || !actual) return true;
  if (expected === actual) return true;
  if ((expected === 'outerwear' && actual === 'coats') || (expected === 'coats' && actual === 'outerwear')) return true;
  if ((expected === 'pants' && actual === 'denim') || (expected === 'denim' && actual === 'pants')) return true;
  return false;
}

function candidateMatchesQueryCategory(queryText: string | null, candidate: ParsedListingCandidate): boolean {
  if (!queryText) return true;
  const expectedCategory = queryCategoryFromText(queryText);
  if (!expectedCategory) return true;

  const actualCategory = queryCategoryFromText([
    candidate.title,
    candidate.description,
    candidate.publishedTextOptional,
    candidate.raw ? JSON.stringify(candidate.raw) : null
  ].filter(Boolean).join(' '));

  return categoriesCompatible(expectedCategory, actualCategory);
}

function selectQueryForFeed(feed: FeedWithFilter, metrics: QueryMetric[]): string | null {
  if (feed.searchMode === 'exact_url') {
    return extractQueryFromUrl(feed.url, feed.source);
  }

  return getNextQuery({
    source: feed.source,
    brandFocus: sourceBrandFocus(feed),
    customQuery: feed.customQuery,
    categoryKey: feed.categoryKey,
    metrics,
    extraBrands: listEnabledCustomBrands(),
    extraTags: listEnabledCustomTags()
  });
}

function emptyMeta(): InspectMeta {
  return {
    htmlBlob: '',
    statuses: [],
    contentTypes: [],
    finalUrls: [],
    pageTitles: [],
    selectorHits: {},
    selectorsAttempted: [],
    cardsFound: 0,
    strategiesUsed: [],
    warnings: [],
    suspectedReason: null,
    runtimeDiagnostics: null
  };
}

async function queueRecommendationNotification(listing: Listing): Promise<void> {
  const score = listing.recommendationScore ?? 0;
  if (score < 60) {
    return;
  }

  const brandName = listing.matchedBrand ?? 'Unknown';
  await enqueueNotifyJob({
    listingId: listing.id,
    title: listing.title,
    brandName,
    priceUsd: listing.priceUsd ?? null,
    source: listing.source,
    url: listing.url,
    imageUrl: listing.imageUrl1,
    score,
    tier: getBrandTier(brandName)
  }, `notify-${listing.id}`);
}

function mergeRuntimeDiagnostics(
  current: SourceRuntimeDiagnostics | null,
  next: SourceRuntimeDiagnostics | null
): SourceRuntimeDiagnostics | null {
  if (!current) return next;
  if (!next) return current;

  return {
    cookieProvider: next.cookieProvider ?? current.cookieProvider,
    transportMode: next.transportMode ?? current.transportMode,
    proxyActive: next.proxyActive ?? current.proxyActive,
    blockReason: next.blockReason ?? current.blockReason,
    lastRecoveryAction: next.lastRecoveryAction ?? current.lastRecoveryAction
  };
}

async function inspectMercariFeed(browser: BrowserService, feed: FeedWithFilter, queries?: string[]): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const plan = feed.searchMode === 'exact_url' ? [] : (queries ?? collectQueries(feed));
  const urls = feed.searchMode === 'exact_url' ? [feed.url] : plan.map((query) => sourceQueryUrl('mercari_jp', query, feed.vertical));
  const selectors = getRenderWaitSelectors(feed.source);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();

  if (feed.searchMode !== 'exact_url') {
    const mercariUrls = urls.slice(0, 8);
    for (const [index, url] of mercariUrls.entries()) {
      const fetchResult = await browser.fetchRenderedPage(url, selectors, {
        captureResponseUrls: ['api.mercari.jp/v2/entities:search']
      });

      const apiResponse = fetchResult.capturedResponses
        .find((response) => response.url.includes('api.mercari.jp/v2/entities:search') && response.status === 200 && response.body);
      let apiListings: ParsedListingCandidate[] = [];
      if (apiResponse?.body) {
        try {
          apiListings = parseMercariSearchPayload(JSON.parse(apiResponse.body) as MercariSearchPayload);
        } catch {
          meta.warnings.push('Mercari API payload could not be parsed.');
        }
      }

      if (apiListings.length > 0) {
        candidates.push(...apiListings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
        meta.htmlBlob += `\n/* ${url} */\n${apiResponse?.body ?? ''}`;
        meta.statuses.push(apiResponse?.status ?? fetchResult.status);
        meta.contentTypes.push(apiResponse?.contentType ?? 'application/json');
        meta.finalUrls.push(url);
        meta.cardsFound += apiListings.length;
        meta.strategiesUsed.push('mercari_browser_api');
      } else {
        const parsed = parseMercariSearchHtml(fetchResult.html, fetchResult.finalUrl || url);
        candidates.push(...parsed.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
        meta.htmlBlob += `\n<!-- ${url} -->\n${fetchResult.html}`;
        meta.statuses.push(fetchResult.status);
        meta.contentTypes.push(fetchResult.contentType ?? 'text/html');
        meta.finalUrls.push(fetchResult.finalUrl);
        if (parsed.diagnostics.pageTitle) meta.pageTitles.push(parsed.diagnostics.pageTitle);
        meta.cardsFound += parsed.diagnostics.cardsFound;
        meta.selectorsAttempted.push(...parsed.diagnostics.selectorsAttempted);
        meta.strategiesUsed.push('mercari_browser_render', ...parsed.diagnostics.strategiesUsed);
        meta.warnings.push(...parsed.diagnostics.warnings);
        meta.suspectedReason = meta.suspectedReason ?? parsed.diagnostics.suspectedReason;
        for (const [selector, count] of Object.entries(parsed.diagnostics.selectorHits)) {
          meta.selectorHits[selector] = (meta.selectorHits[selector] ?? 0) + count;
        }
      }

      const failedApiResponses = fetchResult.capturedResponses
        .filter((response) => response.url.includes('api.mercari.jp/v2/entities:search') && response.status >= 400);
      meta.warnings.push(...failedApiResponses.map((response) => `Mercari API HTTP ${response.status}`));
      await pauseBetweenQueries(index, mercariUrls.length);
    }
  } else {
    const mercariUrls = urls.slice(0, 8);
    for (const [index, url] of mercariUrls.entries()) {
      const fetchResult = await browser.fetchRenderedPage(url, selectors);
      const parsed = parseMercariSearchHtml(fetchResult.html, fetchResult.finalUrl || url);
      candidates.push(...parsed.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
      meta.htmlBlob += `\n<!-- ${url} -->\n${fetchResult.html}`;
      meta.statuses.push(fetchResult.status);
      meta.contentTypes.push(fetchResult.contentType ?? 'text/html');
      meta.finalUrls.push(fetchResult.finalUrl);
      if (parsed.diagnostics.pageTitle) meta.pageTitles.push(parsed.diagnostics.pageTitle);
      meta.cardsFound += parsed.diagnostics.cardsFound;
      meta.selectorsAttempted.push(...parsed.diagnostics.selectorsAttempted);
      meta.strategiesUsed.push('mercari_browser_render', ...parsed.diagnostics.strategiesUsed);
      meta.warnings.push(...parsed.diagnostics.warnings);
      meta.suspectedReason = meta.suspectedReason ?? parsed.diagnostics.suspectedReason;
      for (const [selector, count] of Object.entries(parsed.diagnostics.selectorHits)) {
        meta.selectorHits[selector] = (meta.selectorHits[selector] ?? 0) + count;
      }
      await pauseBetweenQueries(index, mercariUrls.length);
    }
  }

  if (candidates.length === 0) meta.suspectedReason = meta.suspectedReason ?? 'Mercari returned no cards for the current query set.';
  return { candidates: dedupeCandidates(candidates), meta };
}

async function inspectAvitoFeed(browser: BrowserService, feed: FeedWithFilter, query?: string | null): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const queries = (query ? [query] : collectQueries(feed)).slice(0, 1);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();
  for (const [index, query] of queries.entries()) {
    const url = sourceQueryUrl('avito', query, feed.vertical);
    const result = await fetchAvitoSearch(query);
    const normalizedListings = result.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical }));

    if (normalizedListings.length > 0) {
      candidates.push(...normalizedListings);
      meta.htmlBlob += `\n<!-- avito query: ${query} -->\n${result.html}`;
      if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
      meta.contentTypes.push('text/html');
      meta.finalUrls.push(result.finalUrl);
      if (result.pageTitle) meta.pageTitles.push(result.pageTitle);
      meta.cardsFound += result.cardsFound;
      meta.selectorsAttempted.push(...result.selectorsAttempted);
      meta.strategiesUsed.push(...result.strategiesUsed);
      meta.warnings.push(...result.warnings);
      meta.suspectedReason = meta.suspectedReason ?? result.suspectedReason;
      meta.runtimeDiagnostics = mergeRuntimeDiagnostics(meta.runtimeDiagnostics, result.runtimeDiagnostics);
      for (const [selector, count] of Object.entries(result.selectorHits)) {
        meta.selectorHits[selector] = (meta.selectorHits[selector] ?? 0) + count;
      }
      await pauseBetweenQueries(index, queries.length);
      continue;
    }

    const directBlocked = isBlocked(result.html, result.responseStatus ?? 200);
    const directReturnedDocument = result.rawLength > 0 && Boolean(result.finalUrl);
    if (result.runtimeDiagnostics?.blockReason) {
      meta.htmlBlob += `\n<!-- avito query: ${query} -->\n${result.html}`;
      if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
      meta.contentTypes.push('text/html');
      meta.finalUrls.push(result.finalUrl);
      if (result.pageTitle) meta.pageTitles.push(result.pageTitle);
      meta.cardsFound += result.cardsFound;
      meta.selectorsAttempted.push(...result.selectorsAttempted);
      meta.strategiesUsed.push(...result.strategiesUsed);
      meta.warnings.push(...result.warnings);
      meta.suspectedReason = meta.suspectedReason ?? result.suspectedReason;
      meta.runtimeDiagnostics = mergeRuntimeDiagnostics(meta.runtimeDiagnostics, result.runtimeDiagnostics);
      await pauseBetweenQueries(index, queries.length);
      break;
    }

    if (directReturnedDocument && !directBlocked && result.cardsFound > 0) {
      meta.htmlBlob += `\n<!-- avito query: ${query} -->\n${result.html}`;
      if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
      meta.contentTypes.push('text/html');
      meta.finalUrls.push(result.finalUrl);
      if (result.pageTitle) meta.pageTitles.push(result.pageTitle);
      meta.cardsFound += result.cardsFound;
      meta.selectorsAttempted.push(...result.selectorsAttempted);
      meta.strategiesUsed.push(...result.strategiesUsed);
      meta.warnings.push(...result.warnings);
      meta.suspectedReason = meta.suspectedReason ?? result.suspectedReason ?? 'Avito returned an empty direct page.';
      meta.runtimeDiagnostics = mergeRuntimeDiagnostics(meta.runtimeDiagnostics, result.runtimeDiagnostics);
      for (const [selector, count] of Object.entries(result.selectorHits)) {
        meta.selectorHits[selector] = (meta.selectorHits[selector] ?? 0) + count;
      }
      await pauseBetweenQueries(index, queries.length);
      continue;
    }

    if (directReturnedDocument && !directBlocked && result.cardsFound === 0) {
      meta.warnings.push('Avito direct HTML returned without extractable cards. Trying browser render.');
    }

    const rendered = await browser.fetchRenderedPage(url, ['[data-marker="item"]', '[class*="iva-item-root"]', 'a[href*="_"]']);
    const parsedRendered = parseAvitoSearchHtml(rendered.html, rendered.finalUrl || url);
    const renderedListings = parsedRendered.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical }));
    const renderedBlocked = /доступ ограничен|problem with ip|access denied/i.test(
      `${parsedRendered.diagnostics.pageTitle ?? ''} ${rendered.html.slice(0, 4000)}`
    );

    candidates.push(...renderedListings);
    meta.htmlBlob += `\n<!-- avito rendered query: ${query} -->\n${rendered.html}`;
    meta.statuses.push(rendered.status);
    meta.contentTypes.push(rendered.contentType ?? 'text/html');
    meta.finalUrls.push(rendered.finalUrl);
    if (parsedRendered.diagnostics.pageTitle) meta.pageTitles.push(parsedRendered.diagnostics.pageTitle);
    meta.cardsFound += parsedRendered.diagnostics.cardsFound;
    meta.selectorsAttempted.push(...parsedRendered.diagnostics.selectorsAttempted);
    meta.strategiesUsed.push('avito_browser_render', ...parsedRendered.diagnostics.strategiesUsed);
    meta.warnings.push(...result.warnings);
    meta.warnings.push(...parsedRendered.diagnostics.warnings);
    meta.runtimeDiagnostics = mergeRuntimeDiagnostics(meta.runtimeDiagnostics, {
      ...(result.runtimeDiagnostics ?? {
        cookieProvider: 'none',
        proxyActive: true
      }),
      transportMode: 'browser',
      blockReason: renderedBlocked ? 'cloudflare_blocked' : result.runtimeDiagnostics?.blockReason ?? parsedRendered.diagnostics.suspectedReason ?? null,
      lastRecoveryAction: 'browser_fallback'
    });
    if (renderedBlocked) {
      meta.warnings.push('Avito rendered page was blocked with an IP restriction.');
    }
    meta.suspectedReason = meta.suspectedReason
      ?? (renderedBlocked ? 'Avito rendered page was blocked with an IP restriction.' : parsedRendered.diagnostics.suspectedReason ?? result.suspectedReason);
    for (const [selector, count] of Object.entries(parsedRendered.diagnostics.selectorHits)) {
      meta.selectorHits[selector] = (meta.selectorHits[selector] ?? 0) + count;
    }
    if (renderedBlocked) {
      break;
    }
    await pauseBetweenQueries(index, queries.length);
  }
  if (candidates.length === 0) meta.suspectedReason = meta.warnings[0] ?? 'Avito returned no listings for the current query.';
  return { candidates: dedupeCandidates(candidates), meta };
}

async function inspectKufarFeed(feed: FeedWithFilter, query?: string | null): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const queries = (query ? [query] : collectQueries(feed)).slice(0, 1);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();
  for (const [index, query] of queries.entries()) {
    const result = await fetchKufarSearch(query, feed.vertical);
    candidates.push(...result.listings);
    meta.htmlBlob += `\n/* kufar query: ${query} */\n${JSON.stringify(result.listings.map((item) => item.raw))}`;
    if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
    meta.contentTypes.push('application/json');
    meta.finalUrls.push(sourceQueryUrl('kufar', query, feed.vertical));
    meta.cardsFound += result.listings.length;
    meta.strategiesUsed.push('kufar_json_api');
    meta.warnings.push(...result.warnings);
    await pauseBetweenQueries(index, queries.length);
  }
  if (candidates.length === 0) meta.suspectedReason = meta.warnings[0] ?? 'Kufar returned no listings for the current query.';
  return { candidates: dedupeCandidates(candidates), meta };
}

async function inspectVintedFeed(feed: FeedWithFilter, query?: string | null): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const queries = (query ? [query] : collectQueries(feed)).slice(0, 1);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();
  for (const [index, query] of queries.entries()) {
    const result = await fetchVintedSearch(query);
    candidates.push(...result.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
    meta.htmlBlob += `\n/* vinted query: ${query} */\n${JSON.stringify(result.listings.map((item) => item.raw))}`;
    if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
    meta.contentTypes.push('application/json');
    meta.finalUrls.push(sourceQueryUrl('vinted', query, feed.vertical));
    meta.cardsFound += result.listings.length;
    meta.strategiesUsed.push('vinted_json_api');
    meta.warnings.push(...result.warnings);
    await pauseBetweenQueries(index, queries.length);
  }
  if (candidates.length === 0) meta.suspectedReason = meta.warnings[0] ?? 'Vinted returned no listings for the current query.';
  return { candidates: dedupeCandidates(candidates), meta };
}

async function inspectCarousellFeed(feed: FeedWithFilter, query?: string | null): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const queries = (query ? [query] : collectQueries(feed)).slice(0, 1);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();
  for (const [index, query] of queries.entries()) {
    const result = await fetchCarousellSearch(query);
    candidates.push(...result.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
    meta.htmlBlob += `\n/* carousell query: ${query} */\n${JSON.stringify(result.listings.map((item) => item.raw))}`;
    if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
    meta.contentTypes.push('text/html');
    meta.finalUrls.push(sourceQueryUrl('carousell', query, feed.vertical));
    meta.cardsFound += result.listings.length;
    meta.strategiesUsed.push('carousell_search_html');
    meta.warnings.push(...result.warnings);
    meta.runtimeDiagnostics = mergeRuntimeDiagnostics(meta.runtimeDiagnostics, result.runtimeDiagnostics);
    await pauseBetweenQueries(index, queries.length);
  }
  if (candidates.length === 0) meta.suspectedReason = meta.warnings[0] ?? 'Carousell returned no listings for the current query.';
  return { candidates: dedupeCandidates(candidates), meta };
}

async function inspectRakumaFeed(feed: FeedWithFilter, query?: string | null): Promise<{ candidates: ParsedListingCandidate[]; meta: InspectMeta }> {
  const queries = (query ? [query] : collectQueries(feed)).slice(0, 1);
  const candidates: ParsedListingCandidate[] = [];
  const meta = emptyMeta();
  for (const [index, query] of queries.entries()) {
    const result = await fetchRakumaSearch(query);
    candidates.push(...result.listings.map((item) => ({ ...item, vertical: item.vertical ?? feed.vertical })));
    meta.htmlBlob += `\n/* rakuma query: ${query} */\n${JSON.stringify(result.listings.map((item) => item.raw))}`;
    if (result.responseStatus !== null) meta.statuses.push(result.responseStatus);
    meta.contentTypes.push('application/json');
    meta.finalUrls.push(sourceQueryUrl('rakuma', query, feed.vertical));
    meta.cardsFound += result.listings.length;
    meta.strategiesUsed.push('rakuma_json_api');
    meta.warnings.push(...result.warnings);
    await pauseBetweenQueries(index, queries.length);
  }
  if (candidates.length === 0) meta.suspectedReason = meta.warnings[0] ?? 'Rakuma returned no listings for the current query.';
  return { candidates: dedupeCandidates(candidates), meta };
}

export class PollerService {
  private readonly runningFeedIds = new Set<number>();
  private readonly forcedFeedIds = new Set<number>();
  private readonly activeRuns = new Map<number, Promise<RunFeedResult>>();
  private readonly seenListingIdsByFeed = new Map<number, Set<string>>();
  private readonly freshnessByFeed = new Map<number, FreshnessState>();
  private readonly nextPollAtByFeed = new Map<number, number>();
  private readonly runtimeDiagnosticsByFeed = new Map<number, SourceRuntimeDiagnostics | null>();
  private readonly browser = new BrowserService();
  private liveStateVersion = 0;
  private timer: NodeJS.Timeout | null = null;
  private tickRunning = false;
  private stopped = true;

  constructor(private readonly store: Store, private readonly events: PollerEvents) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.scheduleNextTick(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    void this.browser.shutdown();
  }

  requestImmediateRun(feedId: number): void {
    this.forcedFeedIds.add(feedId);
    void this.tick();
  }

  async runFeedNow(feedId: number): Promise<RunFeedResult> {
    const existingRun = this.activeRuns.get(feedId);
    if (existingRun) return existingRun;
    const feed = this.store.getFeedById(feedId, this.runningFeedIds);
    if (!feed) throw new Error('Search source not found.');
    const runPromise = this.performPersistedRun(feed).finally(() => {
      this.activeRuns.delete(feedId);
    });
    this.activeRuns.set(feedId, runPromise);
    return runPromise;
  }

  async testParse(feedId: number): Promise<ParseReport> {
    const feed = this.store.getFeedById(feedId, this.runningFeedIds);
    if (!feed) throw new Error('Search source not found.');
    const selectedQuery = selectQueryForFeed(feed, this.queryMetricsForSource(feed.source));
    const inspected = await this.inspectFeed(feed, selectedQuery);
    this.runtimeDiagnosticsByFeed.set(feedId, inspected.report.runtimeDiagnostics ?? null);
    return this.enrichReport(inspected.report);
  }

  async openAssistedBrowser(_feedId: number): Promise<RunFeedResult> {
    throw new Error('Local assisted mode is disabled for the active sources.');
  }

  hasAssistedSession(_feedId: number): boolean {
    return false;
  }

  getRunningFeedIds(): Set<number> {
    return new Set(this.runningFeedIds);
  }

  enrichFeed<T extends FeedWithFilter | null>(feed: T): T {
    if (!feed) {
      return feed;
    }

    return {
      ...feed,
      runtimeDiagnostics: this.runtimeDiagnosticsByFeed.get(feed.id) ?? feed.runtimeDiagnostics ?? null
    } as T;
  }

  enrichFeeds(feeds: FeedWithFilter[]): FeedWithFilter[] {
    return feeds.map((feed) => this.enrichFeed(feed));
  }

  enrichReport(report: ParseReport): ParseReport {
    return {
      ...report,
      runtimeDiagnostics: report.runtimeDiagnostics ?? this.runtimeDiagnosticsByFeed.get(report.feedId) ?? null
    };
  }

  resetLiveState(): void {
    this.liveStateVersion += 1;
    this.seenListingIdsByFeed.clear();
    this.freshnessByFeed.clear();
    this.nextPollAtByFeed.clear();
    writeDiagnosticsReport(this.store);
  }

  private queryMetricsForSource(source: FeedSource): QueryMetric[] {
    return this.store.listQueryMetrics(source, 500);
  }

  private recordQueryHealth(input: {
    source: FeedSource;
    queryText: string | null;
    totalFound: number;
    newItemsFound: number;
    recommendationsProduced: number;
    avgRecommendationScore: number;
    noiseRatio: number;
    success: boolean;
    timestamp: string;
  }): void {
    if (!input.queryText) return;
    const existing = this.queryMetricsForSource(input.source).find((entry) => entry.query === input.queryText);
    const totalRuns = (existing?.totalRuns ?? 0) + 1;
    const newMetric: QueryMetric = {
      source: input.source,
      query: input.queryText,
      totalRuns,
      totalFound: (existing?.totalFound ?? 0) + input.totalFound,
      newItemsFound: (existing?.newItemsFound ?? 0) + input.newItemsFound,
      recommendationsProduced: (existing?.recommendationsProduced ?? 0) + input.recommendationsProduced,
      avgRecommendationScore: existing
        ? blend(existing.avgRecommendationScore, input.avgRecommendationScore, 0.35)
        : input.avgRecommendationScore,
      noiseRatio: existing
        ? blend(existing.noiseRatio, input.noiseRatio, 0.35)
        : input.noiseRatio,
      queryQualityScore: 0,
      lastSuccessAt: input.success && input.totalFound > 0 ? input.timestamp : (existing?.lastSuccessAt ?? null),
      cooldownUntil: null,
      updatedAt: input.timestamp
    };
    newMetric.queryQualityScore = queryQualityScore(newMetric);
    const shouldCooldown = newMetric.noiseRatio >= 0.75 || (input.newItemsFound === 0 && totalRuns >= 4);
    newMetric.cooldownUntil = shouldCooldown
      ? new Date(Date.parse(input.timestamp) + 2 * 60 * 60 * 1000).toISOString()
      : null;
    this.store.upsertQueryMetric(newMetric);
  }

  private recordSourceHealth(feed: FeedWithFilter, report: ParseReport, errorMessage: string | null, newItemsFound: number, durationMs: number): void {
    const existing = this.store.listSourceHealth().find((entry) => entry.source === feed.source);
    const antiBotWarnings = report.parseWarnings.filter((warning) => /captcha|cloudflare|blocked|403|429|proxy/i.test(warning.toLowerCase())).length;
    const success = !errorMessage;
    this.store.upsertSourceHealth({
      source: feed.source,
      lastSuccessAt: success ? report.fetchedAt : (existing?.lastSuccessAt ?? null),
      lastFailureAt: success ? (existing?.lastFailureAt ?? null) : report.fetchedAt,
      successRateLast50: blend(existing?.successRateLast50 ?? 0, success ? 100 : 0, 1 / 50),
      avgItemsExtracted: blend(existing?.avgItemsExtracted ?? 0, report.itemsExtracted, 0.25),
      avgNewItemsInserted: blend(existing?.avgNewItemsInserted ?? 0, newItemsFound, 0.25),
      avgRunDuration: blend(existing?.avgRunDuration ?? 0, durationMs, 0.2),
      currentBackoffLevel: Math.max(feed.effectivePollIntervalSec - 30, 0),
      currentParserMode: currentParserMode(report),
      antiBotWarningsLast24h: Math.max(0, Math.round(blend(existing?.antiBotWarningsLast24h ?? 0, antiBotWarnings, 0.4))),
      updatedAt: report.fetchedAt
    });
  }

  private recordSessionHealth(feed: FeedWithFilter, report: ParseReport, errorMessage: string | null): void {
    const existing = this.store.listSessionHealth().find((entry) => entry.source === feed.source);
    const captchaDetected = report.parseWarnings.some((warning) => /captcha|cloudflare|human/i.test(warning.toLowerCase()));
    const is403 = report.responseStatus === 403 || report.responseStatus === 401;
    const failures = errorMessage ? (existing?.consecutiveFailures ?? 0) + 1 : 0;
    this.store.upsertSessionHealth({
      source: feed.source,
      isValid: !is403 && report.runtimeDiagnostics?.blockReason !== 'auth_failed' && report.runtimeDiagnostics?.blockReason !== 'no_session',
      lastSuccessAt: !errorMessage ? report.fetchedAt : (existing?.lastSuccessAt ?? null),
      last403At: is403 ? report.fetchedAt : (existing?.last403At ?? null),
      lastCaptchaAt: captchaDetected ? report.fetchedAt : (existing?.lastCaptchaAt ?? null),
      lastItemsExtracted: report.itemsExtracted,
      consecutiveFailures: failures,
      updatedAt: report.fetchedAt
    });
  }

  private recordProxyHealth(feed: FeedWithFilter, report: ParseReport, errorMessage: string | null, durationMs: number): void {
    const proxyId = report.runtimeDiagnostics?.proxyActive ? 'configured' : 'direct';
    const existing = this.store.listProxyHealth().find((entry) => entry.source === feed.source && entry.proxyId === proxyId);
    const success = !errorMessage;
    const ban = report.responseStatus === 403 || report.responseStatus === 429 ? 1 : 0;
    const captcha = report.parseWarnings.some((warning) => /captcha|cloudflare|blocked/i.test(warning.toLowerCase())) ? 1 : 0;
    this.store.upsertProxyHealth({
      source: feed.source,
      proxyId,
      lastSuccessAt: success ? report.fetchedAt : (existing?.lastSuccessAt ?? null),
      avgLatency: blend(existing?.avgLatency ?? 0, durationMs, 0.2),
      banCount: (existing?.banCount ?? 0) + ban,
      captchaCount: (existing?.captchaCount ?? 0) + captcha,
      extractionSuccessRate: blend(existing?.extractionSuccessRate ?? 0, success ? 100 : 0, 0.2),
      updatedAt: report.fetchedAt
    });
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, Math.max(0, Math.round(delayMs)));
  }

  private effectiveIntervalMs(feed: FeedWithFilter): number {
    return Math.max(feed.effectivePollIntervalSec, getBasePollIntervalSec(feed)) * 1_000;
  }

  private ensureNextPollAt(feed: FeedWithFilter): number {
    const existing = this.nextPollAtByFeed.get(feed.id);
    if (typeof existing === 'number') {
      return existing;
    }
    if (!feed.lastCheckedAt) {
      this.nextPollAtByFeed.set(feed.id, 0);
      return 0;
    }
    const nextPollAt = Date.parse(feed.lastCheckedAt) + jitteredMs(this.effectiveIntervalMs(feed));
    this.nextPollAtByFeed.set(feed.id, nextPollAt);
    return nextPollAt;
  }

  private scheduleFeed(feed: FeedWithFilter | null, lastCheckedAt: string): void {
    if (!feed?.enabled) {
      if (feed) this.nextPollAtByFeed.delete(feed.id);
      return;
    }
    const nextPollAt = Date.parse(lastCheckedAt) + jitteredMs(this.effectiveIntervalMs(feed));
    this.nextPollAtByFeed.set(feed.id, nextPollAt);
  }

  private computeNextTickDelay(): number {
    if (this.forcedFeedIds.size > 0) {
      return 0;
    }

    const feeds = this.store.listFeeds(this.runningFeedIds).filter((feed) => feed.enabled);
    if (feeds.length === 0) {
      return config.pollerTickMs;
    }

    let nextDueAt = Number.POSITIVE_INFINITY;
    for (const feed of feeds) {
      if (this.runningFeedIds.has(feed.id) || this.activeRuns.has(feed.id)) continue;
      nextDueAt = Math.min(nextDueAt, this.ensureNextPollAt(feed));
    }

    if (!Number.isFinite(nextDueAt)) {
      return config.pollerTickMs;
    }

    return Math.max(nextDueAt - Date.now(), 0);
  }

  private rememberSourceIdentities(feedId: number, candidates: ParsedListingCandidate[]): ParsedListingCandidate[] {
    const seen = this.seenListingIdsByFeed.get(feedId) ?? new Set<string>();
    const fresh: ParsedListingCandidate[] = [];
    for (const candidate of candidates) {
      const identity = `${candidate.source}:${candidate.externalId ?? candidate.canonicalUrl}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      fresh.push(candidate);
    }
    if (seen.size > 3000) {
      const trimmed = new Set(Array.from(seen).slice(-3000));
      this.seenListingIdsByFeed.set(feedId, trimmed);
    } else {
      this.seenListingIdsByFeed.set(feedId, seen);
    }
    return fresh;
  }

  private updateFreshness(feedId: number, newCount: number): FreshnessState {
    const existing = this.freshnessByFeed.get(feedId) ?? { startedAt: Date.now(), staleCount: 0, recentNewCounts: [] };
    existing.recentNewCounts.push(newCount);
    if (existing.recentNewCounts.length > 3) existing.recentNewCounts = existing.recentNewCounts.slice(-3);
    existing.staleCount = newCount > 0 ? 0 : existing.staleCount + 1;
    this.freshnessByFeed.set(feedId, existing);
    return existing;
  }

  private async maybeHandleStaleFeed(feed: FeedWithFilter, baseQueries: string[]): Promise<ParsedListingCandidate[]> {
    const freshness = this.freshnessByFeed.get(feed.id);
    if (!freshness || feed.source !== 'mercari_jp') return [];
    const runningLongEnough = Date.now() - freshness.startedAt > 10 * 60 * 1000;
    const lowRecentCounts = freshness.recentNewCounts.length >= 3 && freshness.recentNewCounts.every((count) => count < 5);
    if (!runningLongEnough || freshness.staleCount < 3 || !lowRecentCounts) return [];

    const staleQueries = ['アーカイブ', 'ヴィンテージ', 'レザー ジャケット', 'デザイナー', 'レア', ...baseQueries.slice(0, 5)];
    const extra = await inspectMercariFeed(this.browser, feed, staleQueries.slice(0, 8));
    freshness.staleCount = 0;
    return extra.candidates;
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) return;
    this.tickRunning = true;
    try {
      const feeds = this.store.listFeeds(this.runningFeedIds).filter((feed) => feed.enabled);
      const capacity = Math.max(config.globalFetchConcurrency - this.runningFeedIds.size, 0);
      const now = Date.now();
      const dueFeeds = feeds.filter((feed) => !this.runningFeedIds.has(feed.id) && !this.activeRuns.has(feed.id) && (this.forcedFeedIds.has(feed.id) || this.ensureNextPollAt(feed) <= now));
      await Promise.all(dueFeeds.slice(0, capacity).map((feed) => this.runFeedNow(feed.id)));
    } finally {
      this.tickRunning = false;
      this.scheduleNextTick(this.computeNextTickDelay());
    }
  }

  private async performPersistedRun(feed: FeedWithFilter): Promise<RunFeedResult> {
    this.runningFeedIds.add(feed.id);
    if (queueRuntimeMode === 'standalone') {
      markStandaloneCrawlStart(feed.id);
    }
    this.emitFeedStatus(feed.id, true, feed.lastCheckedAt, feed.lastError, feed.latestRun);

    const startedAt = new Date().toISOString();
    const liveStateVersion = this.liveStateVersion;
    const runId = this.store.createFeedRun(feed.id, startedAt);
    let newListingsFound = 0;
    const newListings: Listing[] = [];
    let skippedByAge = 0;
    let unknownAgeSeen = 0;
    let recommendationCount = 0;
    let recommendationScoreSum = 0;
    let noiseCandidates = 0;
    let errorMessage: string | null = null;
    let latestRun: FeedRun | null = null;
    let report: ParseReport | null = null;
    const selectedQuery = selectQueryForFeed(feed, this.queryMetricsForSource(feed.source));
    const selectedQueryBrand = selectedQuery ? detectBrand(selectedQuery) : null;

    try {
      await new Promise((resolve) => setTimeout(resolve, 500 + Math.floor(Math.random() * 1501)));
      const inspected = await this.inspectFeed(feed, selectedQuery);
      report = inspected.report;
      report.queryText = selectedQuery;
      this.runtimeDiagnosticsByFeed.set(feed.id, report.runtimeDiagnostics ?? null);

      const freshCandidates = this.rememberSourceIdentities(feed.id, inspected.candidates);
      for (const candidate of freshCandidates.slice(0, config.maxListingsPerFeed)) {
        const age = normalizeCandidateAge(candidate);
        candidate.ageMinutesOptional = age.ageMinutes;
        candidate.ageConfidence = age.confidence;
        candidate.unknownAgeOptional = age.ageMinutes === null;
        if (!candidate.postedAt && age.postedAt) {
          candidate.postedAt = age.postedAt;
        }
        if (!candidate.publishedTextOptional && age.rawText) {
          candidate.publishedTextOptional = age.rawText;
        }

        const match = matchListing(candidate, feed.filter);
        const candidateBrand = candidate.brandDetected ?? match.matchedBrand ?? detectBrand(candidate.title);
        const previewRecommendation = scoreCandidateForRecommendation(candidate, match);
        if (previewRecommendation.scoreBreakdown.noisePenalty < 0) {
          noiseCandidates += 1;
        }

        if (age.ageMinutes !== null && age.ageMinutes > freshWindowMinutes()) {
          skippedByAge += 1;
          continue;
        }

        if (age.ageMinutes === null) {
          unknownAgeSeen += 1;
          skippedByAge += 1;
          continue;
        }

        if (selectedQueryBrand && candidateBrand && !brandNamesAligned(selectedQueryBrand, candidateBrand)) {
          noiseCandidates += 1;
          continue;
        }

        if (!candidateMatchesQueryCategory(selectedQuery, candidate)) {
          noiseCandidates += 1;
          continue;
        }

        if (liveStateVersion !== this.liveStateVersion) {
          report.parseWarnings.push('Run results ignored after live-state reset.');
          newListingsFound = 0;
          newListings.length = 0;
          break;
        }

        const result = this.store.upsertListing(feed.id, candidate, match, report.fetchedAt, { queryText: selectedQuery });
        if (!result.listing) {
          continue;
        }
        if ((result.listing.recommendationScore ?? 0) >= RECOMMENDATION_THRESHOLD) {
          recommendationCount += 1;
          recommendationScoreSum += result.listing.recommendationScore ?? 0;
        }
        if (liveStateVersion !== this.liveStateVersion) {
          report.parseWarnings.push('Run results ignored after live-state reset.');
          newListingsFound = 0;
          newListings.length = 0;
          break;
        }

        if (result.isNewListing) {
          newListingsFound += 1;
          newListings.push(result.listing);
          this.events.emitListingUpsert({ listing: result.listing, feed: this.store.getFeedById(feed.id, this.runningFeedIds) });
          await queueRecommendationNotification(result.listing);
        }
        if (result.eventType === 'new_match') {
          this.events.emitNewMatch({ listing: result.listing, feed: this.store.getFeedById(feed.id, this.runningFeedIds) });
        }
      }

      errorMessage = buildRunError(report);
      report.itemsSkippedByAge = skippedByAge;
      report.itemsInserted = newListingsFound;
      report.itemsUnknownAge = unknownAgeSeen;
      this.store.updateFeedRuntime(feed.id, deriveRuntimeState(feed, report, errorMessage));
      if (!errorMessage) {
        const cleaned = this.store.cleanOldListings(feed.source);
        if (cleaned > 0) {
          logger.info('old listings cleaned', { feedId: feed.id, source: feed.source, cleaned });
        }
      }
      if (liveStateVersion !== this.liveStateVersion) {
        newListingsFound = 0;
        newListings.length = 0;
      }
      if (newListings.length > 0) {
        this.events.emitListingsNew({ type: 'listings:new', items: newListings });
      }

      const durationMs = Date.now() - Date.parse(startedAt);
      const avgRecommendationScore = recommendationCount > 0 ? recommendationScoreSum / recommendationCount : 0;
      this.recordQueryHealth({
        source: feed.source,
        queryText: selectedQuery,
        totalFound: report.itemsExtracted,
        newItemsFound: newListingsFound,
        recommendationsProduced: recommendationCount,
        avgRecommendationScore,
        noiseRatio: report.itemsExtracted > 0 ? noiseCandidates / report.itemsExtracted : 0,
        success: !errorMessage,
        timestamp: report.fetchedAt
      });
      this.recordSourceHealth(feed, report, errorMessage, newListingsFound, durationMs);
      this.recordSessionHealth(feed, report, errorMessage);
      this.recordProxyHealth(feed, report, errorMessage, durationMs);
      logger.info('query run summary', {
        feedId: feed.id,
        source: feed.source,
        query: selectedQuery,
        found: report.itemsExtracted,
        skippedOld: skippedByAge,
        insertedNew: newListingsFound
      });

      const payload: FinishFeedRunPayload = {
        finishedAt: new Date().toISOString(),
        durationMs,
        listingsParsed: report.itemsExtracted,
        matchesFound: report.itemsMatched,
        newMatchesFound: newListingsFound,
        error: errorMessage,
        responseStatus: report.responseStatus,
        contentType: report.contentType,
        finalUrl: report.finalUrl,
        htmlLength: report.htmlLength,
        cardsFound: report.cardsFound,
        itemsExtracted: report.itemsExtracted,
        sampleTitles: report.sampleExtractedTitles,
        parseWarnings: report.parseWarnings,
        strategiesUsed: report.strategiesUsed,
        suspectedReason: report.suspectedReason,
        debugHtmlPath: report.debugHtmlPath,
        debugReportPath: report.debugReportPath,
        queryText: selectedQuery,
        itemsSkippedByAge: skippedByAge,
        itemsInserted: newListingsFound,
        itemsUnknownAge: unknownAgeSeen
      };
      this.store.finishFeedRun(runId, payload);
      this.store.updateFeedCheck(feed.id, payload.finishedAt, errorMessage);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unknown source check error.';
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - Date.parse(startedAt);
      this.store.finishFeedRun(runId, {
        finishedAt,
        durationMs,
        listingsParsed: 0,
        matchesFound: 0,
        newMatchesFound: 0,
        error: errorMessage,
        responseStatus: null,
        contentType: null,
        finalUrl: null,
        htmlLength: 0,
        cardsFound: 0,
        itemsExtracted: 0,
        sampleTitles: [],
        parseWarnings: [],
        strategiesUsed: [],
        suspectedReason: errorMessage,
        debugHtmlPath: null,
        debugReportPath: null,
        queryText: selectedQuery,
        itemsSkippedByAge: 0,
        itemsInserted: 0,
        itemsUnknownAge: 0
      });
      this.store.updateFeedRuntime(feed.id, deriveRuntimeState(feed, report, errorMessage));
      this.store.updateFeedCheck(feed.id, finishedAt, errorMessage);
      logger.error('feed poll failed', { feedId: feed.id, source: feed.source, error: errorMessage });
      report = {
        feedId: feed.id,
        source: feed.source,
        sourceUrl: feed.url,
        fetchedAt: finishedAt,
        responseStatus: null,
        contentType: null,
        finalUrl: null,
        htmlLength: 0,
        pageTitle: null,
        selectorsAttempted: [],
        selectorHits: {},
        cardsFound: 0,
        itemsExtracted: 0,
        itemsMatched: 0,
        sampleExtractedTitles: [],
        parseWarnings: [errorMessage],
        strategiesUsed: [],
        suspectedReason: errorMessage,
        debugHtmlPath: null,
        debugReportPath: null,
        runtimeDiagnostics: this.runtimeDiagnosticsByFeed.get(feed.id) ?? null,
        queryText: selectedQuery,
        itemsSkippedByAge: 0,
        itemsInserted: 0,
        itemsUnknownAge: 0
      };
      this.runtimeDiagnosticsByFeed.set(feed.id, report.runtimeDiagnostics ?? null);
      this.recordQueryHealth({
        source: feed.source,
        queryText: selectedQuery,
        totalFound: 0,
        newItemsFound: 0,
        recommendationsProduced: 0,
        avgRecommendationScore: 0,
        noiseRatio: 1,
        success: false,
        timestamp: finishedAt
      });
      this.recordSourceHealth(feed, report, errorMessage, 0, durationMs);
      this.recordSessionHealth(feed, report, errorMessage);
      this.recordProxyHealth(feed, report, errorMessage, durationMs);
    } finally {
      if (queueRuntimeMode === 'standalone') {
        markStandaloneCrawlFinish(feed.id, !errorMessage);
      }
      this.forcedFeedIds.delete(feed.id);
      this.runningFeedIds.delete(feed.id);
      const refreshed = this.store.getFeedById(feed.id, this.runningFeedIds);
      const finishedAt = refreshed?.lastCheckedAt ?? refreshed?.latestRun?.finishedAt ?? new Date().toISOString();
      if (refreshed) {
        this.scheduleFeed(refreshed, finishedAt);
      } else {
        this.nextPollAtByFeed.delete(feed.id);
      }
      latestRun = refreshed?.latestRun ?? null;
      this.emitFeedStatus(feed.id, false, refreshed?.lastCheckedAt ?? new Date().toISOString(), refreshed?.lastError ?? errorMessage, latestRun);
      logger.info('feed poll finished', {
        feedId: feed.id,
        source: feed.source,
        startedAt,
        finishedAt: latestRun?.finishedAt,
        listingsParsed: latestRun?.listingsParsed ?? 0,
        matchesFound: latestRun?.matchesFound ?? 0,
        newMatchesFound: latestRun?.newMatchesFound ?? 0,
        responseStatus: latestRun?.responseStatus ?? null,
        suspectedReason: latestRun?.suspectedReason ?? null,
        error: latestRun?.error ?? errorMessage
      });
      writeDiagnosticsReport(this.store);
    }

    return {
      feed: this.enrichFeed(this.store.getFeedById(feed.id, this.runningFeedIds)),
      latestRun,
      report: this.enrichReport(report as ParseReport)
    };
  }

  private async inspectFeed(feed: FeedWithFilter, queryText?: string | null): Promise<{ report: ParseReport; candidates: ParsedListingCandidate[] }> {
    const inspected = feed.source === 'avito'
      ? await inspectAvitoFeed(this.browser, feed, queryText)
      : feed.source === 'mercari_jp'
        ? await inspectMercariFeed(this.browser, feed, queryText ? [queryText] : undefined)
        : feed.source === 'kufar'
          ? await inspectKufarFeed(feed, queryText)
          : feed.source === 'vinted'
            ? await inspectVintedFeed(feed, queryText)
            : feed.source === 'carousell'
              ? await inspectCarousellFeed(feed, queryText)
              : await inspectRakumaFeed(feed, queryText);

    const candidates = dedupeCandidates(inspected.candidates);
    const matchedCandidates = candidates.filter((candidate) => matchListing(candidate, feed.filter).isMatch);
    const responseStatus = inspected.meta.statuses.find((status) => status >= 400) ?? inspected.meta.statuses[0] ?? 200;
    const finalUrl = inspected.meta.finalUrls[0] ?? feed.url;
    const contentType = inspected.meta.contentTypes[0] ?? 'text/html; charset=utf-8';

    const report: ParseReport = {
      feedId: feed.id,
      source: feed.source,
      sourceUrl: feed.url,
      fetchedAt: new Date().toISOString(),
      responseStatus,
      contentType,
      finalUrl,
      htmlLength: inspected.meta.htmlBlob.length,
      pageTitle: inspected.meta.pageTitles[0] ?? null,
      selectorsAttempted: [...new Set(inspected.meta.selectorsAttempted)],
      selectorHits: inspected.meta.selectorHits,
      cardsFound: inspected.meta.cardsFound,
      itemsExtracted: candidates.length,
      itemsMatched: matchedCandidates.length,
      sampleExtractedTitles: candidates.slice(0, 5).map((listing) => listing.title),
      parseWarnings: inspected.meta.warnings,
      strategiesUsed: [...new Set(inspected.meta.strategiesUsed)],
      suspectedReason: inspected.meta.suspectedReason,
      debugHtmlPath: null,
      debugReportPath: null,
      runtimeDiagnostics: inspected.meta.runtimeDiagnostics,
      queryText: queryText ?? null,
      itemsSkippedByAge: 0,
      itemsInserted: 0,
      itemsUnknownAge: 0
    };

    if (candidates.length === 0 && !report.suspectedReason) {
      report.suspectedReason = 'Source returned no recognizable new cards.';
    }

    const paths = saveDebugArtifacts(feed.id, inspected.meta.htmlBlob || JSON.stringify(candidates.map((item) => item.raw)), report);
    report.debugHtmlPath = paths.htmlPath;
    report.debugReportPath = paths.reportPath;

    logger.info('feed parse report', {
      feedId: feed.id,
      source: feed.source,
      responseStatus: report.responseStatus,
      htmlLength: report.htmlLength,
      cardsFound: report.cardsFound,
      itemsExtracted: report.itemsExtracted,
      itemsMatched: report.itemsMatched,
      strategiesUsed: report.strategiesUsed,
      suspectedReason: report.suspectedReason
    });

    return { report, candidates };
  }

  private emitFeedStatus(feedId: number, isRunning: boolean, lastCheckedAt: string | null, lastError: string | null, latestRun: FeedWithFilter['latestRun']): void {
    const feed = this.enrichFeed(this.store.getFeedById(feedId, this.runningFeedIds));
    this.events.emitFeedStatus({ feedId, isRunning, lastCheckedAt, lastError, latestRun, feed });
  }
}
