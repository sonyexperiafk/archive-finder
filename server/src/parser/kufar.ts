import { BRAND_BLACKLIST, detectBrand, type Vertical } from '@avito-monitor/shared';
import type { ParsedListingCandidate } from './types';
import { apiHeaders, getSourceUA, humanDelay, isBlocked, toUsd } from '../lib/antiBan';
import { proxyFetch } from '../lib/proxyFetch';

export const KUFAR_QUERIES = [
  'Rick Owens',
  'Yohji Yamamoto',
  'Comme des Garcons',
  'Maison Margiela',
  'Helmut Lang',
  'Alexander McQueen',
  'Balenciaga',
  'Givenchy',
  'куртка дизайнер',
  'пальто дизайнер',
  'винтаж куртка'
] as const;

interface KufarImage {
  id?: string;
  media_storage?: string;
  path?: string;
  thumbnails?: Array<{ rule?: string; url?: string }>;
  yams_storage?: boolean;
}

interface KufarParameter {
  p?: string;
  pl?: string;
  v?: string | number | boolean | Array<string | number>;
  vl?: string | string[] | null;
}

interface KufarAd {
  ad_id?: number | string;
  subject?: string;
  body?: string;
  price_byn?: number;
  price_usd?: number;
  ad_link?: string;
  category?: number | string;
  images?: KufarImage[];
  pics?: KufarImage[];
  photo?: KufarImage;
  image_url?: string;
  account?: { id?: string };
  list_time?: string;
  tag_item_region?: string;
  ad_parameters?: KufarParameter[];
}

export interface KufarFetchResult {
  listings: ParsedListingCandidate[];
  responseStatus: number | null;
  rawLength: number;
  warnings: string[];
}

let didLogPayloadShape = false;

export function buildKufarUrl(query: string, _vertical: Vertical = 'fashion'): string {
  const url = new URL('https://api.kufar.by/search-api/v2/search/rendered-paginated');
  url.searchParams.set('lang', 'ru');
  url.searchParams.set('query', query);
  url.searchParams.set('size', '20');
  url.searchParams.set('sort', 'lst.d');
  return url.toString();
}

function normalizeKufarImage(ad: KufarAd): KufarImage | null {
  if (ad.images?.length) return ad.images[0] ?? null;
  if (ad.pics?.length) return ad.pics[0] ?? null;
  if (ad.photo) return ad.photo;
  return null;
}

function extractKufarImage(ad: KufarAd): string | null {
  if (typeof ad.image_url === 'string' && ad.image_url.trim()) {
    return ad.image_url.trim();
  }

  const image = normalizeKufarImage(ad);
  if (!image) return null;

  if (image.thumbnails?.length) {
    const preferred = image.thumbnails.find((entry) => (entry.rule ?? '').includes('740') || (entry.rule ?? '').includes('800'))
      ?? image.thumbnails[image.thumbnails.length - 1];
    if (preferred?.url) return preferred.url;
  }

  if (image.path) {
    if (image.path.startsWith('http')) return image.path;
    const normalizedPath = image.path.startsWith('/') ? image.path.slice(1) : image.path;
    if ((image.media_storage ?? '').toLowerCase() === 'rms' || image.path.startsWith('adim')) {
      return `https://rms.kufar.by/v1/list_thumbs_2x/${normalizedPath}`;
    }
    return `https://yams.kufar.by/api/v1/kufar-ads/images/${image.id ?? '0000'}/image.jpg?rule=gallery`;
  }

  if (image.id) {
    return `https://yams.kufar.by/api/v1/kufar-ads/images/${image.id}/image.jpg?rule=gallery`;
  }

  return null;
}

function categoryText(ad: KufarAd): string {
  const categoryParameter = ad.ad_parameters?.find((entry) => entry.p === 'category');
  const raw = categoryParameter?.vl;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.join(' ');
  return '';
}

function looksFashionLike(ad: KufarAd): boolean {
  const category = categoryText(ad).toLowerCase();
  if (!category) return true;
  return /(одежд|обув|аксессуар|сумк|рюкзак|ремн|кошел|шарф|перчат|часы|украш)/.test(category);
}

