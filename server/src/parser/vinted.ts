import { detectBrand } from '@avito-monitor/shared';
import { load } from 'cheerio';
import type { ParsedListingCandidate } from './types';
import { apiHeaders, browserHeaders, getSourceUA, humanDelay, isBlocked, toUsd } from '../lib/antiBan';
import { getSourceCookieEntry, markCookiePoolEntryFailure, markCookiePoolEntrySuccess } from '../lib/cookieStore';
import { proxyFetch } from '../lib/proxyFetch';
import { cookiesToHeader, getStoredSession, invalidateSession } from '../services/sessionManager';
import { parseListingAge } from '../services/listingAge';

export const VINTED_QUERIES = [
  'Rick Owens',
  'Yohji Yamamoto',
  'Comme des Garcons',
  'Maison Margiela',
  'Helmut Lang',
  'Ann Demeulemeester',
  'Raf Simons',
  'Julius',
  'Undercover',
  'Number Nine',
  'Carol Christian Poell',
  'Boris Bidjan Saberi',
  'Guidi',
  'Alexander McQueen',
  'Vivienne Westwood',
  'Haider Ackermann',
  'Issey Miyake',
  'Junya Watanabe',
  'archive jacket',
  'archive coat',
  'designer leather jacket',
  'avant garde jacket'
] as const;

interface VintedThumbnail {
  type?: string;
  url?: string;
  width?: number;
}

interface VintedHighResolution {
  url?: string;
  timestamp?: number | string;
}

interface VintedPhoto {
  url?: string;
  full_size_url?: string;
  high_resolution?: VintedHighResolution;
  thumbnails?: VintedThumbnail[];
  is_main?: boolean;
  timestamp?: number | string;
}

interface VintedPrice {
  amount?: string | number;
  currency_code?: string;
}

interface VintedTotalPrice {
  amount?: string;
  currency_code?: string;
}

interface VintedConversion {
  seller_price?: string | number;
  seller_currency?: string;
}

export interface VintedItem {
  id?: number | string;
  title?: string;
  price?: string | number | VintedPrice;
  currency?: string;
  conversion?: VintedConversion;
  url?: string;
  path?: string;
  photo?: VintedPhoto;
  photos?: VintedPhoto[];
  brand_title?: string;
  created_at_ts?: number;
  created_at?: string;
  updated_at?: string;
  price_numeric?: number;
  currency_code?: string;
  total_item_price?: VintedTotalPrice;
  size_title?: string;
  status?: string;
}

interface VintedPayload {
  items?: VintedItem[];
}

export interface VintedFetchResult {
  listings: ParsedListingCandidate[];
  responseStatus: number | null;
  rawLength: number;
  warnings: string[];
}

