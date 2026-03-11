import { load } from 'cheerio';
import { detectBrand } from '@avito-monitor/shared';
import type { ParseResult, ParsedListingCandidate } from './types';
import { toUsd } from '../lib/antiBan';
import { detectVertical } from '../services/verticalDetector';

interface MercariApiBrand {
  name?: string;
  subName?: string;
}

interface MercariApiPhoto {
  uri?: string;
}

interface MercariApiItem {
  id?: string;
  name?: string;
  price?: string | number;
  created?: string | number;
  updated?: string | number;
  thumbnails?: string[];
  photos?: MercariApiPhoto[];
  itemBrand?: MercariApiBrand | null;
  shopName?: string;
}

export interface MercariSearchPayload {
  items?: MercariApiItem[];
}

function absoluteUrl(candidate: string | null | undefined, baseUrl: string): string | null {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

function canonicalizeListingUrl(input: string): string {
  const parsed = new URL(input);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function textOrNull(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function parsePriceValue(priceText: string | null): number | null {
  if (!priceText) {
    return null;
  }

  const digits = priceText.replace(/[^\d]/g, '');
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

function extractExternalId(url: string): string | null {
  const match = url.match(/\/item\/(m\d+)|\/shops\/product\/([A-Za-z0-9]+)/);
  return match?.[1] ?? match?.[2] ?? null;
}

function detectSellerType(url: string): 'private' | 'business' | 'unknown' {
  if (url.includes('/shops/product/')) {
    return 'business';
  }
  if (url.includes('/item/')) {
    return 'private';
  }
  return 'unknown';
}

function collectImages($: ReturnType<typeof load>, item: ReturnType<ReturnType<typeof load>>): string[] {
  const seen = new Set<string>();
  const images: string[] = [];

  item.find('img').each((_, node) => {
    const src = $(node).attr('src') ?? $(node).attr('data-src') ?? null;
    if (!src || seen.has(src)) {
      return;
    }
    seen.add(src);
    images.push(src);
  });

  return images.slice(0, 2);
}

function getLargeImageUrl(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl) return thumbnailUrl;
  return thumbnailUrl
    .replace('https://static.mercdn.net/item/', 'https://static.mercdn.net/thumb/item/')
    .replace(/w=\d+/g, 'w=600')
    .replace(/w!\d+,h!\d+/g, 'w!600,h!800')
    .replace(/c!\d+,\d+/g, 'c!600,800')
    .replace('c!300,300', 'c!600,800')
    .replace('c!240,240', 'c!600,800')
    .replace('w!300,300', 'w!600,h!800')
    .replace('w!240,240', 'w!600,h!800');
}

function toIsoTimestamp(value: string | number | undefined): string | null {
  if (typeof value === 'number') {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === 'string') {
    const numeric = Number.parseInt(value, 10);
    if (Number.isFinite(numeric)) {
      const ms = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
      return new Date(ms).toISOString();
    }
  }

  return null;
}

function buildMercariListingUrl(id: string): string {
  return `https://jp.mercari.com/item/${id}`;
}

function parseMercariApiItem(item: MercariApiItem): ParsedListingCandidate | null {
  const externalId = item.id?.trim() ?? '';
  const title = item.name?.trim() ?? '';
  if (!externalId || !title) {
    return null;
  }

  const priceValue = typeof item.price === 'number'
    ? item.price
    : Number.parseInt(String(item.price ?? '').replace(/[^\d]/g, ''), 10);
  const normalizedPrice = Number.isFinite(priceValue) ? priceValue : null;
  const url = buildMercariListingUrl(externalId);
  const postedAt = toIsoTimestamp(item.created) ?? toIsoTimestamp(item.updated);
  const brand = item.itemBrand?.subName ?? item.itemBrand?.name ?? null;
  const imageCandidates = [
    item.photos?.[0]?.uri,
    item.thumbnails?.[0]
  ].filter((candidate): candidate is string => Boolean(candidate));

  return {
    source: 'mercari_jp',
    externalId,
    title,
    description: title,
    category: null,
    priceText: normalizedPrice !== null ? `¥ ${normalizedPrice.toLocaleString('ja-JP')}` : null,
    priceValueOptional: normalizedPrice,
    currencyTextOptional: 'JPY',
    priceOriginal: normalizedPrice,
    currencyOriginal: 'JPY',
    priceUsd: normalizedPrice !== null ? toUsd(normalizedPrice, 'JPY') : null,
    url,
    canonicalUrl: canonicalizeListingUrl(url),
    locationText: null,
    sellerType: item.shopName ? 'business' : 'private',
    imageUrl1: imageCandidates[0] ?? null,
    imageUrl2: imageCandidates[1] ?? null,
    publishedTextOptional: postedAt,
    postedAt,
    brandDetected: brand ?? detectBrand(title),
    vertical: detectVertical(title),
    raw: item as Record<string, unknown>
  };
}

export function parseMercariSearchPayload(payload: MercariSearchPayload): ParsedListingCandidate[] {
  return (payload.items ?? [])
    .map((item) => parseMercariApiItem(item))
    .filter(Boolean) as ParsedListingCandidate[];
}

export function parseMercariSearchHtml(html: string, baseUrl: string): ParseResult {
  const $ = load(html);
  const selectorHits: Record<string, number> = {};
  const selectorsAttempted = ['[data-testid="item-cell"]', 'a[data-testid="thumbnail-link"]', 'a[href*="/item/"]', 'a[href*="/shops/product/"]'];
  const cards = $('[data-testid="item-cell"]').toArray();
  selectorHits['[data-testid="item-cell"]'] = cards.length;
  selectorHits['a[data-testid="thumbnail-link"]'] = $('a[data-testid="thumbnail-link"]').length;
  selectorHits['a[href*="/item/"]'] = $('a[href*="/item/"]').length;
  selectorHits['a[href*="/shops/product/"]'] = $('a[href*="/shops/product/"]').length;

  const listings = new Map<string, ParsedListingCandidate>();

  const cardElements = cards.length > 0
    ? cards
    : [...$('a[href*="/item/"]').map((_, element) => $(element).closest('li').get(0) ?? element).get(),
      ...$('a[href*="/shops/product/"]').map((_, element) => $(element).closest('li').get(0) ?? element).get()];

  for (const element of cardElements) {
    const item = $(element);
    const link = item.is('a')
      ? item
      : item.find('a[data-testid="thumbnail-link"]').first().length > 0
        ? item.find('a[data-testid="thumbnail-link"]').first()
        : item.find('a[href*="/item/"], a[href*="/shops/product/"]').first();
    const href = absoluteUrl(link.attr('href'), baseUrl);
    const title = textOrNull(item.find('[data-testid="thumbnail-item-name"]').first().text())
      ?? textOrNull(link.attr('aria-label'))
      ?? textOrNull(link.find('[data-testid="thumbnail-item-name"]').first().text())
      ?? textOrNull(item.text());

    if (!href || !title) {
      continue;
    }

    const externalId = extractExternalId(href);
    if (!externalId) {
      continue;
    }

    const imageCandidates = collectImages($, item)
      .map((image) => getLargeImageUrl(absoluteUrl(image, baseUrl)))
      .filter(Boolean) as string[];
    const currency = textOrNull(item.find('[class*="currency"]').first().text());
    const normalizedCurrency = currency === '¥' ? 'JPY' : (currency ?? 'JPY');
    const amount = textOrNull(item.find('[class*="number"]').first().text());
    const priceText = textOrNull([currency, amount].filter(Boolean).join(' '));
    const priceValue = parsePriceValue(priceText);
    const detectedBrand = detectBrand(title);
    const vertical = detectVertical(title);

    listings.set(externalId, {
      source: 'mercari_jp',
      externalId,
      title,
      description: title,
      category: null,
      priceText,
      priceValueOptional: priceValue,
      currencyTextOptional: normalizedCurrency,
      priceOriginal: priceValue,
      currencyOriginal: normalizedCurrency,
      priceUsd: priceValue !== null ? toUsd(priceValue, normalizedCurrency) : null,
      url: href,
      canonicalUrl: canonicalizeListingUrl(href),
      locationText: null,
      sellerType: detectSellerType(href),
      imageUrl1: imageCandidates[0] ?? null,
      imageUrl2: imageCandidates[1] ?? null,
      publishedTextOptional: null,
      postedAt: null,
      brandDetected: detectedBrand,
      vertical,
      raw: {
        strategy: 'mercari_dom',
        href,
        title,
        priceText,
        htmlSnippet: item.html()?.slice(0, 600) ?? null
      }
    });
  }

  const warnings: string[] = [];
  let suspectedReason: string | null = null;

  if (listings.size === 0) {
    warnings.push('Mercari DOM does not contain ready item-cell cards.');
    suspectedReason = 'Mercari did not return recognizable listing cards.';
  }

  return {
    listings: [...listings.values()],
    diagnostics: {
      pageTitle: textOrNull($('title').first().text()),
      selectorsAttempted,
      selectorHits,
      cardsFound: cards.length,
      jsonLdCount: $('script[type="application/ld+json"]').length,
      embeddedJsonCount: $('script').length,
      strategiesUsed: listings.size > 0 ? ['mercari_dom'] : [],
      warnings,
      suspectedReason,
      sampleTitles: [...listings.values()].slice(0, 5).map((listing) => listing.title)
    }
  };
}
