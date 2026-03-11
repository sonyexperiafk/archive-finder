import type {
  CookiePoolEntry,
  CustomCatalogTerm,
  DiagnosticsSnapshot,
  FeedRun,
  FeedSource,
  FeedWithFilter,
  Gender,
  Like,
  Listing,
  ListingsScope,
  Opportunity,
  ParseReport,
  Recommendation,
  SearchMode,
  TimeFilter,
  Vertical,
  VerticalConfig
} from '../../shared/src';
import type { SearchCategoryPreset, SearchSourceOption, SearchCategoryKey, SearchPreset } from '../../shared/src';

declare global {
  interface Window {
    archiveFinderRuntime?: {
      apiBase?: string;
      platform?: string;
    };
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? window.archiveFinderRuntime?.apiBase ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface SearchConfigPayload {
  sources: SearchSourceOption[];
  categories: SearchCategoryPreset[];
  presets: SearchPreset[];
  verticals: VerticalConfig[];
  brands: string[];
  customBrands: string[];
  customTags: string[];
}

export interface SessionInfo {
  source: string;
  loggedInAs: string | null;
  capturedAt: string;
  isValid: boolean;
  expiresAt: string | null;
}

export interface SessionCaptureStatus {
  source: string;
  connected: boolean;
  inProgress: boolean;
  loggedInAs: string | null;
  capturedAt: string | null;
}

export interface StartSearchPayload {
  sessionId?: number | null;
  source: FeedSource;
  vertical?: Vertical;
  categoryKey: SearchCategoryKey;
  presetKey?: SearchPreset['key'] | null;
  searchMode: SearchMode;
  exactUrl?: string | null;
  customQuery?: string | null;
  pollIntervalSec?: number;
  minPriceValueOptional?: number | null;
  maxPriceValueOptional?: number | null;
  privateSellersOnly?: boolean;
}

export interface ToggleLikeResult {
  liked: boolean;
  listing: Listing;
}

export interface RuntimeLogPayload {
  path: string;
  text: string;
}

export function getApiBase(): string {
  return API_BASE;
}

export async function fetchSearchConfig(): Promise<SearchConfigPayload> {
  return request('/api/config/search');
}

export async function fetchSearchSessions(): Promise<FeedWithFilter[]> {
  const payload = await request<{ sessions: FeedWithFilter[] }>('/api/search-sessions');
  return payload.sessions;
}

export async function fetchSourceSessions(): Promise<SessionInfo[]> {
  const payload = await request<{ sessions: SessionInfo[] }>('/api/sessions');
  return payload.sessions;
}

export async function captureSourceSession(source: string): Promise<{ ok: boolean; status: string; message: string }> {
  return request(`/api/sessions/${source}/capture`, { method: 'POST' });
}

export async function fetchSourceSessionStatus(source: string): Promise<SessionCaptureStatus> {
  return request(`/api/sessions/${source}/status`);
}

export async function deleteSourceSession(source: string): Promise<void> {
  await request(`/api/sessions/${source}`, { method: 'DELETE' });
}

export async function importSourceCookies(source: string, cookies: string, userAgent?: string): Promise<{ ok: boolean; cookieCount: number }> {
  return request(`/api/sessions/${source}/import-cookies`, {
    method: 'POST',
    body: JSON.stringify({
      cookies,
      userAgent
    })
  });
}

export async function fetchCookiePool(source?: FeedSource): Promise<CookiePoolEntry[]> {
  const params = source ? `?source=${encodeURIComponent(source)}` : '';
  const payload = await request<{ entries: CookiePoolEntry[] }>(`/api/cookie-pool${params}`);
  return payload.entries;
}

export async function addCookiePoolEntry(payload: {
  source: FeedSource;
  cookies: string;
  label?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}): Promise<{ ok: boolean; cookieCount: number; entry: CookiePoolEntry | null }> {
  return request('/api/cookie-pool', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function deleteCookiePoolEntryById(id: number): Promise<{ ok: boolean }> {
  return request(`/api/cookie-pool/${id}`, { method: 'DELETE' });
}

export async function fetchCustomCatalog(): Promise<{ brands: CustomCatalogTerm[]; tags: CustomCatalogTerm[] }> {
  return request('/api/custom-catalog');
}

export async function replaceCustomCatalog(kind: 'brand' | 'tag', text: string): Promise<{ ok: boolean; kind: 'brand' | 'tag'; terms: CustomCatalogTerm[] }> {
  return request(`/api/custom-catalog/${kind}`, {
    method: 'PUT',
    body: JSON.stringify({ text })
  });
}

export async function deleteCustomCatalogEntry(kind: 'brand' | 'tag', id: number): Promise<{ ok: boolean; kind: 'brand' | 'tag' }> {
  return request(`/api/custom-catalog/${kind}/${id}`, { method: 'DELETE' });
}

export async function startSearch(payload: StartSearchPayload): Promise<{ session: FeedWithFilter | null; latestRun: FeedRun | null; report: ParseReport }> {
  return request('/api/search-sessions/start', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function stopSearch(id: number): Promise<{ session: FeedWithFilter | null }> {
  return request(`/api/search-sessions/${id}/stop`, { method: 'POST' });
}

export async function refreshSession(id: number): Promise<{ session: FeedWithFilter | null; latestRun: FeedRun | null; report: ParseReport }> {
  return request(`/api/search-sessions/${id}/refresh`, { method: 'POST' });
}

export async function openAssistedBrowser(id: number): Promise<{ session: FeedWithFilter | null; latestRun: FeedRun | null; report: ParseReport }> {
  return request(`/api/search-sessions/${id}/assisted/open-browser`, { method: 'POST' });
}

export async function fetchSessionRuns(id: number, limit = 20): Promise<{ runs: FeedRun[]; assistedModeReady: boolean }> {
  return request(`/api/search-sessions/${id}/runs?limit=${limit}`);
}

export async function fetchListings(options: {
  feedId?: number | null;
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
} = {}): Promise<Listing[]> {
  const params = new URLSearchParams();
  if (options.feedId) params.set('feedId', String(options.feedId));
  if (options.source) params.set('source', options.source);
  if (options.vertical) params.set('vertical', options.vertical);
  if (options.gender) params.set('gender', options.gender);
  if (options.scope) params.set('scope', options.scope);
  if (options.timeFilter) params.set('timeFilter', options.timeFilter);
  if (typeof options.minPriceUsd === 'number' && Number.isFinite(options.minPriceUsd)) params.set('minPriceUsd', String(options.minPriceUsd));
  if (typeof options.maxPriceUsd === 'number' && Number.isFinite(options.maxPriceUsd)) params.set('maxPriceUsd', String(options.maxPriceUsd));
  if (typeof options.withPhotoOnly === 'boolean') params.set('withPhotoOnly', String(options.withPhotoOnly));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const query = params.toString();
  const payload = await request<{ listings: Listing[] }>(`/api/listings${query ? `?${query}` : ''}`);
  return payload.listings;
}

export async function fetchLastParseReport(id: number): Promise<ParseReport> {
  return request(`/api/debug/feeds/${id}/last-parse-report`);
}

export async function testParse(id: number): Promise<ParseReport> {
  return request(`/api/debug/feeds/${id}/test-parse`, { method: 'POST' });
}

export async function fetchRecommendations(options: {
  limit?: number;
  offset?: number;
  timeFilter?: TimeFilter;
  vertical?: Vertical;
  minPriceUsd?: number;
  maxPriceUsd?: number;
} = {}): Promise<Recommendation[]> {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 120));
  params.set('offset', String(options.offset ?? 0));
  params.set('timeFilter', options.timeFilter ?? 'all');
  if (options.vertical) params.set('vertical', options.vertical);
  if (typeof options.minPriceUsd === 'number' && Number.isFinite(options.minPriceUsd)) params.set('minPriceUsd', String(options.minPriceUsd));
  if (typeof options.maxPriceUsd === 'number' && Number.isFinite(options.maxPriceUsd)) params.set('maxPriceUsd', String(options.maxPriceUsd));
  const payload = await request<Recommendation[] | { recommendations: Recommendation[] }>(`/api/recommendations?${params.toString()}`);
  return Array.isArray(payload) ? payload : payload.recommendations;
}

export async function fetchOpportunities(limit = 40, offset = 0): Promise<Opportunity[]> {
  const payload = await request<{ opportunities: Opportunity[] }>(`/api/opportunities?limit=${limit}&offset=${offset}`);
  return payload.opportunities;
}

export async function fetchLikes(limit = 120, offset = 0): Promise<Like[]> {
  const payload = await request<{ likes: Like[] }>(`/api/likes?limit=${limit}&offset=${offset}`);
  return payload.likes;
}

export async function likeListing(listingId: number): Promise<ToggleLikeResult> {
  return request<ToggleLikeResult>(`/api/likes/${listingId}`, { method: 'POST' });
}

export async function unlikeListing(listingId: number): Promise<Listing> {
  const payload = await request<{ listing: Listing }>(`/api/likes/${listingId}`, { method: 'DELETE' });
  return payload.listing;
}

export async function fetchDiagnosticsHealth(): Promise<{ queue: unknown; diagnostics: DiagnosticsSnapshot }> {
  return request('/api/diagnostics/health');
}

export async function fetchDiagnosticsReport(): Promise<{ path: string; text: string }> {
  return request('/api/diagnostics/report');
}

export async function fetchRuntimeLog(): Promise<RuntimeLogPayload> {
  return request('/api/logs/runtime');
}

export async function resetLiveState(): Promise<{ ok: boolean }> {
  return request('/api/admin/reset-live-state', { method: 'POST' });
}