function isKufarFashionAd(ad: KufarAd): boolean {
  const categoryValue = ad.category;
  if (categoryValue !== null && categoryValue !== undefined) {
    const categoryNumber = typeof categoryValue === 'string' ? Number.parseInt(categoryValue, 10) : categoryValue;
    if (Number.isFinite(categoryNumber) && Math.floor(categoryNumber / 1000) !== 19) {
      return false;
    }
  }

  if (!looksFashionLike(ad)) {
    return false;
  }

  const text = `${ad.subject ?? ''} ${ad.body ?? ''}`.toLowerCase();
  return !BRAND_BLACKLIST.some((term) => text.includes(term.toLowerCase()));
}

function parseKufarAd(ad: KufarAd): ParsedListingCandidate | null {
  const externalId = ad.ad_id ? String(ad.ad_id) : null;
  const title = (ad.subject ?? '').trim();
  if (!externalId || !title || !isKufarFashionAd(ad)) return null;

  const priceByn = ad.price_byn ? ad.price_byn / 100 : null;
  const priceUsd = priceByn !== null
    ? toUsd(priceByn, 'BYN')
    : (typeof ad.price_usd === 'number' ? ad.price_usd : null);
  const url = ad.ad_link ?? `https://www.kufar.by/item/${externalId}`;

  return {
    source: 'kufar',
    externalId,
    title,
    description: ad.body ?? '',
    priceText: priceByn !== null ? `${priceByn.toFixed(0)} BYN` : null,
    priceValueOptional: priceByn,
    currencyTextOptional: 'BYN',
    priceOriginal: priceByn,
    currencyOriginal: 'BYN',
    priceUsd,
    url,
    canonicalUrl: url,
    locationText: ad.tag_item_region ?? null,
    sellerType: 'unknown',
    imageUrl1: extractKufarImage(ad),
    imageUrl2: null,
    publishedTextOptional: ad.list_time ?? null,
    postedAt: ad.list_time ?? null,
    brandDetected: detectBrand(`${title} ${ad.body ?? ''}`),
    vertical: 'fashion',
    raw: ad as Record<string, unknown>
  };
}

export async function fetchKufarSearch(query: string, _vertical: Vertical = 'fashion'): Promise<KufarFetchResult> {
  const url = buildKufarUrl(query);
  const ua = getSourceUA('kufar');

  try {
    await humanDelay(900, 1_800);
    const response = await proxyFetch(url, {
      headers: apiHeaders(ua, 'https://www.kufar.by/', {
        acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.8',
        accept: 'application/json'
      }),
      timeout: 12000
    });

    const rawText = await response.text();
    if (isBlocked(rawText, response.status)) {
      return {
        listings: [],
        responseStatus: response.status,
        rawLength: rawText.length,
        warnings: ['Kufar returned an access restriction or CAPTCHA page.']
      };
    }

    if (!response.ok) {
      return {
        listings: [],
        responseStatus: response.status,
        rawLength: rawText.length,
        warnings: [`Kufar HTTP ${response.status}`]
      };
    }

    const data = JSON.parse(rawText) as { ads?: KufarAd[] };
    if (!didLogPayloadShape && data.ads?.[0]) {
      didLogPayloadShape = true;
      console.log('[Kufar] ad keys:', Object.keys(data.ads[0]).join(', '));
      console.log('[Kufar] images field:', JSON.stringify(data.ads[0].images ?? data.ads[0].pics ?? data.ads[0].photo ?? 'not found').slice(0, 300));
    }

    const listings = (data.ads ?? [])
      .map((ad) => parseKufarAd(ad))
      .filter(Boolean) as ParsedListingCandidate[];

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
      warnings: [error instanceof Error ? error.message : 'Kufar request failed']
    };
  }
}

export async function fetchKufarListings(query: string, vertical: Vertical = 'fashion'): Promise<ParsedListingCandidate[]> {
  const result = await fetchKufarSearch(query, vertical);
  return result.listings;
}
