import { chromium } from 'playwright';
import { load } from 'cheerio';
import { detectBrand, type SourceRuntimeDiagnostics } from '@avito-monitor/shared';
import { crawlCarousellWithMeta } from '../crawler/carousellCrawler';
import { getSourceCookieEntry, getSourceCookies, markCookiePoolEntryFailure, markCookiePoolEntrySuccess } from '../lib/cookieStore';
import {
  cookiesToHeader,
  getStoredSession,
  invalidateSession,
  saveSessionSnapshot,
  type SessionCookie,
  type StoredSession
} from '../services/sessionManager';
import type { ParsedListingCandidate } from './types';
import { apiHeaders, browserHeaders, humanDelay, isBlocked, pickUA, toUsd } from '../lib/antiBan';
import { hasProxy, proxyFetch } from '../lib/proxyFetch';

export interface CarousellFetchResult {
  listings: ParsedListingCandidate[];
  responseStatus: number | null;
  rawLength: number;
  warnings: string[];
  runtimeDiagnostics: SourceRuntimeDiagnostics | null;
}

export const CAROUSELL_QUERIES = [
  'Rick Owens',
  'Yohji Yamamoto',
  'Comme des Garcons',
  'Maison Margiela',
  'Helmut Lang',
  'Ann Demeulemeester',
  'Julius archive',
  'Undercover japan',
  'Number Nine',
  'Raf Simons',
  'Carol Christian Poell',
  'Boris Bidjan Saberi',
  'Guidi',
  'Devoa',
  'Layer-0',
  'Isaac Sellam',
  'designer leather jacket',
  'archive jacket',
  'avant garde coat',
  'archive fashion designer'
] as const;

interface CarousellPrice {
  amount?: string;
  code?: string;
}

interface CarousellPhoto {
  url?: string;
  urls?: Record<string, string>;
  imageUrl?: string;
}

interface CarousellItem {
  id?: string | number;
  title?: string;
  price?: CarousellPrice | string | number;
  photos?: CarousellPhoto[];
  coverPhoto?: CarousellPhoto;
  permalink?: string;
  listingUrl?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
}

interface CarousellPayload {
  listings?: CarousellItem[];
  results?: CarousellItem[];
  items?: CarousellItem[];
  data?: {
    results?: CarousellItem[];
    listings?: CarousellItem[];
  };
}

const AUTH_COOKIE_PATTERNS = [
  'at',
  'rt',
  'userId',
  'user_id',
  'authToken',
  'auth_token',
  'jwt',
  '_t',
  '_t2',
  'session',
  'connect.sid',
  '_carousell',
  'cs_'
] as const;
const CAROUSELL_BASE = 'https://www.carousell.com.my';