function parseNumeric(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractVintedMoney(item: VintedItem | Record<string, unknown>): { price: number | null; currency: string | null } {
  const candidate = item as VintedItem;
  if (candidate.total_item_price?.amount) {
    return {
      price: parseNumeric(candidate.total_item_price.amount),
      currency: candidate.total_item_price.currency_code ?? candidate.currency_code ?? candidate.currency ?? candidate.conversion?.seller_currency ?? null
    };
  }

  if (typeof candidate.price_numeric === 'number') {
    return {
      price: candidate.price_numeric,
      currency: candidate.currency_code ?? candidate.currency ?? candidate.conversion?.seller_currency ?? null
    };
  }

  if (candidate.price && typeof candidate.price === 'object' && !Array.isArray(candidate.price)) {
    const price = parseNumeric(candidate.price.amount);
    const currency = candidate.price.currency_code ?? candidate.currency_code ?? candidate.currency ?? candidate.conversion?.seller_currency ?? null;
    return { price, currency };
  }

  const directPrice = parseNumeric(candidate.price as string | number | undefined);
  const directCurrency = candidate.currency_code ?? candidate.currency ?? null;
  if (directPrice !== null) {
    return { price: directPrice, currency: directCurrency };
  }

  return {
    price: parseNumeric(candidate.conversion?.seller_price),
    currency: candidate.conversion?.seller_currency ?? null
  };
}

export function formatVintedPriceText(price: number | null, currency: string | null): string | null {
  if (price === null || !currency) return null;
  if (currency === 'USD') return `$${price.toFixed(2)}`;
  return `${price.toFixed(2)} ${currency}`;
}

export function extractVintedImage(item: VintedItem | Record<string, unknown>): string | null {
  const candidate = item as VintedItem;
  const photo = candidate.photo ?? candidate.photos?.find((entry) => entry.is_main) ?? candidate.photos?.[0];
  if (!photo) return null;

  return photo.full_size_url
    ?? photo.high_resolution?.url
    ?? photo.thumbnails?.find((entry) => entry.type === 'thumb790x1052')?.url
    ?? photo.thumbnails?.find((entry) => entry.type === 'thumb624x428')?.url
    ?? photo.thumbnails?.find((entry) => entry.type === 'thumb430x573')?.url
    ?? photo.thumbnails?.[0]?.url
    ?? photo.url
    ?? null;
}

export function normalizeVintedItemUrl(item: Pick<VintedItem, 'url' | 'path' | 'id'>): string | null {
  if (item.url) return item.url.startsWith('http') ? item.url : `https://www.vinted.com${item.url}`;
  if (item.path) return item.path.startsWith('http') ? item.path : `https://www.vinted.com${item.path}`;
  return item.id ? `https://www.vinted.com/items/${item.id}` : null;
}

let session: { cookie: string; ua: string; ts: number } | null = null;
const vintedAgeCache = new Map<string, { postedAt: string | null; rawText: string | null; fetchedAt: number }>();

async function getSession(): Promise<{ cookie: string; ua: string }> {
  if (session && Date.now() - session.ts < 12 * 60 * 1000) {
    return session;
  }

  const ua = getSourceUA('vinted');
  try {
    const response = await proxyFetch('https://www.vinted.com/', {
      headers: browserHeaders(ua, undefined, { acceptLanguage: 'en-US,en;q=0.9' }),
      timeout: 10000,
      redirect: 'follow'
    });

    const raw = response.headers.get('set-cookie') ?? '';
    const cookieParts = raw
      .split(/,(?=\s*[\w-]+=)/)
      .map((entry) => entry.split(';')[0]?.trim())
      .filter((entry): entry is string => Boolean(entry && entry.includes('=')));
    const cookie = cookieParts.join('; ');

    session = { cookie, ua, ts: Date.now() };
    return session;
  } catch {
    return { cookie: '', ua };
  }
}

function parseVintedItem(item: VintedItem): ParsedListingCandidate | null {
  const externalId = item.id ? String(item.id) : null;
  const title = (item.title ?? '').trim();
  if (!externalId || !title) return null;

  const { price, currency } = extractVintedMoney(item);
  const postedAt = extractVintedPostedAt(item);
  const url = normalizeVintedItemUrl(item);
  if (!url) return null;

  return {
    source: 'vinted',
    externalId,
    title,
    description: title,
    priceText: formatVintedPriceText(price, currency),
    priceValueOptional: price,
    currencyTextOptional: currency,
    priceOriginal: price,
    currencyOriginal: currency,
    priceUsd: price !== null && currency ? toUsd(price, currency) : null,
    url,
    canonicalUrl: url,
    locationText: null,
    sellerType: 'unknown',
    imageUrl1: extractVintedImage(item),
    imageUrl2: null,
    publishedTextOptional: postedAt,
    postedAt,
    brandDetected: item.brand_title ?? detectBrand(title),
    vertical: 'fashion',
    raw: item as Record<string, unknown>
  };
}

function timestampToIso(value: number | string | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toISOString();
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && /^\d{10,13}$/.test(trimmed)) {
    const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return new Date(timestamp).toISOString();
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function extractPhotoTimestamp(photo: VintedPhoto | null | undefined): number | null {
  const direct = photo?.timestamp;
  const hiRes = photo?.high_resolution?.timestamp;
  const candidate = typeof direct === 'number' || typeof direct === 'string'
    ? direct
    : hiRes;

  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return candidate > 1_000_000_000_000 ? candidate : candidate * 1000;
  }

  if (typeof candidate === 'string') {
    const parsed = Number.parseInt(candidate, 10);
    if (Number.isFinite(parsed)) {
      return parsed > 1_000_000_000_000 ? parsed : parsed * 1000;
    }
  }

  return null;
}

function extractVintedPostedAt(item: VintedItem): string | null {
  const explicit = timestampToIso(item.created_at_ts)
    ?? timestampToIso(item.created_at)
    ?? timestampToIso(item.updated_at);
  if (explicit) {
    return explicit;
  }

  const photoTimestamps = [
    extractPhotoTimestamp(item.photo),
    ...(item.photos ?? []).map((photo) => extractPhotoTimestamp(photo))
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (photoTimestamps.length === 0) {
    return null;
  }

  const freshest = Math.max(...photoTimestamps);
  return new Date(freshest).toISOString();
}

function extractUploadedAgeText(html: string): string | null {
  const bodyText = load(html)('body').text().replace(/\s+/g, ' ').trim();
  if (!bodyText) return null;

  const patterns = [
    /Uploaded\s*(just now|today(?:\s+\d{1,2}:\d{2})?|yesterday(?:\s+\d{1,2}:\d{2})?|[0-9]+\s+\w+\s+ago)/i,
    /Updated\s*(just now|today(?:\s+\d{1,2}:\d{2})?|yesterday(?:\s+\d{1,2}:\d{2})?|[0-9]+\s+\w+\s+ago)/i
  ];

  for (const pattern of patterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

async function enrichVintedListingAge(
  listing: ParsedListingCandidate,
  ua: string,
  cookieHeader: string
): Promise<ParsedListingCandidate> {
  if (listing.postedAt) {
    return listing;
  }

  const cacheKey = listing.externalId ?? listing.url;
  const cached = vintedAgeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
    return {
      ...listing,
      postedAt: cached.postedAt ?? listing.postedAt ?? null,
      publishedTextOptional: cached.rawText ?? listing.publishedTextOptional ?? null
    };
  }

  try {
    const response = await proxyFetch(listing.url, {
      headers: browserHeaders(ua, 'https://www.vinted.com/', {
        cookie: cookieHeader,
        acceptLanguage: 'en-US,en;q=0.9',
        secFetchSite: 'same-origin'
      }),
      timeout: 12000,
      redirect: 'follow'
    });
    const html = await response.text();
    if (!response.ok || isBlocked(html, response.status)) {
      return listing;
    }

    const rawText = extractUploadedAgeText(html);
    if (!rawText) {
      return listing;
    }

    const parsed = parseListingAge(rawText);
    vintedAgeCache.set(cacheKey, {
      postedAt: parsed.postedAt,
      rawText,
      fetchedAt: Date.now()
    });

    return {
      ...listing,
      postedAt: parsed.postedAt ?? listing.postedAt ?? null,
      publishedTextOptional: rawText
    };
  } catch {
    return listing;
  }
}

async function enrichVintedListingAges(
  listings: ParsedListingCandidate[],
  ua: string,
  cookieHeader: string
): Promise<{ listings: ParsedListingCandidate[]; unresolved: number }> {
  const output = [...listings];
  const unknownIndexes = output
    .map((listing, index) => ({ listing, index }))
    .filter(({ listing }) => !listing.postedAt)
    .slice(0, 24);

  for (let offset = 0; offset < unknownIndexes.length; offset += 4) {
    const chunk = unknownIndexes.slice(offset, offset + 4);
    const enriched = await Promise.all(chunk.map(({ listing }) => enrichVintedListingAge(listing, ua, cookieHeader)));
    for (const [index, item] of chunk.entries()) {
      output[item.index] = enriched[index] ?? output[item.index]!;
    }
  }

  return {
    listings: output,
    unresolved: output.filter((listing) => !listing.postedAt).length
  };
}

async function requestVintedCatalog(
  query: string,
  auth: { cookieHeader: string; accessToken: string | null; ua: string }
): Promise<VintedFetchResult> {
  const url = new URL('https://www.vinted.com/api/v2/catalog/items');
  url.searchParams.set('search_text', query);
  url.searchParams.set('per_page', '96');
  url.searchParams.set('order', 'newest_first');
  url.searchParams.set('is_for_swap', 'false');
  url.searchParams.set('currency', 'EUR');

  const response = await proxyFetch(url.toString(), {
    headers: apiHeaders(auth.ua, 'https://www.vinted.com/', {
      cookie: auth.cookieHeader,
      acceptLanguage: 'en-US,en;q=0.9',
      extra: {
        'X-Vinted-App-Version': '24.12.1',
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {})
      }
    }),
    timeout: 15000
  });

  const rawText = await response.text();
  if (response.status === 401 || response.status === 403) {
    return {
      listings: [],
      responseStatus: response.status,
      rawLength: rawText.length,
      warnings: [`Vinted ${response.status} - authorization rejected`]
    };
  }

  if (isBlocked(rawText, response.status)) {
    return {
      listings: [],
      responseStatus: response.status,
      rawLength: rawText.length,
      warnings: ['Vinted looks blocked or challenged.']
    };
  }

  if (!response.ok) {
    return {
      listings: [],
      responseStatus: response.status,
      rawLength: rawText.length,
      warnings: [`Vinted HTTP ${response.status}`]
    };
  }

  let data: VintedPayload;
  try {
    data = JSON.parse(rawText) as VintedPayload;
  } catch {
    return {
      listings: [],
      responseStatus: response.status,
      rawLength: rawText.length,
      warnings: ['Vinted response not JSON']
    };
  }

  const parsedListings = (data.items ?? [])
    .map((item) => parseVintedItem(item))
    .filter(Boolean) as ParsedListingCandidate[];

  const { listings, unresolved } = await enrichVintedListingAges(parsedListings, auth.ua, auth.cookieHeader);
  const warnings = unresolved > 0
    ? [`Vinted age enrichment unresolved for ${unresolved} listings.`]
    : [];

  return {
    listings,
    responseStatus: response.status,
    rawLength: rawText.length,
    warnings
  };
}

export async function fetchVintedSearch(query: string): Promise<VintedFetchResult> {
  const storedSession = getStoredSession('vinted');
  const importedCookieEntry = getSourceCookieEntry('vinted');
  const autoSession = await getSession();
  const storedAuth = storedSession ? {
    cookieHeader: cookiesToHeader(storedSession.cookies),
    accessToken: storedSession.cookies.find((cookie) => cookie.name === 'access_token_web')?.value ?? null,
    ua: storedSession.userAgent || autoSession.ua || getSourceUA('vinted')
  } : null;
  const importedAuth = importedCookieEntry ? {
    cookieHeader: cookiesToHeader(importedCookieEntry.cookies),
    accessToken: importedCookieEntry.cookies.find((cookie) => cookie.name === 'access_token_web')?.value ?? null,
    ua: importedCookieEntry.entry.userAgent || autoSession.ua || getSourceUA('vinted')
  } : null;
  const autoAuth = {
    cookieHeader: autoSession.cookie,
    accessToken: null,
    ua: autoSession.ua || getSourceUA('vinted')
  };
  await humanDelay(1_000, 2_500);

  try {
    const primary = storedAuth ?? importedAuth ?? autoAuth;
    let result = await requestVintedCatalog(query, primary);

    if ((result.responseStatus === 401 || result.responseStatus === 403) && storedAuth) {
      invalidateSession('vinted', { recapture: true });
      session = null;
      result = await requestVintedCatalog(query, importedAuth ?? autoAuth);
      if ((result.responseStatus === 401 || result.responseStatus === 403) && importedCookieEntry?.entry.id) {
        markCookiePoolEntryFailure(importedCookieEntry.entry.id, `Vinted HTTP ${result.responseStatus}`);
      }
      if (result.responseStatus !== 401 && result.responseStatus !== 403) {
        if (importedCookieEntry?.entry.id) {
          markCookiePoolEntrySuccess(importedCookieEntry.entry.id);
        }
        return {
          ...result,
          warnings: [...result.warnings, 'Vinted recovered with guest session fallback.']
        };
      }
      return {
        ...result,
        warnings: [`Vinted ${result.responseStatus} - session will refresh`]
      };
    }

    if (importedCookieEntry?.entry.id && result.responseStatus !== 401 && result.responseStatus !== 403 && result.listings.length > 0) {
      markCookiePoolEntrySuccess(importedCookieEntry.entry.id);
    }

    return result;
  } catch (error) {
    session = null;
    if (importedCookieEntry?.entry.id) {
      markCookiePoolEntryFailure(importedCookieEntry.entry.id, error instanceof Error ? error.message : String(error));
    }
    return {
      listings: [],
      responseStatus: null,
      rawLength: 0,
      warnings: [String(error)]
    };
  }
}
