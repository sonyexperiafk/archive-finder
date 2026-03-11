import { load } from 'cheerio';
import { detectBrand } from '@avito-monitor/shared';
import type { ParsedListingCandidate } from './types';
import { browserHeaders, getSourceUA, humanDelay, isBlocked } from '../lib/antiBan';
import { proxyFetch } from '../lib/proxyFetch';
import { toUsd } from '../lib/antiBan';

export const RAKUMA_QUERIES = [
  'アンダーカバー',
  'ナンバーナイン',
  'ヨウジヤマモト',
  'コムデギャルソン',
  'リックオウエンス',
  'ヘルムートラング',
  'マルタンマルジェラ',
  'ジュンヤワタナベ',
  'Undercover',
  'Number Nine',
  'Rick Owens',
  'Yohji Yamamoto',
  'ホースレザー ジャケット',
  'レザー ライダース',
  '本人期',
  '初期 アンダーカバー',
  'アーカイブ ジャケット'
] as const;

interface RakumaStub {
  externalId: string;
  title: string;
  price: number | null;
  brand: string | null;
  sellerType: 'private' | 'business' | 'unknown';
  url: string;
}

function parseRelativeRakumaTime(text: string): { raw: string | null; iso: string | null } {
  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(/(約?\s*\d+\s*(?:分|時間|日)前)/);
  if (!match) {
    return { raw: null, iso: null };
  }

  const valueMatch = match[1].match(/(\d+)\s*(分|時間|日)前/);
  if (!valueMatch) {
    return { raw: match[1], iso: null };
  }

  const value = Number.parseInt(valueMatch[1] ?? '', 10);
  if (!Number.isFinite(value)) {
    return { raw: match[1], iso: null };
  }

  const unit = valueMatch[2];
  const minutes = unit === '分' ? value : unit === '時間' ? value * 60 : value * 24 * 60;
  return {
    raw: match[1],
    iso: new Date(Date.now() - minutes * 60 * 1000).toISOString()
  };
}

function buildSearchUrl(query: string): string {
  return `https://fril.jp/search/${encodeURIComponent(query)}?order=desc&sort=created_at`;
}

function normalizeRakumaUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith('http') ? raw : `https://fril.jp${raw}`;
}

function parseSellerType(raw: string | undefined): 'private' | 'business' | 'unknown' {
  if (!raw) return 'unknown';
  if (raw.includes('一般')) return 'private';
  if (raw.includes('事業者')) return 'business';
  return 'unknown';
}

function parseSearchPage(html: string): RakumaStub[] {
  const $ = load(html);
  const items: RakumaStub[] = [];

  $('.item-box').each((_, element) => {
    const imageLink = $(element).find('a.link_search_image').first();
    const titleLink = $(element).find('a.link_search_title').first();
    const title = titleLink.find('span').first().text().trim() || imageLink.attr('data-rat-item_name')?.trim() || '';
    const itemIdAttr = imageLink.attr('data-rat-itemid') ?? titleLink.attr('data-rat-itemid') ?? '';
    const externalId = itemIdAttr.split('/').pop()?.trim() ?? '';
    const url = normalizeRakumaUrl(titleLink.attr('href') ?? imageLink.attr('href'));
    const rawPrice = imageLink.attr('data-rat-price') ?? titleLink.attr('data-rat-price') ?? '';
    const brand = $(element).find('.brand-name').first().text().trim() || null;
    const sellerType = parseSellerType(imageLink.attr('data-rat-sgenre') ?? titleLink.attr('data-rat-sgenre'));
    const price = rawPrice ? Number.parseFloat(rawPrice) : null;

    if (!externalId || !title || !url) return;

    items.push({
      externalId,
      title,
      price: Number.isFinite(price ?? NaN) ? price : null,
      brand,
      sellerType,
      url
    });
  });

  return items;
}

async function enrichRakumaStub(stub: RakumaStub, ua: string): Promise<ParsedListingCandidate> {
  let description = stub.title;
  let imageUrl: string | null = null;
  let brand = stub.brand;
  let publishedTextOptional: string | null = null;
  let postedAt: string | null = null;

  try {
    await humanDelay(300, 900);
    const response = await proxyFetch(stub.url, {
      headers: browserHeaders(ua, 'https://fril.jp/', {
        acceptLanguage: 'ja,en-US;q=0.9,en;q=0.8'
      }),
      timeout: 12000
    });

    if (response.ok) {
      const html = await response.text();
      if (!isBlocked(html, response.status)) {
        const $ = load(html);
        const posted = parseRelativeRakumaTime($.root().text());
        description = $('meta[name="description"]').attr('content')?.trim()
          ?? $('meta[property="og:description"]').attr('content')?.trim()
          ?? description;
        imageUrl = $('meta[property="og:image"]').attr('content')?.trim() ?? $('meta[name="twitter:image"]').attr('content')?.trim() ?? null;
        brand = $('meta[property="product:brand"]').attr('content')?.trim() ?? brand;
        publishedTextOptional = posted.raw;
        postedAt = posted.iso;
      }
    }
  } catch {
    // Keep the search-page stub when detail enrichment fails.
  }

  return {
    source: 'rakuma',
    externalId: stub.externalId,
    title: stub.title,
    description,
    priceText: stub.price !== null ? `¥${stub.price.toLocaleString('ja-JP')}` : null,
    priceValueOptional: stub.price,
    currencyTextOptional: 'JPY',
    priceOriginal: stub.price,
    currencyOriginal: 'JPY',
    priceUsd: stub.price !== null ? toUsd(stub.price, 'JPY') : null,
    url: stub.url,
    canonicalUrl: stub.url,
    locationText: null,
    sellerType: stub.sellerType,
    imageUrl1: imageUrl,
    imageUrl2: null,
    publishedTextOptional,
    postedAt,
    brandDetected: brand ?? detectBrand(stub.title),
    vertical: 'fashion',
    raw: {
      externalId: stub.externalId,
      title: stub.title,
      price: stub.price,
      brand,
      url: stub.url,
      publishedTextOptional
    }
  };
}

export async function fetchRakumaSearch(query: string): Promise<{
  listings: ParsedListingCandidate[];
  responseStatus: number | null;
  rawLength: number;
  warnings: string[];
}> {
  const url = buildSearchUrl(query);
  const ua = getSourceUA('rakuma');

  try {
    await humanDelay(1_000, 2_000);
    const response = await proxyFetch(url, {
      headers: browserHeaders(ua, 'https://fril.jp/', {
        acceptLanguage: 'ja,en-US;q=0.9,en;q=0.8'
      }),
      timeout: 12000
    });

    const rawText = await response.text();
    if (isBlocked(rawText, response.status)) {
      return {
        listings: [],
        responseStatus: response.status,
        rawLength: rawText.length,
        warnings: ['Rakuma returned a block page or CAPTCHA challenge.']
      };
    }

    if (!response.ok) {
      return {
        listings: [],
        responseStatus: response.status,
        rawLength: rawText.length,
        warnings: [`Rakuma HTTP ${response.status}`]
      };
    }

    const stubs = parseSearchPage(rawText).slice(0, 20);
    const listings: ParsedListingCandidate[] = [];
    for (const stub of stubs) {
      listings.push(await enrichRakumaStub(stub, ua));
    }

    return {
      listings,
      responseStatus: response.status,
      rawLength: rawText.length,
      warnings: []
    };
  } catch (error) {
    return {
      listings: [],
      responseStatus: null,
      rawLength: 0,
      warnings: [error instanceof Error ? error.message : 'Rakuma request failed']
    };
  }
}
