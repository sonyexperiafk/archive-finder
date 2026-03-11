import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { Activity, Heart, LayoutGrid, Radio, Settings2, Sparkles } from 'lucide-react';
import {
  RECOMMENDATION_THRESHOLD,
  RESELL_MAX_PRICE_USD,
  RESELL_MIN_PRICE_USD,
  type CookiePoolEntry,
  type CustomCatalogTerm,
  type DiagnosticsSnapshot,
  type FeedRun,
  type FeedSource,
  type FeedStatusPayload,
  type FeedWithFilter,
  type Like,
  type Listing,
  type ListingsNewPayload,
  type Opportunity,
  type ParseReport,
  type Recommendation,
  type TimeFilter
} from '../../shared/src';
import {
  addCookiePoolEntry,
  captureSourceSession,
  deleteCookiePoolEntryById,
  deleteCustomCatalogEntry,
  deleteSourceSession,
  fetchCookiePool,
  fetchCustomCatalog,
  fetchDiagnosticsHealth,
  fetchDiagnosticsReport,
  fetchLastParseReport,
  fetchLikes,
  fetchListings,
  fetchOpportunities,
  fetchRecommendations,
  fetchRuntimeLog,
  fetchSearchSessions,
  fetchSourceSessionStatus,
  fetchSessionRuns,
  fetchSourceSessions,
  getApiBase,
  likeListing,
  resetLiveState,
  refreshSession,
  replaceCustomCatalog,
  type RuntimeLogPayload,
  type SessionInfo
} from './api';
import { ListingCard } from './components/ListingCard';
import {
  SourcePosterIllustration,
  sourceCapability,
  sourceLabel,
  sourceMonogram,
  sourceStory
} from './utils/sourcePresentation';

type ScreenKey = 'feed' | 'recommendations' | 'likes' | 'sources' | 'diagnostics' | 'settings';
type VisibleSource = 'all' | 'avito' | 'mercari_jp' | 'kufar' | 'vinted' | 'carousell' | 'rakuma';
type GenderFilter = 'all' | 'men' | 'women';
type LikesSort = 'recent' | 'priceAsc' | 'priceDesc';
type ActiveSource = FeedSource;
type ConnectableSource = Extract<FeedSource, 'carousell' | 'vinted' | 'mercari_jp'>;

const socket = io(getApiBase() || undefined, {
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionDelay: 3000,
  reconnectionAttempts: 20,
  timeout: 15000,
  autoConnect: true
});

const NAV_ITEMS: Array<{ key: ScreenKey; label: string; icon: (props: { size?: number; strokeWidth?: number }) => ReactNode; bottom?: boolean }> = [
  { key: 'feed', label: 'Live Feed', icon: LayoutGrid },
  { key: 'recommendations', label: 'Recommendations', icon: Sparkles },
  { key: 'likes', label: 'Liked', icon: Heart },
  { key: 'sources', label: 'Sources', icon: Radio, bottom: true },
  { key: 'diagnostics', label: 'Diagnostics', icon: Activity, bottom: true },
  { key: 'settings', label: 'Settings', icon: Settings2, bottom: true }
] as const;

const SOURCE_FILTERS: Array<{ key: VisibleSource; label: string }> = [
  { key: 'all', label: 'All Sources' },
  { key: 'avito', label: 'Avito' },
  { key: 'mercari_jp', label: 'Mercari' },
  { key: 'vinted', label: 'Vinted' },
  { key: 'carousell', label: 'Carousell' },
  { key: 'kufar', label: 'Kufar' },
  { key: 'rakuma', label: 'Rakuma' }
] as const;

const SESSION_SOURCES: Array<ConnectableSource | 'avito'> = ['avito', 'carousell', 'vinted', 'mercari_jp'];
const COOKIE_VAULT_SOURCES: FeedSource[] = ['avito', 'carousell', 'vinted', 'mercari_jp', 'kufar', 'rakuma'];

const TIME_FILTERS: Array<{ key: TimeFilter; label: string }> = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' }
] as const;

const GENDER_FILTERS: Array<{ key: GenderFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'men', label: 'Men' },
  { key: 'women', label: 'Women' }
] as const;

function isVisibleSource(source: FeedSource): source is ActiveSource {
  return source === 'avito' || source === 'mercari_jp' || source === 'kufar' || source === 'vinted' || source === 'carousell' || source === 'rakuma';
}

function parseDateSafe(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listingTimestamp(listing: Listing): number {
  return parseDateSafe(listing.postedAt) || parseDateSafe(listing.publishedTextOptional) || parseDateSafe(listing.firstSeenAt);
}

function passesTimeFilter(listing: Listing, timeFilter: TimeFilter): boolean {
  if (timeFilter === 'all') return true;
  const timestamp = listingTimestamp(listing);
  if (!timestamp) return true;
  const diff = Date.now() - timestamp;
  if (timeFilter === 'today') return diff <= 24 * 60 * 60 * 1000;
  return diff <= 7 * 24 * 60 * 60 * 1000;
}

function matchesGender(listing: Listing, genderFilter: GenderFilter): boolean {
  if (genderFilter === 'all') return true;
  const gender = listing.gender ?? 'unisex';
  return gender === 'unisex' || gender === genderFilter;
}

function matchesListingFilters(
  listing: Listing,
  sourceFilter: VisibleSource,
  timeFilter: TimeFilter,
  genderFilter: GenderFilter,
  maxPriceUsd = RESELL_MAX_PRICE_USD
): boolean {
  return listing.vertical === 'fashion'
    && (listing.priceUsd ?? 0) >= RESELL_MIN_PRICE_USD
    && (listing.priceUsd ?? 0) <= maxPriceUsd
    && matchesGender(listing, genderFilter)
    && (sourceFilter === 'all' || listing.source === sourceFilter)
    && passesTimeFilter(listing, timeFilter);
}

function isConnectableSource(source: FeedSource): source is ConnectableSource {
  return source === 'carousell' || source === 'vinted' || source === 'mercari_jp';
}

function supportsCookieImport(source: FeedSource): boolean {
  return source === 'avito' || source === 'carousell' || source === 'vinted' || source === 'mercari_jp' || source === 'rakuma' || source === 'kufar';
}

function cookieGuide(source: FeedSource): { title: string; chips: string[]; note: string } {
  switch (source) {
    case 'avito':
      return {
        title: 'Bought/static browser cookies',
        chips: ['session', 'buyer_uid', 'uid', 'auth'],
        note: 'Best with multiple bought cookie packs. On block or expiry the engine will fall back to the next healthy pack.'
      };
    case 'carousell':
      return {
        title: 'JWT/auth cookies',
        chips: ['at', 'rt', 'user_id', 'jwt'],
        note: 'Cloudflare-heavy source. Fresh logged-in cookies are required.'
      };
    case 'vinted':
      return {
        title: 'Logged-in Vinted session',
        chips: ['access_token', '_vinted_fr_session', 'user_id'],
        note: 'Unknown or stale guest cookies are not enough for stable protected requests.'
      };
    case 'mercari_jp':
      return {
        title: 'Logged-in Mercari browser session',
        chips: ['mercari_session', 'token', 'access_token'],
        note: 'Prefer Connect Account, but cookie packs can be stored as fallback.'
      };
    case 'rakuma':
      return {
        title: 'Optional Rakuma auth cookies',
        chips: ['_fril_session', 'token'],
        note: 'Public crawl works often, but protected pages benefit from a fresh session.'
      };
    case 'kufar':
      return {
        title: 'Optional Kufar auth cookies',
        chips: ['session', 'jwt', 'auth'],
        note: 'Mostly public, but extra cookies can improve resilience.'
      };
    default:
      return {
        title: 'Marketplace session cookies',
        chips: ['session'],
        note: 'Use raw cookie string or JSON export.'
      };
  }
}

function sourceStatusLabel(status: FeedWithFilter['sourceStatus']): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'backoff':
      return 'Backoff';
    case 'degraded':
      return 'Degraded';
    case 'blocked':
    case 'limited':
      return 'Blocked';
    case 'paused':
      return 'Paused';
    default:
      return status;
  }
}

function sourceIsWorking(session: FeedWithFilter): boolean {
  const latestRun = session.latestRun;
  if (!session.enabled || !latestRun) return false;
  return !latestRun.error && (latestRun.responseStatus === null || latestRun.responseStatus < 400);
}

function sourceStatusSimpleLabel(session: FeedWithFilter): string {
  if (!session.enabled || session.sourceStatus === 'paused') return 'Paused';
  return sourceIsWorking(session) ? 'Working' : 'Issue';
}

function sourceHealthPriority(session: FeedWithFilter): number {
  if (sourceIsWorking(session)) return 3;
  if (session.sourceStatus === 'active') return 2;
  if (session.sourceStatus === 'paused') return 1;
  return 0;
}