function normalizeTimestamp(value: number | string | undefined): string | null {
  if (typeof value === 'number') {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  return value ? String(value) : null;
}

function parsePrice(price: CarousellItem['price']): { amount: number | null; currency: string } {
  if (typeof price === 'number') {
    return { amount: price, currency: 'MYR' };
  }

  if (typeof price === 'string') {
    const matched = price.replace(/,/g, '').match(/[\d.]+/);
    return {
      amount: matched ? Number.parseFloat(matched[0]) : null,
      currency: 'MYR'
    };
  }

  return {
    amount: price?.amount ? Number.parseFloat(price.amount) : null,
    currency: price?.code ?? 'MYR'
  };
}

function pickImage(item: CarousellItem): string | null {
  const photo = item.photos?.[0] ?? item.coverPhoto;
  if (!photo) {
    return null;
  }

  return photo.urls?.large ?? photo.urls?.medium ?? photo.urls?.thumbnail ?? photo.url ?? photo.imageUrl ?? null;
}

function listingUrl(item: CarousellItem, externalId: string): string {
  if (item.permalink) {
    return item.permalink.startsWith('http')
      ? item.permalink
      : `${CAROUSELL_BASE}${item.permalink}`;
  }

  return item.listingUrl ?? `${CAROUSELL_BASE}/p/${externalId}`;
}

function parseCarousellItem(item: CarousellItem): ParsedListingCandidate | null {
  const externalId = item.id ? String(item.id) : null;
  const title = item.title?.trim() ?? '';
  if (!externalId || !title) {
    return null;
  }

  const { amount, currency } = parsePrice(item.price);
  const url = listingUrl(item, externalId);
  const postedAt = normalizeTimestamp(item.createdAt ?? item.updatedAt);

  return {
    source: 'carousell',
    externalId,
    title,
    description: title,
    priceText: amount !== null ? `${amount} ${currency}` : null,
    priceValueOptional: amount,
    currencyTextOptional: currency,
    priceOriginal: amount,
    currencyOriginal: currency,
    priceUsd: amount !== null ? toUsd(amount, currency) : null,
    url,
    canonicalUrl: url,
    locationText: 'Malaysia',
    sellerType: 'unknown',
    imageUrl1: pickImage(item),
    imageUrl2: null,
    publishedTextOptional: postedAt,
    postedAt,
    brandDetected: detectBrand(title),
    vertical: 'fashion',
    raw: item as Record<string, unknown>
  };
}

function extractItems(payload: CarousellPayload): CarousellItem[] {
  return payload.listings ?? payload.data?.results ?? payload.data?.listings ?? payload.results ?? payload.items ?? [];
}

function hasAuthCookies(cookies: SessionCookie[]): boolean {
  return cookies.some((cookie) =>
    AUTH_COOKIE_PATTERNS.some((pattern) => cookie.name.toLowerCase().includes(pattern.toLowerCase())) && cookie.value.length > 6
  );
}

function normalizeProvider(loggedInAs: string | null): 'captured' | 'imported' {
  return loggedInAs === 'imported' ? 'imported' : 'captured';
}

function buildDiagnostics(
  transportMode: 'direct' | 'browser',
  blockReason: string | null,
  lastRecoveryAction: string | null,
  cookieProvider: 'captured' | 'imported'
): SourceRuntimeDiagnostics {
  return {
    cookieProvider,
    transportMode,
    proxyActive: hasProxy(),
    blockReason,
    lastRecoveryAction
  };
}

function buildSearchPageUrl(query: string): string {
  return `${CAROUSELL_BASE}/search/${encodeURIComponent(query)}?addRecent=true&canChangeKeyword=true&includeSuggestions=true&t-search_query_source=direct_search`;
}

function normalizeHref(href: string): string {
  return href.replace(/&amp;/g, '&');
}

function extractExternalId(href: string, fallbackId: string | undefined): string | null {
  const hrefMatch = href.match(/-(\d+)(?:\/|\?|$)/)?.[1];
  if (hrefMatch) {
    return hrefMatch;
  }

  return fallbackId?.match(/listing-card-(\d+)/)?.[1] ?? null;
}

function parseRelativePostedAt(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value === 'just now') {
    return new Date().toISOString();
  }

  if (value === 'yesterday') {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  const match = value.match(/(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2] ?? '';
  const unitMs = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000
  }[unit as 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'];

  if (!unitMs) {
    return null;
  }

  return new Date(Date.now() - amount * unitMs).toISOString();
}

function parseAmount(priceText: string | null): number | null {
  if (!priceText) {
    return null;
  }

  const matched = priceText.replace(/,/g, '').match(/[\d.]+/);
  return matched ? Number.parseFloat(matched[0]) : null;
}

export function parseCarousellSearchHtml(html: string): ParsedListingCandidate[] {
  const $ = load(html);
  const seen = new Set<string>();
  const listings: ParsedListingCandidate[] = [];

  $('[data-testid^="listing-card-"]').each((_, cardNode) => {
    const card = $(cardNode);
    const listingAnchor = card.find('a[href*="/p/"]').first();
    const href = listingAnchor.attr('href');
    if (!href) {
      return;
    }

    const normalizedListingHref = normalizeHref(href);
    const externalId = extractExternalId(normalizedListingHref, card.attr('data-testid'));
    if (!externalId || seen.has(externalId)) {
      return;
    }

    const title = listingAnchor.find('img[title]').first().attr('title')
      ?? listingAnchor.find('img[alt]').first().attr('alt')
      ?? listingAnchor.find('p[style*="--max-line"]').first().text().trim()
      ?? '';
    if (!title.trim()) {
      return;
    }

    const sellerAnchor = card.find('a[href*="/u/"]').first();
    const sellerTexts = sellerAnchor.find('p')
      .map((__, node) => $(node).text().trim())
      .get()
      .filter(Boolean);
    const sellerName = sellerTexts[0] ?? null;
    const postedText = sellerTexts[1] ?? null;
    const postedAt = parseRelativePostedAt(postedText);

    const priceText = listingAnchor.find('p[title^="RM"]').first().attr('title')
      ?? listingAnchor.find('p').toArray()
        .map((node) => $(node).text().trim())
        .find((value) => /^RM[\d,.]+/i.test(value))
      ?? null;
    const priceValue = parseAmount(priceText);
    const imageUrl = listingAnchor.find('img').first().attr('src')
      ?? listingAnchor.find('img').first().attr('data-src')
      ?? null;
    const fullUrl = normalizedListingHref.startsWith('http')
      ? normalizedListingHref
      : `${CAROUSELL_BASE}${normalizedListingHref}`;

    listings.push({
      source: 'carousell',
      externalId,
      title: title.trim(),
      description: title.trim(),
      priceText,
      priceValueOptional: priceValue,
      currencyTextOptional: 'MYR',
      priceOriginal: priceValue,
      currencyOriginal: 'MYR',
      priceUsd: priceValue !== null ? toUsd(priceValue, 'MYR') : null,
      url: fullUrl,
      canonicalUrl: fullUrl,
      locationText: 'Malaysia',
      sellerType: 'unknown',
      imageUrl1: imageUrl,
      imageUrl2: null,
      publishedTextOptional: postedText,
      postedAt,
      brandDetected: detectBrand(title),
      vertical: 'fashion',
      raw: {
        sellerName,
        postedText,
        href: normalizedListingHref
      }
    });
    seen.add(externalId);
  });

  return listings;
}

async function launchHeadlessBrowser() {
  try {
    return await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch {
    return chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
  }
}

async function fetchViaBrowserFallback(
  query: string,
  session: StoredSession | null
): Promise<CarousellFetchResult> {
  const cookieProvider = normalizeProvider(session?.loggedInAs ?? null);
  if (!session) {
    return {
      listings: [],
      responseStatus: null,
      rawLength: 0,
      warnings: ['Carousell: browser fallback requires a saved session.'],
      runtimeDiagnostics: buildDiagnostics('browser', 'no_session', null, cookieProvider)
    };
  }

  const browser = await launchHeadlessBrowser();
  const searchUrl = buildSearchPageUrl(query);

  try {
    const context = await browser.newContext({
      userAgent: session.userAgent || pickUA(),
      viewport: { width: 1400, height: 900 },
      locale: 'en-US'
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      const windowWithChrome = window as Window & { chrome?: { runtime: Record<string, never> } };
      windowWithChrome.chrome = { runtime: {} };
    });
    await context.addCookies(
      session.cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain ?? '.carousell.com.my',
        path: cookie.path ?? '/',
        expires: typeof cookie.expires === 'number' ? cookie.expires : -1,
        httpOnly: cookie.httpOnly ?? false,
        secure: cookie.secure ?? true,
        sameSite: cookie.sameSite as 'Lax' | 'None' | 'Strict' | undefined
      }))
    );

    const page = await context.newPage();
    const pageResponse = await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000
    });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="listing-card-"]').length > 0 || document.querySelectorAll('a[href*="/p/"]').length > 0,
      { timeout: 15_000 }
    ).catch(() => undefined);
    await humanDelay(1_000, 2_000);

    const fetched = await page.evaluate(() => ({
      title: document.title,
      html: document.documentElement.outerHTML,
      localStorage: Object.fromEntries(
        Array.from({ length: window.localStorage.length }, (_, index) => {
          const key = window.localStorage.key(index);
          return key ? [key, window.localStorage.getItem(key) ?? ''] : null;
        }).filter((entry): entry is [string, string] => Array.isArray(entry))
      )
    }));

    const latestCookies = await context.cookies(CAROUSELL_BASE);
    const normalizedCookies = latestCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite
    }));

    if (normalizedCookies.length > 0) {
      saveSessionSnapshot('carousell', {
        cookies: normalizedCookies,
        localStorage: fetched.localStorage,
        userAgent: session.userAgent,
        loggedInAs: session.loggedInAs,
        expiresAt: session.expiresAt
      });
    }

    if (/just a moment|challenge|cloudflare/i.test(`${fetched.title} ${fetched.html}`)) {
      return {
        listings: [],
        responseStatus: pageResponse?.status() ?? null,
        rawLength: fetched.html.length,
        warnings: ['Carousell browser fallback hit a Cloudflare/interstitial page.'],
        runtimeDiagnostics: buildDiagnostics('browser', 'cloudflare_blocked', 'browser_fallback', cookieProvider)
      };
    }

    if (!hasAuthCookies(normalizedCookies)) {
      return {
        listings: [],
        responseStatus: pageResponse?.status() ?? null,
        rawLength: fetched.html.length,
        warnings: ['Carousell browser fallback loaded the search page without valid auth cookies.'],
        runtimeDiagnostics: buildDiagnostics('browser', 'auth_failed', 'browser_fallback', cookieProvider)
      };
    }

    const listings = parseCarousellSearchHtml(fetched.html);
    if (listings.length === 0) {
      return {
        listings: [],
        responseStatus: pageResponse?.status() ?? null,
        rawLength: fetched.html.length,
        warnings: ['Carousell browser fallback loaded the search page but extracted 0 listing cards.'],
        runtimeDiagnostics: buildDiagnostics('browser', 'empty_search', 'browser_fallback', cookieProvider)
      };
    }

    return {
      listings,
      responseStatus: pageResponse?.status() ?? 200,
      rawLength: fetched.html.length,
      warnings: [],
      runtimeDiagnostics: buildDiagnostics('browser', null, 'browser_fallback', cookieProvider)
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function fetchCarousellRecommendations(): Promise<ParsedListingCandidate[]> {
  const session = getStoredSession('carousell');
  if (!session) {
    return [];
  }

  try {
    await humanDelay(900, 1_600);
    const response = await proxyFetch('https://www.carousell.com.my/api-service/listing/3.1/personal-feed/?limit=30', {
      headers: apiHeaders(session.userAgent || pickUA(), 'https://www.carousell.com.my/', {
        cookie: cookiesToHeader(session.cookies),
        acceptLanguage: 'en-US,en;q=0.9'
      }),
      timeout: 15_000
    });

    if (response.status === 401 || response.status === 403) {
      invalidateSession('carousell', { recapture: true });
      return [];
    }

    if (!response.ok) {
      return [];
    }

    const rawText = await response.text();
    if (isBlocked(rawText, response.status)) {
      invalidateSession('carousell', { recapture: true });
      return [];
    }

    const payload = JSON.parse(rawText) as CarousellPayload;
    return extractItems(payload)
      .map((item) => parseCarousellItem(item))
      .filter(Boolean) as ParsedListingCandidate[];
  } catch {
    return [];
  }
}

export async function fetchCarousellSearch(query: string): Promise<CarousellFetchResult> {
  const session = getStoredSession('carousell');
  const importedCookieEntry = getSourceCookieEntry('carousell');
  const importedCookies = importedCookieEntry?.cookies ?? getSourceCookies('carousell') ?? [];
  const cookieProvider = normalizeProvider(session?.loggedInAs ?? (importedCookies.length > 0 ? 'imported' : null));
  const fallbackSession = session ?? (importedCookies.length > 0 ? {
    source: 'carousell',
    cookies: importedCookies,
    localStorage: {},
    userAgent: importedCookieEntry?.entry.userAgent ?? pickUA(),
    loggedInAs: 'imported',
    capturedAt: importedCookieEntry?.entry.createdAt ?? new Date().toISOString(),
    expiresAt: null,
    isValid: importedCookieEntry?.entry.isValid ?? true
  } satisfies StoredSession : null);
  const mergedCookies = [
    ...(session?.cookies ?? []),
    ...importedCookies
  ] as SessionCookie[];

  if (mergedCookies.length === 0) {
    return {
      listings: [],
      responseStatus: null,
      rawLength: 0,
      warnings: ['Carousell: no cookies. Connect Account or paste fresh cookies in Sources.'],
      runtimeDiagnostics: buildDiagnostics('browser', 'no_session', null, cookieProvider)
    };
  }

  if (!hasAuthCookies(mergedCookies)) {
    if (session) {
      invalidateSession('carousell', { recapture: true });
    }
    return {
      listings: [],
      responseStatus: 401,
      rawLength: 0,
      warnings: ['Carousell: saved cookies are missing auth tokens. Reconnect or paste fresh cookies.'],
      runtimeDiagnostics: buildDiagnostics('browser', 'auth_failed', session ? 'invalidate_session' : null, cookieProvider)
    };
  }

  const authCookies = mergedCookies
    .filter((cookie) => AUTH_COOKIE_PATTERNS.some((pattern) => cookie.name.toLowerCase().includes(pattern.toLowerCase())))
    .map((cookie) => cookie.name);
  console.log(`[Carousell] Using JWT cookies: ${authCookies.join(', ') || 'none detected'}`);

  try {
    const result = await crawlCarousellWithMeta(query, mergedCookies);
    const shouldFallback = result.listings.length === 0
      && (result.responseStatus === 401
        || result.responseStatus === 403
        || result.challengeDetected
        || result.warnings.some((warning) => /blocked|403|challenge|cloudflare/i.test(warning)));

    const finalResult = shouldFallback
      ? await fetchViaBrowserFallback(query, fallbackSession).then((fallback) => ({
          ...fallback,
          warnings: fallback.listings.length > 0
            ? ['Carousell recovered with direct browser fallback after Crawlee block.', ...fallback.warnings]
            : fallback.warnings
        }))
      : {
          listings: result.listings,
          responseStatus: result.responseStatus,
          rawLength: result.html.length,
          warnings: result.warnings,
          runtimeDiagnostics: buildDiagnostics(
            'browser',
            result.listings.length === 0 ? (result.challengeDetected ? 'cloudflare_blocked' : 'empty_search') : null,
            'crawlee_playwright',
            cookieProvider
          )
        };

    if (importedCookieEntry?.entry.id) {
      if (finalResult.listings.length > 0) {
        markCookiePoolEntrySuccess(importedCookieEntry.entry.id);
      } else if (finalResult.responseStatus === 401 || finalResult.responseStatus === 403) {
        markCookiePoolEntryFailure(importedCookieEntry.entry.id, `Carousell HTTP ${finalResult.responseStatus}`);
      }
    }

    return finalResult;
  } catch (error) {
    if (importedCookieEntry?.entry.id) {
      markCookiePoolEntryFailure(importedCookieEntry.entry.id, error instanceof Error ? error.message : String(error));
    }
    return {
      listings: [],
      responseStatus: null,
      rawLength: 0,
      warnings: [error instanceof Error ? error.message : String(error)],
      runtimeDiagnostics: buildDiagnostics('browser', 'request_failed', 'crawlee_playwright', cookieProvider)
    };
  }
}
