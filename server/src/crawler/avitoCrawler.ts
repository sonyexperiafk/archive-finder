import fs from 'node:fs/promises';
import path from 'node:path';
import { PlaywrightCrawler } from 'crawlee';
import type { StoredCookie } from '../lib/cookieStore';
import { getProxyUrl } from '../lib/proxyFetch';
import { parseAvitoSearchHtml } from '../parser/avito';
import type { ParsedListingCandidate } from '../parser/types';

export interface AvitoCrawlerResult {
  listings: ParsedListingCandidate[];
  pageTitle: string | null;
  finalUrl: string;
  html: string;
  warnings: string[];
  strategiesUsed: string[];
  selectorHits: Record<string, number>;
  responseStatus: number | null;
  statePreview: string | null;
  dataMarkers: string[];
}

function avitoSearchUrl(query: string): string {
  const url = new URL('https://www.avito.ru/rossiya/odezhda_obuv_aksessuary');
  url.searchParams.set('q', query);
  url.searchParams.set('s', '104');
  return url.toString();
}

function buildPlaywrightProxy() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return undefined;
  }

  const parsed = new URL(proxyUrl);
  return {
    server: `${parsed.protocol}//${parsed.host}`,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined
  };
}

function normalizeCookie(cookie: StoredCookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain?.startsWith('.') ? cookie.domain : cookie.domain ? `.${cookie.domain}` : '.avito.ru',
    path: cookie.path ?? '/',
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.secure ? 'None' : 'Lax'
  } as const;
}

async function ensureCrawleeStorage(): Promise<void> {
  const root = path.resolve(process.cwd(), 'storage');
  await Promise.all([
    fs.mkdir(path.join(root, 'request_queues', 'default'), { recursive: true }),
    fs.mkdir(path.join(root, 'key_value_stores', 'default'), { recursive: true }),
    fs.mkdir(path.join(root, 'datasets', 'default'), { recursive: true })
  ]);
}

export async function crawlAvito(query: string, cookies: StoredCookie[] = []): Promise<ParsedListingCandidate[]> {
  const result = await crawlAvitoWithMeta(query, cookies);
  return result.listings;
}

export async function crawlAvitoWithMeta(query: string, cookies: StoredCookie[] = []): Promise<AvitoCrawlerResult> {
  await ensureCrawleeStorage();
  const targetUrl = avitoSearchUrl(query);
  const result: AvitoCrawlerResult = {
    listings: [],
    pageTitle: null,
    finalUrl: targetUrl,
    html: '',
    warnings: [],
    strategiesUsed: [],
    selectorHits: {},
    responseStatus: null,
    statePreview: null,
    dataMarkers: []
  };

  const crawler = new PlaywrightCrawler({
    headless: true,
    retryOnBlocked: false,
    useSessionPool: true,
    persistCookiesPerSession: true,
    minConcurrency: 1,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 2,
    launchContext: {
      launchOptions: {
        proxy: buildPlaywrightProxy(),
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox'
        ]
      }
    },
    async requestHandler({ page, request, log }) {
      const url = typeof request.userData.targetUrl === 'string' ? request.userData.targetUrl : targetUrl;

      if (cookies.length > 0) {
        await page.context().addCookies(
          cookies
            .filter((cookie) => !cookie.domain || cookie.domain.includes('avito'))
            .map((cookie) => normalizeCookie(cookie))
        );
      }

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000
      }).catch(() => null);

      await page.waitForTimeout(2_000);
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);

      result.pageTitle = await page.title();
      result.finalUrl = page.url();
      result.responseStatus = response?.status() ?? 200;
      result.html = await page.content();
      result.statePreview = await page.evaluate(
        '(() => { const root = window.__INITIAL_STATE__ ?? window.__NEXT_DATA__ ?? null; try { return root ? JSON.stringify(root).slice(0, 500) : null; } catch { return "[unserializable state]"; } })()'
      );

      const markerMatches = [...result.html.matchAll(/data-marker="([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
      result.dataMarkers = [...new Set(markerMatches)].slice(0, 50);
      result.selectorHits['[data-marker="item"]'] = (result.html.match(/data-marker="item"/g) ?? []).length;

      const parsed = parseAvitoSearchHtml(result.html, result.finalUrl || url);
      result.listings = parsed.listings;
      result.strategiesUsed = parsed.diagnostics.strategiesUsed;

      if (result.listings.length === 0) {
        result.warnings.push('Avito hydrated page returned 0 extractable listings.');
        if (result.statePreview) {
          log.warning(`Avito state preview: ${result.statePreview}`);
        }
      }
    },
    failedRequestHandler({ request, error }) {
      const message = error instanceof Error ? error.message : 'unknown error';
      result.warnings.push(`Avito request failed for ${request.url}: ${message}`);
    }
  });

  await crawler.run([{
    url: targetUrl,
    uniqueKey: targetUrl,
    userData: {
      targetUrl
    }
  }]);
  await crawler.teardown();

  return result;
}
