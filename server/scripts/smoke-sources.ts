import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { fetchAvitoSearch } from '../src/parser/avito.js';
import { fetchCarousellSearch } from '../src/parser/carousell.js';
import { fetchKufarSearch } from '../src/parser/kufar.js';
import { parseMercariSearchHtml, parseMercariSearchPayload, type MercariSearchPayload } from '../src/parser/mercari.js';
import { fetchRakumaSearch } from '../src/parser/rakuma.js';
import { fetchVintedSearch } from '../src/parser/vinted.js';
import { getSourceCookieEntry } from '../src/lib/cookieStore.js';
import { BrowserService } from '../src/services/browser.js';
import { getStoredSession } from '../src/services/sessionManager.js';

type SmokeResult = {
  source: string;
  status: number | null;
  count: number;
  warnings: string[];
  cookieState: string;
  sample: Array<{ title: string; price: string | null; postedAt: string | null }>;
};

function sampleItems(items: Array<{ title: string; priceText: string | null; postedAt?: string | null }>): SmokeResult['sample'] {
  return items.slice(0, 3).map((item) => ({
    title: item.title,
    price: item.priceText,
    postedAt: item.postedAt ?? null
  }));
}

function renderSample(result: SmokeResult): string[] {
  if (result.sample.length === 0) {
    return ['  - no sample items'];
  }

  return result.sample.map((item) => `  - ${item.title} | ${item.price ?? 'n/a'} | ${item.postedAt ?? 'unknown age'}`);
}

function sessionState(source: 'avito' | 'carousell' | 'vinted' | 'mercari_jp' | 'kufar' | 'rakuma'): string {
  const session = getStoredSession(source);
  const cookiePool = getSourceCookieEntry(source);

  if (session) {
    return `session:${session.isValid ? 'valid' : 'invalid'} cookies=${session.cookies.length}`;
  }

  if (cookiePool) {
    return `cookie-pool:${cookiePool.entry.isValid ? 'valid' : 'invalid'} cookies=${cookiePool.cookies.length}`;
  }

  return 'guest/no cookies';
}

async function probeMercari(query: string): Promise<SmokeResult> {
  const browser = new BrowserService();
  const url = `https://jp.mercari.com/search?keyword=${encodeURIComponent(query)}&status=on_sale&sort=created_time&order=desc`;
  const selectors = ['[data-testid="item-cell"]', 'a[data-testid="thumbnail-link"]', 'a[href*="/item/"]'];

  try {
    const fetchResult = await browser.fetchRenderedPage(url, selectors, {
      captureResponseUrls: ['api.mercari.jp/v2/entities:search']
    });

    const apiResponse = fetchResult.capturedResponses.find(
      (response) => response.url.includes('api.mercari.jp/v2/entities:search') && response.status === 200 && response.body
    );

    const listings = apiResponse?.body
      ? parseMercariSearchPayload(JSON.parse(apiResponse.body) as MercariSearchPayload)
      : parseMercariSearchHtml(fetchResult.html, fetchResult.finalUrl || url).listings;

    return {
      source: 'mercari_jp',
      status: apiResponse?.status ?? fetchResult.status,
      count: listings.length,
      warnings: apiResponse ? [] : ['Mercari API payload not captured, used DOM render fallback.'],
      cookieState: sessionState('mercari_jp'),
      sample: sampleItems(listings)
    };
  } catch (error) {
    return {
      source: 'mercari_jp',
      status: null,
      count: 0,
      warnings: [error instanceof Error ? error.message : String(error)],
      cookieState: sessionState('mercari_jp'),
      sample: []
    };
  } finally {
    await browser.shutdown().catch(() => undefined);
  }
}

async function main() {
  const query = process.env.SMOKE_QUERY ?? 'Rick Owens';
  const startedAt = new Date().toISOString();
  const results: SmokeResult[] = [];

  const add = async (runner: () => Promise<SmokeResult>) => {
    results.push(await runner());
  };

  await add(async () => {
    const result = await fetchKufarSearch(query);
    return {
      source: 'kufar',
      status: result.responseStatus,
      count: result.listings.length,
      warnings: result.warnings,
      cookieState: sessionState('kufar'),
      sample: sampleItems(result.listings)
    };
  });

  await add(async () => {
    const result = await fetchRakumaSearch(query);
    return {
      source: 'rakuma',
      status: result.responseStatus,
      count: result.listings.length,
      warnings: result.warnings,
      cookieState: sessionState('rakuma'),
      sample: sampleItems(result.listings)
    };
  });

  await add(async () => {
    const result = await fetchVintedSearch(query);
    return {
      source: 'vinted',
      status: result.responseStatus,
      count: result.listings.length,
      warnings: result.warnings,
      cookieState: sessionState('vinted'),
      sample: sampleItems(result.listings)
    };
  });

  await add(async () => {
    const result = await fetchAvitoSearch(query);
    return {
      source: 'avito',
      status: result.responseStatus,
      count: result.listings.length,
      warnings: result.warnings,
      cookieState: sessionState('avito'),
      sample: sampleItems(result.listings)
    };
  });

  await add(async () => {
    const result = await fetchCarousellSearch(query);
    return {
      source: 'carousell',
      status: result.responseStatus,
      count: result.listings.length,
      warnings: result.warnings,
      cookieState: sessionState('carousell'),
      sample: sampleItems(result.listings)
    };
  });

  await add(() => probeMercari(query));

  const lines = [
    `Archive Finder smoke report`,
    `Started: ${startedAt}`,
    `Query: ${query}`,
    '',
    ...results.flatMap((result) => [
      `[${result.source}] status=${result.status ?? 'n/a'} count=${result.count} cookies=${result.cookieState}`,
      ...result.warnings.map((warning) => `  ! ${warning}`),
      ...renderSample(result),
      ''
    ])
  ];

  const reportPath = path.join(config.dataRoot, 'release-smoke.txt');
  await fs.mkdir(config.dataRoot, { recursive: true });
  await fs.writeFile(reportPath, `${lines.join('\n').trim()}\n`, 'utf8');
  console.log(reportPath);
  process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