function sourceStatusHint(session: FeedWithFilter): string {
  switch (session.sourceStatus) {
    case 'active':
      return 'Source is healthy and polling on schedule.';
    case 'backoff':
      return `Polling slowed to ${session.effectivePollIntervalSec}s after errors.`;
    case 'degraded':
      return session.runtimeDiagnostics?.blockReason === 'proxy_required'
        ? 'Static proxy is required before Avito direct parsing can run safely.'
        : 'Source is degraded and needs operator attention.';
    case 'blocked':
    case 'limited':
      return session.runtimeDiagnostics?.blockReason === 'auth_failed'
        ? 'Source authorization failed. Refresh cookies or reconnect the account.'
        : 'Source returned an access restriction or authorization failure.';
    case 'paused':
      return session.runtimeDiagnostics?.blockReason === 'no_session'
        ? 'Waiting for a saved session or pasted cookies before polling can start.'
        : 'Monitoring is paused.';
    default:
      return 'Source status is updating.';
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-US');
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'No data';
  const diff = Date.now() - parseDateSafe(value);
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function metricValue(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function sortListings(listings: Listing[]): Listing[] {
  return [...listings].sort((left, right) => {
    if (left.isNew !== right.isNew) {
      return Number(right.isNew) - Number(left.isNew);
    }
    return listingTimestamp(right) - listingTimestamp(left);
  });
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function dedupeRecommendations(items: Recommendation[]): Recommendation[] {
  const seen = new Set<number>();
  const output: Recommendation[] = [];
  for (const item of items) {
    if (seen.has(item.listingId)) continue;
    seen.add(item.listingId);
    output.push(item);
  }
  return output;
}

function dedupeOpportunities(items: Opportunity[]): Opportunity[] {
  const seen = new Set<number>();
  const output: Opportunity[] = [];
  for (const item of items) {
    if (seen.has(item.listingId)) continue;
    seen.add(item.listingId);
    output.push(item);
  }
  return output;
}

function dedupeLikes(items: Like[]): Like[] {
  const seen = new Set<number>();
  const output: Like[] = [];
  for (const item of items) {
    if (seen.has(item.listingId)) continue;
    seen.add(item.listingId);
    output.push(item);
  }
  return output;
}

function priceSortValue(listing: Listing): number {
  return listing.priceValueOptional ?? Number.MAX_SAFE_INTEGER;
}

function headerStatus(connection: 'connecting' | 'online' | 'offline', sessions: FeedWithFilter[], busyAction: string | null): { mode: 'active' | 'scanning' | 'idle'; text: string } {
  if (connection === 'offline') return { mode: 'idle', text: 'offline' };
  if (busyAction || sessions.some((session) => session.isRunning)) return { mode: 'scanning', text: 'scanning' };
  if (connection === 'online' && sessions.some((session) => session.enabled)) return { mode: 'active', text: 'active' };
  return { mode: 'idle', text: 'standby' };
}

function Sidebar(props: { current: ScreenKey; onSelect: (screen: ScreenKey) => void }) {
  return (
    <aside className="sidebar">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon as typeof LayoutGrid;
        return (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item ${props.current === item.key ? 'active' : ''} ${item.bottom ? 'sidebar-item--bottom' : ''}`.trim()}
            onClick={() => props.onSelect(item.key)}
            title={item.label}
            aria-label={item.label}
          >
            <Icon size={16} strokeWidth={1.5} />
          </button>
        );
      })}
    </aside>
  );
}

function FilterPanel(props: {
  sourceFilter: VisibleSource;
  setSourceFilter: (value: VisibleSource) => void;
  timeFilter: TimeFilter;
  setTimeFilter: (value: TimeFilter) => void;
  genderFilter: GenderFilter;
  setGenderFilter: (value: GenderFilter) => void;
  maxPriceUsd: number;
  setMaxPriceUsd: (value: number) => void;
  tooExpensiveCount: number;
}) {
  return (
    <div className="filters-panel">
      <div className="filter-row">
        <span className="filter-row__label">Sources</span>
        <div className="filter-row__pills">
          {SOURCE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${props.sourceFilter === filter.key ? 'filter-pill--active' : ''}`.trim()}
              onClick={() => props.setSourceFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-row__label">Time</span>
        <div className="filter-row__pills">
          {TIME_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${props.timeFilter === filter.key ? 'filter-pill--active' : ''}`.trim()}
              onClick={() => props.setTimeFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-row__label">Gender</span>
        <div className="filter-row__pills">
          {GENDER_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`gender-pill gender-pill--${filter.key} ${props.genderFilter === filter.key ? 'gender-pill--active' : ''}`.trim()}
              onClick={() => props.setGenderFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-row__label">Max Price</span>
        <div className="price-slider-group">
          <div className="price-slider-head">
            <strong>{`$${props.maxPriceUsd}`}</strong>
            <button
              type="button"
              className="price-slider-reset"
              onClick={() => props.setMaxPriceUsd(RESELL_MAX_PRICE_USD)}
            >
              Reset
            </button>
          </div>
          <input
            className="price-slider"
            type="range"
            min={RESELL_MIN_PRICE_USD}
            max={RESELL_MAX_PRICE_USD}
            step={10}
            value={props.maxPriceUsd}
            onChange={(event) => props.setMaxPriceUsd(Number(event.target.value))}
          />
          <div className="price-slider-scale">
            <span>{`$${RESELL_MIN_PRICE_USD}`}</span>
            <span>{`$${RESELL_MAX_PRICE_USD}`}</span>
          </div>
        </div>
      </div>

      <div className="filter-note">
        {`Resale window: $${RESELL_MIN_PRICE_USD} to $${RESELL_MAX_PRICE_USD}`}
        {props.tooExpensiveCount > 0 ? (
          <span className="filter-note__muted">{` · hidden above slider: ${props.tooExpensiveCount}`}</span>
        ) : null}
      </div>
    </div>
  );
}

function FirstLaunchPanel(props: {
  connectedSources: number;
  cookiePacks: number;
  customBrands: number;
  onOpenSources: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
}) {
  return (
    <section className="onboarding-shell">
      <div className="onboarding-lead">
        <div className="onboarding-brand-mark">
          <span>AF</span>
        </div>
        <div>
          <span className="hero-eyebrow">First launch</span>
          <h2>Set up sources once, then let the engine run.</h2>
          <p>
            Archive Finder is tuned for fresh designer resale discovery. Start by pasting cookie packs,
            connect protected sources, then load your own brands and tags so query rotation follows your market.
          </p>
        </div>
      </div>

      <div className="onboarding-stats">
        <div className="onboarding-stat">
          <span>Connected</span>
          <strong>{metricValue(props.connectedSources)}</strong>
        </div>
        <div className="onboarding-stat">
          <span>Cookie packs</span>
          <strong>{metricValue(props.cookiePacks)}</strong>
        </div>
        <div className="onboarding-stat">
          <span>Tracked brands</span>
          <strong>{metricValue(props.customBrands)}</strong>
        </div>
      </div>

      <div className="onboarding-grid">
        <article className="onboarding-step">
          <span className="onboarding-step__index">01</span>
          <h3>Open Cookie Vault</h3>
          <p>Add one or more cookie packs for Avito, Vinted, Carousell or Mercari. The engine will rotate to the healthiest pack automatically.</p>
          <button type="button" className="primary-btn" onClick={props.onOpenSources}>Open Sources</button>
        </article>

        <article className="onboarding-step">
          <span className="onboarding-step__index">02</span>
          <h3>Load your brands</h3>
          <p>Paste your own brand and tag lists. Query rotation, matching and recommendations will immediately start using them.</p>
          <button type="button" className="ghost-btn" onClick={props.onOpenSettings}>Open Settings</button>
        </article>

        <article className="onboarding-step">
          <span className="onboarding-step__index">03</span>
          <h3>Watch runtime logs</h3>
          <p>Every parser error, session issue and source-health snapshot is stored in one place so debugging stays operator-friendly.</p>
          <button type="button" className="ghost-btn" onClick={props.onOpenDiagnostics}>Open Diagnostics</button>
        </article>
      </div>

      <div className="onboarding-market-grid">
        {COOKIE_VAULT_SOURCES.map((source) => (
          <article key={source} className="onboarding-market-card">
            <span className={`source-logo source-logo--${source}`}>{sourceMonogram(source)}</span>
            <div>
              <strong>{sourceLabel(source)}</strong>
              <p>{cookieGuide(source).title}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsageGuidePanel(props: {
  connectedSources: number;
  cookiePacks: number;
  customBrands: number;
  onOpenSources: () => void;
  onOpenSettings: () => void;
  onResetLiveState: () => void;
}) {
  const guestReady = COOKIE_VAULT_SOURCES.filter((source) => sourceCapability(source).tone === 'guest');
  const protectedSources = COOKIE_VAULT_SOURCES.filter((source) => sourceCapability(source).tone !== 'guest');

  return (
    <section className="usage-guide">
      <div className="usage-guide__lead">
        <div>
          <span className="hero-eyebrow">How to use Archive Finder</span>
          <h2>Run it like an operator desk, not a noisy crawler.</h2>
          <p>
            Keep the setup simple: connect protected sources only where needed, keep cookie packs fresh, load your own
            brands, then reset live state before a clean manual test. The engine is already tuned to keep only fresh items.
          </p>
        </div>
        <div className="usage-guide__metrics">
          <div className="usage-guide__metric">
            <span>Connected accounts</span>
            <strong>{metricValue(props.connectedSources)}</strong>
          </div>
          <div className="usage-guide__metric">
            <span>Cookie packs</span>
            <strong>{metricValue(props.cookiePacks)}</strong>
          </div>
          <div className="usage-guide__metric">
            <span>Tracked brands</span>
            <strong>{metricValue(props.customBrands)}</strong>
          </div>
        </div>
      </div>

      <div className="usage-guide__grid">
        <article className="usage-guide__card usage-guide__card--steps">
          <div className="card-section-title">Operator flow</div>
          <ol className="usage-guide__steps">
            <li>Open Sources and connect only protected marketplaces.</li>
            <li>Paste multiple cookie packs for fallback rotation where a source needs them.</li>
            <li>Open Settings and paste your own brands and tags.</li>
            <li>Run Reset Live State before a clean fresh-only test.</li>
            <li>Refresh a source and watch Live Feed for only-new inserts.</li>
          </ol>
          <div className="usage-guide__actions">
            <button type="button" className="primary-btn" onClick={props.onOpenSources}>Open Sources</button>
            <button type="button" className="ghost-btn" onClick={props.onOpenSettings}>Open Settings</button>
            <button type="button" className="ghost-btn" onClick={props.onResetLiveState}>Reset Feed</button>
          </div>
        </article>

        <article className="usage-guide__card">
          <div className="card-section-title">Works without cookies</div>
          <div className="usage-guide__source-list">
            {guestReady.map((source) => (
              <div key={`guest-${source}`} className="usage-guide__source-item">
                <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                <div>
                  <strong>{sourceLabel(source)}</strong>
                  <p>{sourceCapability(source).note}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="usage-guide__card">
          <div className="card-section-title">Needs your setup</div>
          <div className="usage-guide__source-list">
            {protectedSources.map((source) => (
              <div key={`protected-${source}`} className="usage-guide__source-item">
                <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                <div>
                  <strong>{sourceLabel(source)}</strong>
                  <p>{sourceCapability(source).note}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="usage-guide__card">
          <div className="card-section-title">When the feed looks empty</div>
          <ul className="usage-guide__checks">
            <li>There may be no listings younger than 60 minutes for your current query mix.</li>
            <li>The source can be blocked even if the parser itself is healthy.</li>
            <li>Filters can hide results by source, gender, time or price.</li>
            <li>Diagnostics and the smoke report show whether the issue is code, cookies or anti-bot.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

function QuickStartModal(props: {
  open: boolean;
  connectedSources: number;
  cookiePacks: number;
  customBrands: number;
  onClose: (remember?: boolean) => void;
  onOpenSources: () => void;
  onOpenSettings: () => void;
  onResetLiveState: () => void;
}) {
  if (!props.open) {
    return null;
  }

  const guestReady = COOKIE_VAULT_SOURCES.filter((source) => sourceCapability(source).tone === 'guest');
  const protectedSources = COOKIE_VAULT_SOURCES.filter((source) => sourceCapability(source).tone !== 'guest');

  return (
    <div className="quick-start-modal">
      <div className="quick-start-modal__backdrop" onClick={() => props.onClose(true)} />
      <section className="quick-start-modal__panel">
        <div className="quick-start-modal__hero">
          <div>
            <span className="hero-eyebrow">Quick start</span>
            <h2>Set up the desk once, then let the feed stay clean.</h2>
            <p>
              Archive Finder is built for fresh resale discovery. Protected sources go through account sessions and cookie vaults,
              public sources can start immediately, and everything routes through the only-new pipeline.
            </p>
          </div>
          <div className="quick-start-modal__stats">
            <div className="quick-start-modal__stat">
              <span>Connected</span>
              <strong>{metricValue(props.connectedSources)}</strong>
            </div>
            <div className="quick-start-modal__stat">
              <span>Cookie packs</span>
              <strong>{metricValue(props.cookiePacks)}</strong>
            </div>
            <div className="quick-start-modal__stat">
              <span>Tracked brands</span>
              <strong>{metricValue(props.customBrands)}</strong>
            </div>
          </div>
        </div>

        <div className="quick-start-modal__grid">
          <article className="quick-start-modal__card">
            <div className="card-section-title">Operator checklist</div>
            <ol className="usage-guide__steps">
              <li>Open Sources and connect only protected marketplaces.</li>
              <li>Paste extra cookie packs for fallback rotation.</li>
              <li>Open Settings and paste your brands and archive tags.</li>
              <li>Run Reset Live State before a clean manual crawl test.</li>
              <li>Refresh a healthy source and watch Live Feed for only-new inserts.</li>
            </ol>
          </article>

          <article className="quick-start-modal__card">
            <div className="card-section-title">Guest-ready now</div>
            <div className="usage-guide__source-list">
              {guestReady.map((source) => (
                <div key={`quick-guest-${source}`} className="usage-guide__source-item">
                  <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                  <div>
                    <strong>{sourceLabel(source)}</strong>
                    <p>{sourceCapability(source).note}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="quick-start-modal__card">
            <div className="card-section-title">Needs setup</div>
            <div className="usage-guide__source-list">
              {protectedSources.map((source) => (
                <div key={`quick-protected-${source}`} className="usage-guide__source-item">
                  <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                  <div>
                    <strong>{sourceLabel(source)}</strong>
                    <p>{sourceCapability(source).note}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="quick-start-modal__actions">
          <button type="button" className="primary-btn" onClick={props.onOpenSources}>Open Sources</button>
          <button type="button" className="ghost-btn" onClick={props.onOpenSettings}>Open Settings</button>
          <button type="button" className="ghost-btn" onClick={props.onResetLiveState}>Reset Feed</button>
          <button type="button" className="ghost-btn" onClick={() => props.onClose(true)}>Got it</button>
        </div>
      </section>
    </div>
  );
}

function SourcePosterCard(props: {
  session: FeedWithFilter;
  mode: 'feed' | 'sources';
  onRefresh?: () => void;
  onInspect?: () => void;
}) {
  const { session } = props;
  const story = sourceStory(session.source);
  const isHealthy = sourceIsWorking(session);

  return (
    <article
      className={`source-showcase-card source-showcase-card--${session.source} ${isHealthy ? 'source-showcase-card--working' : 'source-showcase-card--issue'}`.trim()}
    >
      <div className="source-showcase-card__media">
        <SourcePosterIllustration source={session.source} />
      </div>

      <div className="source-showcase-card__content">
        <div className="source-showcase-card__topline">
          <span className="source-showcase-card__eyebrow">{story.eyebrow}</span>
          <span className={`source-health-pill ${isHealthy ? 'source-health-pill--working' : 'source-health-pill--issue'}`.trim()}>
            <span className="source-health-pill__content">
              <strong>{sourceStatusSimpleLabel(session)}</strong>
              <small>{formatRelativeTime(session.lastCheckedAt)}</small>
            </span>
            <span className="source-health-pill__dot" />
          </span>
        </div>

        <div className="source-showcase-card__title-row">
          <div className="source-showcase-card__identity">
            <strong>{sourceLabel(session.source)}</strong>
            <p>{story.headline}</p>
          </div>
        </div>

        <p className="source-showcase-card__description">{story.detail}</p>
        <p className="source-showcase-card__hint">{sourceStatusHint(session)}</p>

        <div className="source-showcase-card__stats">
          <div className="source-showcase-card__stat">
            <span>{story.statLabel}</span>
            <strong>{story.statValue}</strong>
          </div>
          <div className="source-showcase-card__stat">
            <span>Parsed / new</span>
            <strong>{`${session.latestRun?.itemsExtracted ?? 0} / ${session.latestRun?.newMatchesFound ?? 0}`}</strong>
          </div>
          <div className="source-showcase-card__stat">
            <span>Interval</span>
            <strong>{`${session.effectivePollIntervalSec}s`}</strong>
          </div>
        </div>

        <div className="source-showcase-card__badges">
          <span className={`capability-badge capability-badge--${sourceCapability(session.source).tone}`.trim()}>
            {sourceCapability(session.source).label}
          </span>
          <span className={`status-chip status-chip--${sourceStatusLabel(session.sourceStatus).toLowerCase()}`.trim()}>
            {sourceStatusLabel(session.sourceStatus)}
          </span>
        </div>

        {props.mode === 'sources' ? (
          <div className="source-showcase-card__actions">
            <button type="button" className="ghost-btn" onClick={props.onInspect}>Diagnostics</button>
            <button type="button" className="primary-btn" onClick={props.onRefresh}>Refresh</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function App() {
  const [screen, setScreen] = useState<ScreenKey>('feed');
  const [sourceFilter, setSourceFilter] = useState<VisibleSource>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [maxPriceUsd, setMaxPriceUsd] = useState(RESELL_MAX_PRICE_USD);
  const [likesSort, setLikesSort] = useState<LikesSort>('recent');
  const [sessions, setSessions] = useState<FeedWithFilter[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [likes, setLikes] = useState<Like[]>([]);
  const [runs, setRuns] = useState<FeedRun[]>([]);
  const [parseReport, setParseReport] = useState<ParseReport | null>(null);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [diagnosticsReport, setDiagnosticsReport] = useState<{ path: string; text: string } | null>(null);
  const [runtimeLog, setRuntimeLog] = useState<RuntimeLogPayload | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [sourceSessions, setSourceSessions] = useState<SessionInfo[]>([]);
  const [cookiePoolEntries, setCookiePoolEntries] = useState<CookiePoolEntry[]>([]);
  const [customBrands, setCustomBrands] = useState<CustomCatalogTerm[]>([]);
  const [customTags, setCustomTags] = useState<CustomCatalogTerm[]>([]);
  const [connectingSource, setConnectingSource] = useState<ConnectableSource | null>(null);
  const [cookieImportSource, setCookieImportSource] = useState<FeedSource>('avito');
  const [cookieInputText, setCookieInputText] = useState('');
  const [cookiePoolLabel, setCookiePoolLabel] = useState('');
  const [cookiePoolNotes, setCookiePoolNotes] = useState('');
  const [cookieImportStatus, setCookieImportStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [cookieImportMessage, setCookieImportMessage] = useState('');
  const [brandVaultText, setBrandVaultText] = useState('');
  const [tagVaultText, setTagVaultText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [newItemsCount, setNewItemsCount] = useState(0);
  const [freshAnimations, setFreshAnimations] = useState<Record<number, number>>({});
  const [scrollProgress, setScrollProgress] = useState(0);
  const [quickStartOpen, setQuickStartOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('archive-finder-quick-start-seen') !== '1';
  });
  const mainRef = useRef<HTMLElement | null>(null);
  const isScrolledDownRef = useRef(false);
  const sourceFilterRef = useRef<VisibleSource>('all');
  const timeFilterRef = useRef<TimeFilter>('all');
  const genderFilterRef = useRef<GenderFilter>('all');
  const maxPriceUsdRef = useRef(RESELL_MAX_PRICE_USD);
  const sourceConnectionCleanupRef = useRef<(() => void) | null>(null);

  const visibleSessions = useMemo(() => sessions.filter((session) => isVisibleSource(session.source)), [sessions]);
  const sourceHealthSummary = useMemo(() => {
    const bestBySource = new Map<FeedSource, FeedWithFilter>();

    for (const session of visibleSessions) {
      const existing = bestBySource.get(session.source);
      if (!existing) {
        bestBySource.set(session.source, session);
        continue;
      }

      const existingPriority = sourceHealthPriority(existing);
      const nextPriority = sourceHealthPriority(session);
      const existingCheckedAt = parseDateSafe(existing.lastCheckedAt);
      const nextCheckedAt = parseDateSafe(session.lastCheckedAt);

      if (nextPriority > existingPriority || (nextPriority === existingPriority && nextCheckedAt > existingCheckedAt)) {
        bestBySource.set(session.source, session);
      }
    }

    return SOURCE_FILTERS
      .filter((entry) => entry.key !== 'all')
      .map((entry) => bestBySource.get(entry.key as FeedSource))
      .filter((entry): entry is FeedWithFilter => Boolean(entry));
  }, [visibleSessions]);
  const currentSession = useMemo(() => {
    return visibleSessions.find((session) => session.id === selectedSessionId)
      ?? visibleSessions[0]
      ?? null;
  }, [selectedSessionId, visibleSessions]);
  const currentSourceHealth = useMemo(() => {
    if (!currentSession) return null;
    return diagnosticsSnapshot?.sources.find((entry) => entry.source === currentSession.source) ?? null;
  }, [currentSession, diagnosticsSnapshot]);
  const currentSessionHealth = useMemo(() => {
    if (!currentSession) return null;
    return diagnosticsSnapshot?.sessions.find((entry) => entry.source === currentSession.source) ?? null;
  }, [currentSession, diagnosticsSnapshot]);
  const cookiePoolBySource = useMemo(() => {
    const grouped = new Map<FeedSource, CookiePoolEntry[]>();
    for (const entry of cookiePoolEntries) {
      const current = grouped.get(entry.source) ?? [];
      current.push(entry);
      grouped.set(entry.source, current);
    }
    return grouped;
  }, [cookiePoolEntries]);

  useEffect(() => {
    sourceFilterRef.current = sourceFilter;
    timeFilterRef.current = timeFilter;
    genderFilterRef.current = genderFilter;
    maxPriceUsdRef.current = maxPriceUsd;
  }, [genderFilter, maxPriceUsd, sourceFilter, timeFilter]);

  useEffect(() => {
    return () => {
      sourceConnectionCleanupRef.current?.();
      sourceConnectionCleanupRef.current = null;
    };
  }, []);

  const loadSourceSessions = useCallback(async () => {
    const nextSourceSessions = await fetchSourceSessions();
    setSourceSessions(nextSourceSessions);
  }, []);

  const loadOperatorVaults = useCallback(async () => {
    const [nextCookiePool, nextCatalog, nextRuntimeLog] = await Promise.all([
      fetchCookiePool(),
      fetchCustomCatalog(),
      fetchRuntimeLog()
    ]);
    setCookiePoolEntries(nextCookiePool);
    setCustomBrands(nextCatalog.brands);
    setCustomTags(nextCatalog.tags);
    setRuntimeLog(nextRuntimeLog);
    setBrandVaultText(nextCatalog.brands.map((entry) => entry.term).join('\n'));
    setTagVaultText(nextCatalog.tags.map((entry) => entry.term).join('\n'));
  }, []);

  const loadSessionDetails = useCallback(async (sessionId: number | null) => {
    if (!sessionId) {
      setRuns([]);
      setParseReport(null);
      return;
    }

    const [{ runs: nextRuns }, nextReport] = await Promise.all([
      fetchSessionRuns(sessionId, 20),
      fetchLastParseReport(sessionId).catch(() => null)
    ]);
    setRuns(nextRuns);
    setParseReport(nextReport);
  }, []);

  const loadDiagnostics = useCallback(async () => {
    const [health, report, log] = await Promise.all([
      fetchDiagnosticsHealth(),
      fetchDiagnosticsReport(),
      fetchRuntimeLog()
    ]);
    setDiagnosticsSnapshot(health.diagnostics);
    setDiagnosticsReport(report);
    setRuntimeLog(log);
  }, []);

  const loadCollections = useCallback(async () => {
    const listingOptions = {
      limit: 100,
      vertical: 'fashion' as const,
      minPriceUsd: RESELL_MIN_PRICE_USD,
      maxPriceUsd: RESELL_MAX_PRICE_USD,
      ...(sourceFilter !== 'all' ? { source: sourceFilter } : {}),
      ...(timeFilter !== 'all' ? { timeFilter } : {}),
      ...(genderFilter !== 'all' ? { gender: genderFilter as 'men' | 'women' } : {})
    };

    const [nextListings, nextRecommendations, nextOpportunities, nextLikes] = await Promise.all([
      fetchListings(listingOptions),
      fetchRecommendations({
        limit: 160,
        offset: 0,
        timeFilter,
        vertical: 'fashion',
        minPriceUsd: RESELL_MIN_PRICE_USD,
        maxPriceUsd: RESELL_MAX_PRICE_USD
      }),
      fetchOpportunities(30, 0),
      fetchLikes(160)
    ]);

    setListings(sortListings(nextListings.filter((listing) => isVisibleSource(listing.source) && matchesListingFilters(listing, sourceFilter, timeFilter, genderFilter, RESELL_MAX_PRICE_USD))).slice(0, 100));
    setRecommendations(dedupeRecommendations(nextRecommendations.filter((entry) => isVisibleSource(entry.listing.source))));
    setOpportunities(dedupeOpportunities(nextOpportunities.filter((entry) => isVisibleSource(entry.listing.source))));
    setLikes(dedupeLikes(nextLikes.filter((entry) => isVisibleSource(entry.listing.source))));
  }, [genderFilter, sourceFilter, timeFilter]);

  const loadData = useCallback(async (nextSessionId?: number | null) => {
    const nextSessions = (await fetchSearchSessions()).filter((session) => isVisibleSource(session.source));
    setSessions(nextSessions);

    const fallbackSession = nextSessions.find((session) => session.id === nextSessionId)
      ?? nextSessions[0]
      ?? null;

    setSelectedSessionId(fallbackSession?.id ?? null);
    await loadSessionDetails(fallbackSession?.id ?? null);
    await Promise.all([
      loadCollections(),
      loadDiagnostics().catch(() => undefined)
    ]);
  }, [loadCollections, loadDiagnostics, loadSessionDetails]);

  useEffect(() => {
    const load = async () => {
      try {
        await loadSourceSessions();
      } catch {
        // Ignore background polling errors for account sessions.
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadSourceSessions]);

  useEffect(() => {
    void loadOperatorVaults().catch(() => undefined);
  }, [loadOperatorVaults]);

  useEffect(() => {
    void loadDiagnostics().catch(() => undefined);
    const interval = window.setInterval(() => {
      void loadDiagnostics().catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [loadDiagnostics]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load Archive Finder.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    void loadCollections().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to refresh collections.');
    });
  }, [genderFilter, loadCollections, loading, sourceFilter, timeFilter]);

  useEffect(() => {
    if (!message && !error) return undefined;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    const target = mainRef.current;
    if (!target) return undefined;

    const handleScroll = () => {
      const scrolled = target.scrollTop > 300;
      isScrolledDownRef.current = scrolled;
      const maxScroll = Math.max(target.scrollHeight - target.clientHeight, 1);
      setScrollProgress(Math.min((target.scrollTop / maxScroll) * 100, 100));
      if (!scrolled) {
        setNewItemsCount(0);
      }
    };

    handleScroll();
    target.addEventListener('scroll', handleScroll, { passive: true });
    return () => target.removeEventListener('scroll', handleScroll);
  }, [loading]);

  useEffect(() => {
    const filterListing = (listing: Listing) => matchesListingFilters(
      listing,
      sourceFilterRef.current,
      timeFilterRef.current,
      genderFilterRef.current,
      RESELL_MAX_PRICE_USD
    );

    const handleConnect = () => setConnection('online');
    const handleDisconnect = () => setConnection('offline');
    const handleConnectError = () => setConnection('offline');
    const handleBootstrap = (payload: { sessions: FeedWithFilter[]; listings: Listing[] }) => {
      setConnection('online');
      setSessions(payload.sessions.filter((session) => isVisibleSource(session.source)));
      setListings(sortListings(payload.listings.filter((listing) => isVisibleSource(listing.source) && filterListing(listing))).slice(0, 100));
    };
    const handleFeedStatus = (payload: FeedStatusPayload) => {
      setSessions((current) => {
        if (payload.feed && isVisibleSource(payload.feed.source)) {
          return current.some((session) => session.id === payload.feedId)
            ? current.map((session) => session.id === payload.feedId ? payload.feed as FeedWithFilter : session)
            : [payload.feed as FeedWithFilter, ...current];
        }
        return current;
      });
    };
    const handleListingsNew = (payload: ListingsNewPayload) => {
      const incoming = payload.items
        .filter((item) => isVisibleSource(item.source))
        .filter((item) => filterListing(item));
      if (incoming.length === 0) return;

      setListings((current) => dedupeById(sortListings([...incoming, ...current])).slice(0, 100));

      const animationMap = Object.fromEntries(incoming.map((item, index) => [item.id, index * 50]));
      setFreshAnimations((current) => ({ ...current, ...animationMap }));
      window.setTimeout(() => {
        setFreshAnimations((current) => {
          const next = { ...current };
          for (const item of incoming) delete next[item.id];
          return next;
        });
      }, 1800);

      if (isScrolledDownRef.current) {
        setNewItemsCount((current) => current + incoming.length);
      }

      const recommended = incoming.filter((item) => (item.recommendationScore ?? 0) >= RECOMMENDATION_THRESHOLD);
      if (recommended.length > 0) {
        setRecommendations((current) => dedupeRecommendations([
          ...recommended.map((listing) => ({
            listingId: listing.id,
            score: listing.recommendationScore ?? listing.scoreBreakdown?.total ?? 0,
            reasons: listing.scoreBreakdown?.reasons ?? listing.recommendationReasons ?? [],
            createdAt: listing.firstSeenAt,
            updatedAt: listing.lastSeenAt,
            listing
          })),
          ...current
        ]));
        setOpportunities((current) => {
          const next = recommended
            .filter((listing) => (listing.recommendationScore ?? 0) >= RECOMMENDATION_THRESHOLD + 8)
            .map((listing) => ({
              listingId: listing.id,
              score: listing.recommendationScore ?? listing.scoreBreakdown?.total ?? 0,
              reasons: listing.scoreBreakdown?.reasons ?? listing.recommendationReasons ?? [],
              createdAt: listing.firstSeenAt,
              listing
            }));
          return dedupeOpportunities([...next, ...current]).slice(0, 30);
        });
      }
    };
    const handleListingLiked = (payload: { listing: Listing }) => {
      if (!isVisibleSource(payload.listing.source)) return;
      const createdAt = new Date().toISOString();
      setLikes((current) => dedupeLikes([{ listingId: payload.listing.id, createdAt, listing: payload.listing }, ...current]));
      setListings((current) => current.map((listing) => listing.id === payload.listing.id ? { ...listing, likedAt: createdAt } : listing));
      setRecommendations((current) => current.map((entry) => entry.listingId === payload.listing.id ? { ...entry, listing: { ...entry.listing, likedAt: createdAt } } : entry));
    };
    const handleListingUnliked = (payload: { listingId: number }) => {
      setLikes((current) => current.filter((entry) => entry.listingId !== payload.listingId));
      setListings((current) => current.map((listing) => listing.id === payload.listingId ? { ...listing, likedAt: null } : listing));
      setRecommendations((current) => current.map((entry) => entry.listingId === payload.listingId ? { ...entry, listing: { ...entry.listing, likedAt: null } } : entry));
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('feed:bootstrap', handleBootstrap);
    socket.on('feed:status', handleFeedStatus);
    socket.on('listings:new', handleListingsNew);
    socket.on('listing:liked', handleListingLiked);
    socket.on('listing:unliked', handleListingUnliked);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('feed:bootstrap', handleBootstrap);
      socket.off('feed:status', handleFeedStatus);
      socket.off('listings:new', handleListingsNew);
      socket.off('listing:liked', handleListingLiked);
      socket.off('listing:unliked', handleListingUnliked);
    };
  }, []);

  const visibleListings = useMemo(() => {
    return listings.filter((listing) => matchesListingFilters(listing, sourceFilter, timeFilter, genderFilter, maxPriceUsd));
  }, [genderFilter, listings, maxPriceUsd, sourceFilter, timeFilter]);

  const visibleRecommendations = useMemo(() => {
    return dedupeRecommendations(recommendations).filter((entry) => matchesListingFilters(entry.listing, sourceFilter, timeFilter, genderFilter, maxPriceUsd));
  }, [genderFilter, maxPriceUsd, recommendations, sourceFilter, timeFilter]);

  const visibleOpportunities = useMemo(() => {
    return dedupeOpportunities(opportunities).filter((entry) => matchesListingFilters(entry.listing, sourceFilter, timeFilter, genderFilter, maxPriceUsd));
  }, [genderFilter, maxPriceUsd, opportunities, sourceFilter, timeFilter]);

  const likedListings = useMemo(() => {
    const items = likes
      .map((entry) => ({ ...entry.listing, likedAt: entry.createdAt }))
      .filter((listing) => matchesListingFilters(listing, sourceFilter, timeFilter, genderFilter, maxPriceUsd));

    if (likesSort === 'priceAsc') return [...items].sort((left, right) => priceSortValue(left) - priceSortValue(right));
    if (likesSort === 'priceDesc') return [...items].sort((left, right) => priceSortValue(right) - priceSortValue(left));
    return [...items].sort((left, right) => parseDateSafe(right.likedAt) - parseDateSafe(left.likedAt));
  }, [genderFilter, likes, likesSort, maxPriceUsd, sourceFilter, timeFilter]);

  const tooExpensiveCount = useMemo(() => {
    return listings.filter((listing) =>
      matchesGender(listing, genderFilter)
      && (sourceFilter === 'all' || listing.source === sourceFilter)
      && passesTimeFilter(listing, timeFilter)
      && (listing.priceUsd ?? 0) > maxPriceUsd
    ).length;
  }, [genderFilter, listings, maxPriceUsd, sourceFilter, timeFilter]);

  const latestSync = useMemo(() => visibleSessions.map((session) => session.lastCheckedAt).filter(Boolean).sort((left, right) => parseDateSafe(right) - parseDateSafe(left))[0] ?? null, [visibleSessions]);
  const activeSourceCount = useMemo(() => visibleSessions.filter((session) => session.enabled).length, [visibleSessions]);
  const newCount = useMemo(() => visibleListings.filter((listing) => listing.isNew).length, [visibleListings]);
  const recommendationCount = useMemo(() => visibleRecommendations.length, [visibleRecommendations]);
  const isFirstLaunch = useMemo(() => {
    const hasConnectedSources = sourceSessions.some((session) => session.isValid);
    const hasSetup = hasConnectedSources || cookiePoolEntries.length > 0 || customBrands.length > 0 || customTags.length > 0;
    const hasActivity = listings.length > 0 || recommendations.length > 0 || likes.length > 0 || visibleSessions.some((session) => session.latestRun);
    return !hasSetup && !hasActivity;
  }, [cookiePoolEntries.length, customBrands.length, customTags.length, likes.length, listings.length, recommendations.length, sourceSessions, visibleSessions]);
  const header = headerStatus(connection, visibleSessions, busyAction);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isFirstLaunch && window.localStorage.getItem('archive-finder-quick-start-seen') !== '1') {
      setQuickStartOpen(true);
    }
  }, [isFirstLaunch]);

  function closeQuickStart(remember = true): void {
    if (remember && typeof window !== 'undefined') {
      window.localStorage.setItem('archive-finder-quick-start-seen', '1');
    }
    setQuickStartOpen(false);
  }

  const refreshAll = useCallback(async (sessionId?: number | null) => {
    await loadData(sessionId ?? currentSession?.id ?? null);
  }, [currentSession?.id, loadData]);

  async function handleConnectAccount(source: ConnectableSource): Promise<void> {
    sourceConnectionCleanupRef.current?.();
    sourceConnectionCleanupRef.current = null;
    setConnectingSource(source);
    setError(null);
    try {
      await captureSourceSession(source);
      let finished = false;
      const startedAt = Date.now();

      const cleanup = () => {
        window.clearInterval(intervalId);
        window.clearTimeout(timeoutId);
        if (sourceConnectionCleanupRef.current === cleanup) {
          sourceConnectionCleanupRef.current = null;
        }
      };

      const completeConnection = async (connectedAs: string | null) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        setConnectingSource(null);
        await loadSourceSessions();
        setMessage(connectedAs ? `${sourceLabel(source)} account connected as ${connectedAs}.` : `${sourceLabel(source)} account connected.`);
      };

      const intervalId = window.setInterval(() => {
        void fetchSourceSessionStatus(source)
          .then((status) => {
            if (status.connected) {
              void completeConnection(status.loggedInAs);
              return;
            }

            if (!status.inProgress && Date.now() - startedAt > 10_000) {
              finished = true;
              cleanup();
              setConnectingSource(null);
              setError(`No ${sourceLabel(source)} session was captured. Try Connect Account again.`);
            }
          })
          .catch(() => {
            // Ignore transient polling failures while capture is running.
          });
      }, 3000);

      const timeoutId = window.setTimeout(() => {
        finished = true;
        cleanup();
        setConnectingSource((current) => current === source ? null : current);
        setError(`Timed out waiting for ${sourceLabel(source)} login.`);
      }, 600_000);

      sourceConnectionCleanupRef.current = cleanup;
    } catch (connectError) {
      sourceConnectionCleanupRef.current?.();
      sourceConnectionCleanupRef.current = null;
      setConnectingSource(null);
      setError(connectError instanceof Error ? connectError.message : 'Failed to open the Chrome login flow.');
    }
  }

  async function handleDisconnectAccount(source: ConnectableSource): Promise<void> {
    try {
      await deleteSourceSession(source);
      setConnectingSource((current) => current === source ? null : current);
      await loadSourceSessions();
      setMessage(`${sourceLabel(source)} account disconnected.`);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect account.');
    }
  }

  async function handleCookieImport(source: FeedSource): Promise<void> {
    setCookieImportStatus('loading');
    setCookieImportMessage('');
    try {
      const result = await addCookiePoolEntry({
        source,
        cookies: cookieInputText,
        label: cookiePoolLabel || null,
        userAgent: navigator.userAgent,
        notes: cookiePoolNotes || null
      });
      setCookieImportStatus('ok');
      setCookieImportMessage(`Saved ${result.cookieCount} cookies.`);
      setCookieInputText('');
      setCookiePoolLabel('');
      setCookiePoolNotes('');
      await loadOperatorVaults();
      window.setTimeout(() => {
        setCookieImportStatus('idle');
        setCookieImportMessage('');
      }, 1200);
    } catch (importError) {
      setCookieImportStatus('error');
      setCookieImportMessage(importError instanceof Error ? importError.message : 'Failed to save cookies.');
    }
  }

  async function handleDeleteCookiePoolEntry(entryId: number): Promise<void> {
    try {
      await deleteCookiePoolEntryById(entryId);
      await loadOperatorVaults();
      setMessage('Cookie pack removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to remove cookie pack.');
    }
  }

  async function handleSaveCustomCatalog(kind: 'brand' | 'tag'): Promise<void> {
    setBusyAction(`catalog-${kind}`);
    setError(null);
    try {
      const text = kind === 'brand' ? brandVaultText : tagVaultText;
      const result = await replaceCustomCatalog(kind, text);
      if (kind === 'brand') {
        setCustomBrands(result.terms);
      } else {
        setCustomTags(result.terms);
      }
      setMessage(`${kind === 'brand' ? 'Brand' : 'Tag'} vault updated.`);
      await loadDiagnostics().catch(() => undefined);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : 'Failed to update vault.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteCustomCatalog(kind: 'brand' | 'tag', id: number): Promise<void> {
    try {
      await deleteCustomCatalogEntry(kind, id);
      await loadOperatorVaults();
      setMessage(`${kind === 'brand' ? 'Brand' : 'Tag'} removed.`);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : 'Failed to remove catalog entry.');
    }
  }

  async function handleRefresh(targetSession = currentSession): Promise<void> {
    if (!targetSession) return;
    setBusyAction(`refresh-${targetSession.id}`);
    setError(null);
    try {
      const result = await refreshSession(targetSession.id);
      setMessage(`${sourceLabel(targetSession.source)}: ${result.report.itemsExtracted} parsed, ${result.latestRun?.newMatchesFound ?? 0} new.`);
      await refreshAll(targetSession.id);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh source.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleLike(listing: Listing): Promise<void> {
    try {
      const result = await likeListing(listing.id);
      const nextListing = result.listing;
      if (!result.liked) {
        setLikes((current) => current.filter((entry) => entry.listingId !== listing.id));
      } else {
        setLikes((current) => dedupeLikes([{ listingId: nextListing.id, createdAt: new Date().toISOString(), listing: nextListing }, ...current]));
      }
      setListings((current) => current.map((entry) => entry.id === nextListing.id ? { ...entry, ...nextListing } : entry));
      setRecommendations((current) => current.map((entry) => entry.listingId === nextListing.id ? { ...entry, listing: { ...entry.listing, ...nextListing } } : entry));
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : 'Failed to update liked state.');
    }
  }

  async function handleResetLiveState(): Promise<void> {
    setBusyAction('reset-live-state');
    setError(null);
    try {
      await resetLiveState();
      setListings([]);
      setRecommendations([]);
      setOpportunities([]);
      setLikes([]);
      setMessage('Live state reset. Feed is empty until fresh listings arrive.');
      await loadData(currentSession?.id ?? null);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Failed to reset live state.');
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading Archive Finder…</div>;
  }

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-logo">Archive Finder</div>
        <div className="header-actions">
          <button type="button" className="header-guide-btn" onClick={() => setQuickStartOpen(true)}>Quick Start</button>
          <div className="header-status">
            <span className={`status-dot ${header.mode === 'active' ? 'active' : header.mode === 'scanning' ? 'scanning' : ''}`.trim()} />
            <span>{header.text}</span>
          </div>
        </div>
      </header>

      <Sidebar current={screen} onSelect={setScreen} />
      <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />
      <QuickStartModal
        open={quickStartOpen}
        connectedSources={sourceSessions.filter((session) => session.isValid).length}
        cookiePacks={cookiePoolEntries.length}
        customBrands={customBrands.length}
        onClose={closeQuickStart}
        onOpenSources={() => {
          setScreen('sources');
          closeQuickStart(true);
        }}
        onOpenSettings={() => {
          setScreen('settings');
          closeQuickStart(true);
        }}
        onResetLiveState={() => {
          void handleResetLiveState();
          closeQuickStart(true);
        }}
      />

      <main ref={mainRef} className="main-content">
        {message ? <div className="notice notice--success">{message}</div> : null}
        {error ? <div className="notice notice--error">{error}</div> : null}

        {newItemsCount > 0 ? (
          <button
            className="new-items-banner"
            type="button"
            onClick={() => {
              mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              setNewItemsCount(0);
            }}
          >
            ↑ {newItemsCount} new items
          </button>
        ) : null}

        {screen !== 'sources' && screen !== 'diagnostics' && screen !== 'settings' ? (
          <section className="page">
            <div className="page-header">
              <div className="page-title">
                {screen === 'feed' ? 'Live Feed' : screen === 'recommendations' ? 'Recommendations' : 'Liked'}
              </div>
              <div className="page-count">
                {screen === 'feed'
                  ? metricValue(visibleListings.length)
                  : screen === 'recommendations'
                    ? metricValue(visibleRecommendations.length)
                    : metricValue(likedListings.length)}
              </div>
            </div>

            <FilterPanel
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              timeFilter={timeFilter}
              setTimeFilter={setTimeFilter}
              genderFilter={genderFilter}
              setGenderFilter={setGenderFilter}
              maxPriceUsd={maxPriceUsd}
              setMaxPriceUsd={setMaxPriceUsd}
              tooExpensiveCount={tooExpensiveCount}
            />
          </section>
        ) : null}

        {screen === 'feed' ? (
          <section className="page">
            <section className="hero-panel hero-panel--feed">
              <div className="hero-copy">
                <span className="hero-eyebrow">Desktop resale monitor</span>
                <h1>Fresh-only designer listings, filtered before they hit the feed.</h1>
                <p>
                  Every source is filtered to the live resale window, scored, and pushed into the feed only when it is genuinely fresh.
                  Public sources stay fast, protected sources stay controlled, and the operator always sees why a marketplace is healthy or blocked.
                </p>
                <div className="hero-actions">
                  <button type="button" className="primary-btn" onClick={() => setScreen('sources')}>Open Sources</button>
                  <button type="button" className="ghost-btn" onClick={() => setQuickStartOpen(true)}>Open Quick Start</button>
                </div>
                <div className="hero-inline-note">Guest-ready today: Mercari, Vinted, Rakuma, Kufar.</div>
                <div className="hero-source-strip">
                  {sourceHealthSummary.slice(0, 4).map((session) => (
                    <span key={`hero-strip-${session.source}`} className={`hero-source-chip hero-source-chip--${session.source}`.trim()}>
                      <span className={`source-logo source-logo--mini source-logo--${session.source}`}>{sourceMonogram(session.source)}</span>
                      <strong>{sourceLabel(session.source)}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <div className="hero-visual">
                <div className="hero-visual__orb" />
                <div className="hero-visual__ring hero-visual__ring--one" />
                <div className="hero-visual__ring hero-visual__ring--two" />
                <div className="hero-visual__signal hero-visual__signal--one" />
                <div className="hero-visual__signal hero-visual__signal--two" />
                <div className="hero-visual__signal hero-visual__signal--three" />
                <div className="hero-visual__badge hero-visual__badge--top">Fresh-only pipeline</div>
                <div className="hero-visual__badge hero-visual__badge--bottom">Noise penalties active</div>
              </div>
              <div className="hero-metrics">
                <div className="hero-metric">
                  <span>Live feed</span>
                  <strong>{metricValue(visibleListings.length)}</strong>
                </div>
                <div className="hero-metric">
                  <span>Recommendations</span>
                  <strong>{metricValue(visibleRecommendations.length)}</strong>
                </div>
                <div className="hero-metric">
                  <span>Opportunities</span>
                  <strong>{metricValue(visibleOpportunities.length)}</strong>
                </div>
                <div className="hero-metric">
                  <span>Last sync</span>
                  <strong>{formatRelativeTime(latestSync)}</strong>
                </div>
              </div>
            </section>
            <div className="source-showcase-grid">
              {sourceHealthSummary.map((session) => (
                <SourcePosterCard
                  key={`feed-health-${session.source}`}
                  session={session}
                  mode="feed"
                />
              ))}
            </div>
            <UsageGuidePanel
              connectedSources={sourceSessions.filter((session) => session.isValid).length}
              cookiePacks={cookiePoolEntries.length}
              customBrands={customBrands.length}
              onOpenSources={() => setScreen('sources')}
              onOpenSettings={() => setScreen('settings')}
              onResetLiveState={() => void handleResetLiveState()}
            />
            {visibleListings.length > 0 ? (
              <div className="feed-grid">
                {visibleListings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onLike={() => void handleToggleLike(listing)}
                    isLiked={Boolean(listing.likedAt)}
                    className={freshAnimations[listing.id] !== undefined ? 'card-enter' : ''}
                    style={freshAnimations[listing.id] !== undefined ? { animationDelay: `${freshAnimations[listing.id]}ms` } : undefined}
                  />
                ))}
              </div>
            ) : isFirstLaunch ? (
              <FirstLaunchPanel
                connectedSources={sourceSessions.filter((session) => session.isValid).length}
                cookiePacks={cookiePoolEntries.length}
                customBrands={customBrands.length}
                onOpenSources={() => {
                  setCookieImportSource('avito');
                  setScreen('sources');
                }}
                onOpenSettings={() => setScreen('settings')}
                onOpenDiagnostics={() => setScreen('diagnostics')}
              />
            ) : (
              <div className="empty-state"><h3>No results</h3><p>Try a broader source or time filter.</p></div>
            )}
          </section>
        ) : null}

        {screen === 'recommendations' ? (
          <section className="page">
            <section className="hero-panel hero-panel--recommendations">
              <div className="hero-copy">
                <span className="hero-eyebrow">Opportunity queue</span>
                <h1>Higher signal, stricter reasons.</h1>
                <p>Recommendations now combine brand strength, demand category, freshness, price opportunity, tracked tags, and noise penalties.</p>
              </div>
              <div className="hero-metrics">
                <div className="hero-metric">
                  <span>Queued now</span>
                  <strong>{metricValue(visibleRecommendations.length)}</strong>
                </div>
                <div className="hero-metric">
                  <span>Hot picks</span>
                  <strong>{metricValue(visibleOpportunities.length)}</strong>
                </div>
              </div>
            </section>
            {visibleOpportunities.length > 0 ? (
              <div className="opportunity-strip">
                {visibleOpportunities.slice(0, 3).map((entry) => (
                  <ListingCard
                    key={`opp-${entry.listingId}`}
                    listing={{
                      ...entry.listing,
                      recommendationScore: entry.score,
                      recommendationReasons: entry.reasons
                    }}
                    onLike={() => void handleToggleLike(entry.listing)}
                    isLiked={Boolean(entry.listing.likedAt)}
                    className="card card--opportunity"
                  />
                ))}
              </div>
            ) : null}
            {visibleRecommendations.length > 0 ? (
              <div className="feed-grid">
                {visibleRecommendations.map((entry) => (
                  <ListingCard
                    key={entry.listingId}
                    listing={{
                      ...entry.listing,
                      recommendationScore: entry.score,
                      recommendationReasons: entry.reasons,
                      scoreBreakdown: entry.listing.scoreBreakdown ?? { ...(entry.listing.scoreBreakdown ?? {}), reasons: entry.reasons, total: entry.score } as Listing['scoreBreakdown']
                    }}
                    onLike={() => void handleToggleLike(entry.listing)}
                    isLiked={Boolean(entry.listing.likedAt)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state"><h3>No results</h3><p>No recommendations match the current filters.</p></div>
            )}
          </section>
        ) : null}

        {screen === 'likes' ? (
          <section className="page">
            <div className="filter-bar" style={{ top: 'unset', position: 'relative' }}>
              <button type="button" className={`filter-pill ${likesSort === 'recent' ? 'filter-pill--active' : ''}`.trim()} onClick={() => setLikesSort('recent')}>Recent</button>
              <button type="button" className={`filter-pill ${likesSort === 'priceAsc' ? 'filter-pill--active' : ''}`.trim()} onClick={() => setLikesSort('priceAsc')}>Price↑</button>
              <button type="button" className={`filter-pill ${likesSort === 'priceDesc' ? 'filter-pill--active' : ''}`.trim()} onClick={() => setLikesSort('priceDesc')}>Price↓</button>
            </div>
            {likedListings.length > 0 ? (
              <div className="feed-grid">
                {likedListings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} onLike={() => void handleToggleLike(listing)} isLiked />
                ))}
              </div>
            ) : (
              <div className="empty-state"><h3>No results</h3><p>Liked items will appear here.</p></div>
            )}
          </section>
        ) : null}

        {screen === 'sources' ? (
          <section className="page">
            <div className="page-header">
              <div className="page-title">Sources</div>
              <div className="page-count">{metricValue(sourceHealthSummary.length)}</div>
            </div>
            <div className="source-stack">
              <section className="source-command-deck">
                <div className="source-command-deck__lead">
                  <span className="hero-eyebrow">Source command deck</span>
                  <h2>Run each marketplace in the mode it actually wants.</h2>
                  <p>
                    Public lanes can stay simple. Protected lanes should go through sessions, cookie vault rotation,
                    or proxies where required. The deck below makes the operating mode obvious before you touch diagnostics.
                  </p>
                </div>
                <div className="source-command-deck__legend">
                  <span className="capability-badge capability-badge--guest">Guest-ready</span>
                  <span className="capability-badge capability-badge--required">Cookies required</span>
                  <span className="capability-badge capability-badge--proxy">Proxy + cookies</span>
                </div>
              </section>

              <div className="vault-grid">
                <article className="source-card source-card--sessions">
                  <div className="card-section-head">
                    <div>
                      <div className="card-section-title">Connected Accounts</div>
                      <div className="source-card__sub">Browser login stays for protected APIs. Cookie vault below handles multiple imported packs and fallback rotation.</div>
                    </div>
                  </div>
                  <div className="session-list">
                    {SESSION_SOURCES.map((source) => {
                      const session = sourceSessions.find((entry) => entry.source === source);
                      return (
                        <div key={source} className="session-row">
                          <div className="session-source-name">
                            <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                            {sourceLabel(source)}
                          </div>
                          {session?.isValid ? (
                            <div className="session-connected">
                              <span className="session-dot session-dot--active" />
                              <div className="session-copy">
                                <span className="session-user">{session.loggedInAs ?? 'Connected'}</span>
                                <span className="session-meta">
                                  Expires {session.expiresAt ? formatDate(session.expiresAt) : 'later'}
                                </span>
                              </div>
                              {isConnectableSource(source) ? (
                                <button
                                  type="button"
                                  className="session-btn session-btn--disconnect"
                                  onClick={() => void handleDisconnectAccount(source)}
                                >
                                  Disconnect
                                </button>
                              ) : null}
                              {supportsCookieImport(source) ? (
                                <button
                                  type="button"
                                  className="session-btn session-btn--cookie"
                                  onClick={() => {
                                    setCookieImportSource(source);
                                    setCookieImportStatus('idle');
                                    setCookieImportMessage('');
                                  }}
                                  title="Use this source in Cookie Vault"
                                >
                                  Use in Vault
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="session-disconnected">
                              <span className="session-dot session-dot--inactive" />
                              <div className="session-copy">
                                <span className="session-hint">Not connected</span>
                                <span className="session-meta">
                                  {source === 'avito'
                                    ? 'Avito mainly relies on imported cookie packs.'
                                    : 'Connect browser login if this source needs protected API access.'}
                                </span>
                              </div>
                              {isConnectableSource(source) && connectingSource === source ? (
                                <div className="session-connecting">
                                  <div className="session-spinner" />
                                  <span>Chrome opening. Log in when it appears...</span>
                                </div>
                              ) : isConnectableSource(source) ? (
                                <button
                                  type="button"
                                  className="session-btn session-btn--connect"
                                  onClick={() => void handleConnectAccount(source)}
                                >
                                  Connect Account
                                </button>
                              ) : null}
                              {supportsCookieImport(source) ? (
                                <button
                                  type="button"
                                  className="session-btn session-btn--cookie"
                                  onClick={() => {
                                    setCookieImportSource(source);
                                    setCookieImportStatus('idle');
                                    setCookieImportMessage('');
                                  }}
                                  title="Use this source in Cookie Vault"
                                >
                                  Use in Vault
                                </button>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="source-card source-card--vault">
                  <div className="card-section-head">
                    <div>
                      <div className="card-section-title">Cookie Vault</div>
                      <div className="source-card__sub">Store multiple cookie packs per source. The parser will pick the healthiest pack first and fall back when one degrades.</div>
                    </div>
                    <span className="source-card__meta-badge">{metricValue(cookiePoolEntries.length)} packs</span>
                  </div>
                  <div className="cookie-vault-guide">
                    {COOKIE_VAULT_SOURCES.map((source) => (
                      <button
                        key={source}
                        type="button"
                        className={`source-choice ${cookieImportSource === source ? 'source-choice--active' : ''}`.trim()}
                        onClick={() => setCookieImportSource(source)}
                      >
                        <span className={`source-logo source-logo--mini source-logo--${source}`}>{sourceMonogram(source)}</span>
                        <span>{sourceLabel(source)}</span>
                      </button>
                    ))}
                  </div>
                  <div className="cookie-guide-card">
                    <span className={`capability-badge capability-badge--${sourceCapability(cookieImportSource).tone}`.trim()}>
                      {sourceCapability(cookieImportSource).label}
                    </span>
                    <strong>{cookieGuide(cookieImportSource).title}</strong>
                    <div className="cookie-guide-chips">
                      {cookieGuide(cookieImportSource).chips.map((chip) => (
                        <span key={chip} className="inline-chip">{chip}</span>
                      ))}
                    </div>
                    <p>{cookieGuide(cookieImportSource).note}</p>
                  </div>
                  <div className="vault-form-grid">
                    <input
                      placeholder="Label, e.g. Avito Pack 01"
                      value={cookiePoolLabel}
                      onChange={(event) => setCookiePoolLabel(event.target.value)}
                    />
                    <input
                      placeholder="Notes, e.g. bought today / mobile fingerprint"
                      value={cookiePoolNotes}
                      onChange={(event) => setCookiePoolNotes(event.target.value)}
                    />
                  </div>
                  <textarea
                    className="cookie-import-input cookie-import-input--inline"
                    placeholder={
                      `name=value; name2=value2\n\n`
                      + `[{"name":"token","value":"abc123","domain":".avito.ru"}]\n\n`
                      + `{"_csrf":"xxx","session_id":"yyy"}`
                    }
                    value={cookieInputText}
                    onChange={(event) => setCookieInputText(event.target.value)}
                    rows={8}
                  />
                  {cookieImportStatus === 'ok' ? <p className="cookie-import-ok">{cookieImportMessage}</p> : null}
                  {cookieImportStatus === 'error' ? <p className="cookie-import-err">{cookieImportMessage}</p> : null}
                  <div className="cookie-import-actions">
                    <button
                      type="button"
                      className="session-btn session-btn--connect"
                      onClick={() => void handleCookieImport(cookieImportSource)}
                      disabled={!cookieInputText.trim() || cookieImportStatus === 'loading'}
                    >
                      {cookieImportStatus === 'loading' ? 'Saving...' : 'Add Cookie Pack'}
                    </button>
                  </div>
                  <div className="vault-pack-list">
                    {(cookiePoolBySource.get(cookieImportSource) ?? []).length > 0 ? (
                      (cookiePoolBySource.get(cookieImportSource) ?? []).map((entry) => (
                        <div key={entry.id} className={`vault-pack ${entry.isValid ? '' : 'vault-pack--invalid'}`.trim()}>
                          <div>
                            <strong>{entry.label ?? `${sourceLabel(entry.source)} pack`}</strong>
                            <div className="vault-pack__meta">
                              <span>{entry.cookieCount} cookies</span>
                              <span>{entry.lastSuccessAt ? `last ok ${formatRelativeTime(entry.lastSuccessAt)}` : 'no success yet'}</span>
                              <span>{entry.consecutiveFailures > 0 ? `${entry.consecutiveFailures} fails` : 'healthy'}</span>
                            </div>
                            {entry.lastError ? <div className="vault-pack__error">{entry.lastError}</div> : null}
                          </div>
                          <button type="button" className="ghost-btn" onClick={() => void handleDeleteCookiePoolEntry(entry.id)}>Remove</button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state empty-state--compact">
                        <h3>No cookie packs yet</h3>
                        <p>Add one or more packs for {sourceLabel(cookieImportSource)} to enable automatic fallback rotation.</p>
                      </div>
                    )}
                  </div>
                </article>
              </div>

              <div className="source-showcase-grid source-showcase-grid--sources">
                {sourceHealthSummary.map((session) => (
                  <SourcePosterCard
                    key={session.id}
                    session={session}
                    mode="sources"
                    onRefresh={() => {
                      setSelectedSessionId(session.id);
                      void handleRefresh(session);
                    }}
                    onInspect={() => {
                      setSelectedSessionId(session.id);
                      setScreen('diagnostics');
                      void loadSessionDetails(session.id);
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {screen === 'diagnostics' ? (
          <section className="page diagnostics-page">
            <div className="page-header">
              <div className="page-title">Diagnostics</div>
              <div className="page-count">{currentSession ? sourceLabel(currentSession.source) : 'No source selected'}</div>
            </div>
            {currentSession ? (
              <div className="diagnostics-grid">
                <article className="diagnostic-card diagnostic-card--report">
                  <div className="card-section-head">
                    <div className="card-section-title">Snapshot report</div>
                    <strong>{diagnosticsReport?.path ?? 'data/runtime-diagnostics.txt'}</strong>
                  </div>
                  <pre className="diagnostics-report-text">{diagnosticsReport?.text ?? 'No diagnostics snapshot yet.'}</pre>
                </article>

                <article className="diagnostic-card">
                  <div className="card-section-head">
                    <div className="card-section-title">Current source</div>
                    <span className={`status-chip status-chip--${sourceStatusLabel(currentSession.sourceStatus).toLowerCase()}`.trim()}>{sourceStatusLabel(currentSession.sourceStatus)}</span>
                  </div>
                  <div className="status-list">
                    <span>Source: {sourceLabel(currentSession.source)}</span>
                    <span>Last check: {formatDate(currentSession.lastCheckedAt)}</span>
                    <span>Interval: {currentSession.effectivePollIntervalSec}s</span>
                    <span>Consecutive failures: {currentSession.consecutiveFailures}</span>
                    <span>Success rate: {currentSourceHealth ? `${Math.round(currentSourceHealth.successRateLast50)}%` : 'n/a'}</span>
                  </div>
                </article>

                {parseReport ? (
                  <article className="diagnostic-card">
                    <div className="card-section-head">
                      <div className="card-section-title">Latest parse report</div>
                      <strong>{parseReport.responseStatus ?? 'n/a'}</strong>
                    </div>
                    <div className="status-list">
                      <span>Payload: {metricValue(parseReport.htmlLength)}</span>
                      <span>Cards found: {parseReport.cardsFound}</span>
                      <span>Items extracted: {parseReport.itemsExtracted}</span>
                      <span>Matches: {parseReport.itemsMatched}</span>
                      <span>Skipped old: {parseReport.itemsSkippedByAge ?? 0}</span>
                      <span>Inserted: {parseReport.itemsInserted ?? 0}</span>
                      <span>Query: {parseReport.queryText ?? 'n/a'}</span>
                    </div>
                    {parseReport.sampleExtractedTitles.length > 0 ? (
                      <ul className="simple-list" style={{ marginTop: '10px' }}>
                        {parseReport.sampleExtractedTitles.map((title) => <li key={title}>{title}</li>)}
                      </ul>
                    ) : null}
                  </article>
                ) : null}

                <article className="diagnostic-card">
                  <div className="card-section-head">
                    <div className="card-section-title">Health snapshot</div>
                  </div>
                  <div className="status-list">
                    <span>Avg extracted: {currentSourceHealth ? metricValue(Math.round(currentSourceHealth.avgItemsExtracted)) : 'n/a'}</span>
                    <span>Avg new inserted: {currentSourceHealth ? metricValue(Math.round(currentSourceHealth.avgNewItemsInserted)) : 'n/a'}</span>
                    <span>Parser mode: {currentSourceHealth?.currentParserMode ?? 'n/a'}</span>
                    <span>Anti-bot warnings: {currentSourceHealth?.antiBotWarningsLast24h ?? 0}</span>
                    <span>Session valid: {currentSessionHealth ? (currentSessionHealth.isValid ? 'yes' : 'no') : 'n/a'}</span>
                  </div>
                </article>

                <article className="diagnostic-card">
                  <div className="card-section-head">
                    <div className="card-section-title">Recent runs</div>
                  </div>
                  <div className="run-list">
                    {runs.map((run) => (
                      <div key={run.id} className="run-row">
                        <span>{formatDate(run.startedAt)}</span>
                        <span>HTTP {run.responseStatus ?? 'n/a'}</span>
                        <span>Items: {run.itemsExtracted}</span>
                        <span>Matches: {run.matchesFound}</span>
                        <span>New: {run.newMatchesFound}</span>
                        <span>Old skip: {run.itemsSkippedByAge ?? 0}</span>
                        <span>{run.error ?? 'ok'}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="diagnostic-card diagnostic-card--report">
                  <div className="card-section-head">
                    <div className="card-section-title">Runtime log</div>
                    <strong>{runtimeLog?.path ?? 'data/runtime-errors.log'}</strong>
                  </div>
                  <pre className="diagnostics-report-text">{runtimeLog?.text ?? 'No runtime log entries yet.'}</pre>
                </article>
              </div>
            ) : (
              <div className="empty-state"><h3>No source selected</h3><p>Open Sources and choose one.</p></div>
            )}
          </section>
        ) : null}

        {screen === 'settings' ? (
          <section className="page">
            <div className="page-header">
              <div className="page-title">Settings</div>
              <div className="page-count">{metricValue(activeSourceCount)} active</div>
            </div>
            <div className="diagnostics-grid">
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Operator handbook</div>
                  <strong>/docs/OPERATOR_HANDBOOK.md</strong>
                </div>
                <div className="status-list">
                  <span>Use the in-app Quick Start for first launch, then keep the handbook next to the repo for operator setup.</span>
                  <span>It covers guest-ready sources, protected sources, cookie vault flow, reset-live-state, and live testing.</span>
                  <span>If a marketplace degrades, check Sources first, then Diagnostics, then the runtime log file.</span>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Questions / contact</div>
                  <strong>@aloegarten00</strong>
                </div>
                <div className="status-list">
                  <span>If you publish the project and users have setup questions, send them here.</span>
                  <span>Telegram: <a href="https://t.me/aloegarten00" target="_blank" rel="noreferrer">@aloegarten00</a></span>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">How to run a clean test</div>
                </div>
                <div className="status-list">
                  <span>1. Reset Live State.</span>
                  <span>2. Open Sources and refresh one healthy marketplace.</span>
                  <span>3. Watch Live Feed for only-new items.</span>
                  <span>4. If feed stays empty, check smoke report and runtime log before changing code.</span>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Live reset</div>
                </div>
                <div className="status-list">
                  <span>Use this before a manual crawl test.</span>
                  <span>It clears listings, recommendations, opportunities, likes, and live queue state.</span>
                  <span>Feeds, cookies, sessions, and source configs stay intact.</span>
                </div>
                <div className="source-card__actions" style={{ marginTop: '16px' }}>
                  <button type="button" className="ghost-btn" onClick={() => void handleResetLiveState()} disabled={busyAction === 'reset-live-state'}>
                    {busyAction === 'reset-live-state' ? 'Resetting...' : 'Reset Live State'}
                  </button>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Engine summary</div>
                </div>
                <div className="status-list">
                  <span>Live feed items: {metricValue(newCount)}</span>
                  <span>Recommendations: {metricValue(recommendationCount)}</span>
                  <span>Opportunities: {metricValue(visibleOpportunities.length)}</span>
                  <span>Last sync: {formatRelativeTime(latestSync)}</span>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Recommended workflow</div>
                </div>
                <div className="status-list">
                  <span>Sources: connect protected marketplaces and load cookie fallback packs.</span>
                  <span>Settings: load your own brands and tags.</span>
                  <span>Feed: keep time filter on Today or All when testing fresh discovery.</span>
                  <span>Recommendations: use it after Live Feed starts receiving fresh inserts.</span>
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Brand Vault</div>
                </div>
                <div className="status-list">
                  <span>Custom brands are appended into query rotation and scoring.</span>
                  <span>Use one term per line. Large lists are supported.</span>
                </div>
                <textarea
                  className="cookie-import-input cookie-import-input--inline"
                  rows={10}
                  value={brandVaultText}
                  onChange={(event) => setBrandVaultText(event.target.value)}
                  placeholder={'Rick Owens\nGuidi\nYohji Yamamoto'}
                />
                <div className="cookie-import-actions">
                  <button type="button" className="session-btn session-btn--connect" onClick={() => void handleSaveCustomCatalog('brand')} disabled={busyAction === 'catalog-brand'}>
                    {busyAction === 'catalog-brand' ? 'Saving...' : 'Save Brand Vault'}
                  </button>
                </div>
                <div className="inline-chip-list">
                  {customBrands.slice(0, 18).map((entry) => (
                    <button key={entry.id} type="button" className="inline-chip inline-chip--removable" onClick={() => void handleDeleteCustomCatalog('brand', entry.id)}>
                      {entry.term}
                    </button>
                  ))}
                </div>
              </article>
              <article className="diagnostic-card">
                <div className="card-section-head">
                  <div className="card-section-title">Tag Vault</div>
                </div>
                <div className="status-list">
                  <span>Tracked tags add signal in query rotation and recommendation reasons.</span>
                  <span>Good examples: archive, artisanal, horsehide, military, draped.</span>
                </div>
                <textarea
                  className="cookie-import-input cookie-import-input--inline"
                  rows={10}
                  value={tagVaultText}
                  onChange={(event) => setTagVaultText(event.target.value)}
                  placeholder={'archive\nrare\nhorsehide'}
                />
                <div className="cookie-import-actions">
                  <button type="button" className="session-btn session-btn--connect" onClick={() => void handleSaveCustomCatalog('tag')} disabled={busyAction === 'catalog-tag'}>
                    {busyAction === 'catalog-tag' ? 'Saving...' : 'Save Tag Vault'}
                  </button>
                </div>
                <div className="inline-chip-list">
                  {customTags.slice(0, 18).map((entry) => (
                    <button key={entry.id} type="button" className="inline-chip inline-chip--removable" onClick={() => void handleDeleteCustomCatalog('tag', entry.id)}>
                      {entry.term}
                    </button>
                  ))}
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
