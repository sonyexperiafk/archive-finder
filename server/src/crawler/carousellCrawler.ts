import fs from 'node:fs/promises';
import path from 'node:path';
import { PlaywrightCrawler } from 'crawlee';
import { parseCarousellSearchHtml } from '../parser/carousell';
import type { ParsedListingCandidate } from '../parser/types';
import type { SessionCookie } from '../services/sessionManager';
import { getProxyUrl } from '../lib/proxyFetch';

const BASE_URL = 'https://www.carousell.com.my';

export interface CarousellCrawlerResult {
  listings: ParsedListingCandidate[];
  pageTitle: string | null;
  finalUrl: string;
  html: string;
  warnings: string[];
  strategiesUsed: string[];
  responseStatus: number | null;
  challengeDetected: boolean;
}

function buildSearchUrl(query: string): string {
  return `${BASE_URL}/search/${encodeURIComponent(query)}/?sort_by=time_created&include_nearby_suggestion=1`;
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

function normalizeCookie(cookie: SessionCookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain?.startsWith('.') ? cookie.domain : cookie.domain ? `.${cookie.domain}` : '.carousell.com.my',
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

export async function crawlCarousell(query: string, cookies: SessionCookie[] = []): Promise<ParsedListingCandidate[]> {
  const result = await crawlCarousellWithMeta(query, cookies);
  return result.listings;
}

export async function crawlCarousellWithMeta(query: string, cookies: SessionCookie[] = []): Promise<CarousellCrawlerResult> {
  await ensureCrawleeStorage();
  const targetUrl = buildSearchUrl(query);
  const result: CarousellCrawlerResult = {
    listings: [],
    pageTitle: null,
    finalUrl: targetUrl,
    html: '',
    warnings: [],
    strategiesUsed: [],
    responseStatus: null,
    challengeDetected: false
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
    async requestHandler({ page, request }) {
      const url = typeof request.userData.targetUrl === 'string' ? request.userData.targetUrl : targetUrl;

      if (cookies.length > 0) {
        await page.context().addCookies(cookies.map((cookie) => normalizeCookie(cookie)));
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
      const bodyText = (await page.textContent('body')) ?? '';
      result.challengeDetected = /just a moment|verifying you are human|challenge-platform|attention required/i.test(bodyText);
      result.listings = parseCarousellSearchHtml(result.html);
      result.strategiesUsed = ['carousell_dom_cards'];

      if (result.challengeDetected) {
        result.warnings.push('Carousell Cloudflare challenge detected in browser session.');
      }
      if (result.listings.length === 0) {
        result.warnings.push('Carousell hydrated page returned 0 extractable listings.');
      }
    },
    failedRequestHandler({ request, error }) {
      const message = error instanceof Error ? error.message : 'unknown error';
      result.warnings.push(`Carousell request failed for ${request.url}: ${message}`);
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
