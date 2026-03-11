import { load, type CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { detectBrand, type RuntimeCookieProvider, type SellerType, type SourceRuntimeDiagnostics } from '@avito-monitor/shared';
import { browserHeaders, humanDelay, isBlocked, pickUA, toUsd } from '../lib/antiBan';
import {
  cookiesToHeader as cookiesToHeaderFromStore,
  getSourceCookieEntry,
  getSourceCookies,
  invalidateCookies,
  markCookiePoolEntryFailure,
  markCookiePoolEntrySuccess
} from '../lib/cookieStore';
import { hasProxy, proxyFetch } from '../lib/proxyFetch';
import {
  canPurchaseNewSpfaCookie,
  clearSpfaCookieState,
  cookiesObjectToHeader,
  fetchSpfaCookies,
  isSpfaCookieFresh,
  markSpfaCookieBlocked,
  markSpfaCookieHealthy,
  markSpfaCookieUnblocked,
  readSpfaCookieState,
  unblockSpfaCookies
} from '../lib/spfa';
import { config } from '../config';
import { crawlAvitoWithMeta } from '../crawler/avitoCrawler';
import type { ParseResult, ParsedListingCandidate } from './types';

export const AVITO_QUERIES = [
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
  'Alexander McQueen',
  'Vivienne Westwood',
  'Issey Miyake',
  'Junya Watanabe',
  'дизайнерская куртка',
  'архивная одежда',
  'винтаж дизайнер куртка',
  'кожаная куртка дизайнер',
  'японский дизайнер'
] as const;

const CARD_SELECTORS = [
  '[data-marker="item"]',
  '[class*="iva-item-root"]',
  '[class*="items-item-"]',
  'article[itemtype*="Product"]',
  'div[itemtype*="Product"]'
];

const TITLE_LINK_SELECTORS = [
  'a[data-marker="item-title"]',
  'a[class*="iva-item-title"]',
  'a[itemprop="url"]',
  'a[href*="_"], a[href*="/item/"]'
];

const TITLE_SELECTORS = [
  '[data-marker="item-title"]',
  '[class*="iva-item-title"]',
  '[itemprop="name"]',
  'h3',
  'a[title]'
];

const PRICE_SELECTORS = [
  '[data-marker="item-price"]',
  '[data-marker="price"]',
  '[itemprop="price"]',
  '[class*="price-text"]',
  '[class*="styles-module-price"]'
];

const LOCATION_SELECTORS = [
  '[data-marker="item-location"]',
  '[data-marker="item-address"]',
  '[data-marker="geo-location/address"]',
  '[class*="geo-root"]',
  '[class*="item-address"]'
];

const DATE_SELECTORS = [
  '[data-marker="item-date"]',
  '[class*="date-text"]',
  'span[class*="date"]'
];

const CONTAINER_SELECTORS = [
  '[data-marker="item"]',
  '[class*="iva-item-root"]',
  '[class*="items-item-"]',
  'article',
  'li',
  'section > div',
  'div'
];

const SCRIPT_JSON_TOKENS = [
  'window.__preloadedState__',
  '__preloadedState__',
  'window.__initialData__',
  '__initialData__',
  'window.__INITIAL_STATE__',
  '__INITIAL_STATE__',
  'window.__REDUX_STATE__',
  '__REDUX_STATE__',
  'window.__NEXT_DATA__',
  '__NEXT_DATA__',
  'window.__NUXT__',
  '__NUXT__',
  'initialState'
];

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/');
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

export function canonicalizeListingUrl(input: string): string {
  const parsed = new URL(input);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function textOrNull(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function parsePriceValue(priceText: string | null): number | null {
  if (!priceText) {
    return null;
  }

  const match = priceText.replace(/\u00a0/g, " ").match(/([\d\s]{2,}\d|\d+[.,]\d+)/);
  if (!match) {
    return null;
  }

  const compact = match[1].replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(compact);
  return Number.isFinite(value) ? value : null;
}

function extractCurrencyText(priceText: string | null): string | null {
  if (!priceText) {
    return null;
  }

  const currency = priceText.replace(/[\d\s.,]/g, "").trim();
  return currency || null;
}

function extractExternalId(url: string, fallback?: string | null): string | null {
  const regexes = [
    /_(\d+)(?:\?|$)/,
    /\/(\d+)(?:\?|$)/
  ];

  for (const regex of regexes) {
    const match = url.match(regex);
    if (match?.[1]) {
      return match[1];
    }
  }

  return fallback ?? null;
}

function isLikelyListingUrl(url: string): boolean {
  return /_(\d+)(?:\?|$)/.test(url) || /\/item\//.test(url);
}

function pickAttr($root: ReturnType<CheerioAPI>, selectors: string[], attrs: string[]): string | null {
  for (const selector of selectors) {
    const element = $root.find(selector).first();
    if (!element.length) {
      continue;
    }

    for (const attr of attrs) {
      const value = textOrNull(element.attr(attr));
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function pickText($root: ReturnType<CheerioAPI>, selectors: string[]): string | null {
  for (const selector of selectors) {
    const element = $root.find(selector).first();
    if (!element.length) {
      continue;
    }

    const value = textOrNull(element.text() || element.attr("content") || element.attr("aria-label") || element.attr("title"));
    if (value) {
      return value;
    }
  }

  return null;
}

function gatherImages($: CheerioAPI, element: AnyNode, baseUrl: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];

  $(element)
    .find("img, source")
    .each((_, node) => {
      const raw =
        $(node).attr("src") ??
        $(node).attr("data-src") ??
        $(node).attr("srcset")?.split(",")[0]?.trim().split(" ")[0] ??
        $(node).attr("data-srcset")?.split(",")[0]?.trim().split(" ")[0] ??
        $(node).attr("content") ??
        null;

      const resolved = absoluteUrl(raw, baseUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    });

  return images.slice(0, 2);
}

function detectSellerType(blob: string): SellerType {
  const normalized = blob.toLowerCase();
  if (/(магазин|shop|company|business|компания|салон)/.test(normalized)) {
    return "business";
  }
  if (/(частн|private|личный)/.test(normalized)) {
    return "private";
  }
  return "unknown";
}

function buildRawCardDebug(card: ReturnType<CheerioAPI>): Record<string, unknown> {
  return {
    htmlSnippet: card.html()?.slice(0, 800) ?? null,
    attrs: ((card.get(0) as { attribs?: Record<string, string> } | undefined)?.attribs) ?? {}
  };
}

function extractCardListing($: CheerioAPI, element: AnyNode, baseUrl: string, strategy: string): ParsedListingCandidate | null {
  const card = $(element);
  const href =
    pickAttr(card, ['a[data-marker="item-title"]', 'a[itemprop="url"]', 'a[href*="_"], a[href*="/item/"]', 'a[href]'], ["href", "data-href"]) ??
    null;
  const url = absoluteUrl(href, baseUrl);
  const title = pickText(card, TITLE_SELECTORS);

  const externalIdCandidate = extractExternalId(url ?? "", card.attr("data-item-id") ?? card.attr("id") ?? null);

  if (!url || !title || !isLikelyListingUrl(url) || !externalIdCandidate) {
    return null;
  }

  const priceText = pickText(card, PRICE_SELECTORS);
  const locationText = pickText(card, LOCATION_SELECTORS);
  const publishedTextOptional = pickText(card, DATE_SELECTORS);
  const images = gatherImages($, element, baseUrl);
  const externalId = externalIdCandidate;
  const blob = textOrNull(card.text()) ?? "";

  return {
    source: "avito",
    externalId,
    title,
    priceText,
    priceValueOptional: parsePriceValue(priceText),
    currencyTextOptional: extractCurrencyText(priceText),
    url,
    canonicalUrl: canonicalizeListingUrl(url),
    locationText,
    sellerType: detectSellerType(blob),
    imageUrl1: images[0] ?? null,
    imageUrl2: images[1] ?? null,
    publishedTextOptional,
    raw: {
      strategy,
      externalId,
      title,
      href,
      priceText,
      locationText,
      publishedTextOptional,
      images,
      ...buildRawCardDebug(card)
    }
  };
}

function titleAnchorContainers($: CheerioAPI, selectorHits: Record<string, number>): AnyNode[] {
  const containers = new Set<AnyNode>();

  for (const selector of TITLE_LINK_SELECTORS) {
    const links = $(selector).toArray();
    selectorHits[`title:${selector}`] = links.length;

    for (const link of links) {
      let container = null;
      for (const containerSelector of CONTAINER_SELECTORS) {
        const candidate = $(link).closest(containerSelector);
        if (candidate.length) {
          container = candidate.get(0) as AnyNode;
          if (container) {
            break;
          }
        }
      }

      if (container) {
        containers.add(container);
      }
    }
  }

  return [...containers];
}

function pickStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return textOrNull(value);
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

function pickFirstStringFromObject(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = pickStringValue(source[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function pickImageUrlsFromObject(source: Record<string, unknown>, baseUrl: string): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const keys = ["image", "images", "photo", "photos", "picture", "pictures"];

  function pushValue(value: unknown): void {
    if (typeof value === "string") {
      const resolved = absoluteUrl(value, baseUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        output.push(resolved);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        pushValue(entry);
      }
      return;
    }

    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["url", "src", "origUrl", "640x480", "1024x768", "0"]) {
        if (key in record) {
          pushValue(record[key]);
        }
      }
    }
  }

  for (const key of keys) {
    if (key in source) {
      pushValue(source[key]);
    }
  }

  return output.slice(0, 2);
}

function pickUrlFromObject(source: Record<string, unknown>, baseUrl: string): string | null {
  const urlFields = [
    source.url,
    source.uri,
    source.link,
    source.href,
    source.path,
    source.urlPath,
    source.itemUrl,
    source.actionUrl,
    (source.seo as Record<string, unknown> | undefined)?.url,
    (source.routes as Record<string, unknown> | undefined)?.item
  ];

  for (const field of urlFields) {
    const url = absoluteUrl(pickStringValue(field), baseUrl);
    if (url && isLikelyListingUrl(url)) {
      return url;
    }
  }

  return null;
}

function pickPriceTextFromObject(source: Record<string, unknown>): string | null {
  const price = source.price;
  if (price && typeof price === "object") {
    const nested = price as Record<string, unknown>;
    const nestedText = pickFirstStringFromObject(nested, ["text", "formatted", "title", "value", "amount"]);
    if (nestedText) {
      return nestedText;
    }
  }

  return pickFirstStringFromObject(source, ["priceText", "priceTitle", "price", "formattedPrice", "amount"]) ?? null;
}

function pickLocationFromObject(source: Record<string, unknown>): string | null {
  const locationFields = [
    source.location,
    source.address,
    source.geo,
    source.metro,
    source.district,
    (source.addressObject as Record<string, unknown> | undefined)?.name,
    (source.location as Record<string, unknown> | undefined)?.name
  ];

  for (const field of locationFields) {
    if (typeof field === "string") {
      return textOrNull(field);
    }
    if (field && typeof field === "object") {
      const nested = field as Record<string, unknown>;
      const nestedText = pickFirstStringFromObject(nested, ["name", "title", "text"]);
      if (nestedText) {
        return nestedText;
      }
    }
  }

  return null;
}

function detectSellerTypeFromObject(source: Record<string, unknown>): SellerType {
  const flat = JSON.stringify({
    sellerType: source.sellerType,
    seller: source.seller,
    shopId: source.shopId,
    company: source.company,
    owner: source.owner
  }).toLowerCase();

  if (/(shop|business|company|магазин|компан)/.test(flat) || source.shopId) {
    return "business";
  }
  if (/(private|частн|личный)/.test(flat)) {
    return "private";
  }
  return "unknown";
}

function toTimestampIso(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const ms = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Date(ms).toISOString();
}

function mapAvitoCatalogItem(source: Record<string, unknown>, baseUrl: string): ParsedListingCandidate | null {
  const title = pickFirstStringFromObject(source, ['title', 'description']);
  const url = absoluteUrl(
    pickFirstStringFromObject(source, ['urlPath', 'url', 'uri']),
    baseUrl
  );
  const externalId = pickFirstStringFromObject(source, ['id']) ?? extractExternalId(url ?? '', null);
  if (!title || !url || !externalId) {
    return null;
  }

  const priceDetailed = source.priceDetailed && typeof source.priceDetailed === 'object'
    ? source.priceDetailed as Record<string, unknown>
    : null;
  const gallery = source.gallery && typeof source.gallery === 'object'
    ? source.gallery as Record<string, unknown>
    : null;
  const priceText = priceDetailed
    ? pickFirstStringFromObject(priceDetailed, ['fullString', 'string', 'title', 'value'])
    : pickPriceTextFromObject(source);
  const locationText = pickFirstStringFromObject(source, ['address'])
    ?? pickFirstStringFromObject((source.location as Record<string, unknown> | undefined) ?? {}, ['name'])
    ?? pickFirstStringFromObject((source.addressDetailed as Record<string, unknown> | undefined) ?? {}, ['locationName'])
    ?? pickFirstStringFromObject((source.geo as Record<string, unknown> | undefined) ?? {}, ['formattedAddress'])
    ?? pickLocationFromObject(source);
  const postedAt = toTimestampIso(source.sortTimeStamp);
  const images = [
    absoluteUrl(pickFirstStringFromObject(gallery ?? {}, ['imageLargeUrl', 'imageUrl', 'imageVipUrl']), baseUrl),
    ...pickImageUrlsFromObject(source, baseUrl)
  ].filter((entry): entry is string => Boolean(entry));

  return {
    source: 'avito',
    externalId,
    title,
    description: pickFirstStringFromObject(source, ['description']) ?? title,
    priceText,
    priceValueOptional: priceDetailed?.value && typeof priceDetailed.value === 'number'
      ? priceDetailed.value
      : parsePriceValue(priceText),
    currencyTextOptional: extractCurrencyText(priceText) ?? 'RUB',
    url,
    canonicalUrl: canonicalizeListingUrl(url),
    locationText,
    sellerType: detectSellerTypeFromObject(source),
    imageUrl1: images[0] ?? null,
    imageUrl2: images[1] ?? null,
    publishedTextOptional: postedAt,
    postedAt,
    raw: {
      strategy: 'avito_catalog_item',
      source
    }
  };
}

function looksLikeListingObject(source: Record<string, unknown>, baseUrl: string): boolean {
  const title = pickFirstStringFromObject(source, ["title", "name", "subject"]);
  const url = pickUrlFromObject(source, baseUrl);
  const priceText = pickPriceTextFromObject(source);
  const images = pickImageUrlsFromObject(source, baseUrl);

  return Boolean(title && url && (priceText || images.length > 0 || pickLocationFromObject(source) || source.id || source.itemId));
}

function mapEmbeddedListing(source: Record<string, unknown>, baseUrl: string): ParsedListingCandidate | null {
  const title = pickFirstStringFromObject(source, ["title", "name", "subject"]);
  const url = pickUrlFromObject(source, baseUrl);
  const externalId = pickFirstStringFromObject(source, ["id", "itemId", "adId", "sku", "productId"]) ?? extractExternalId(url ?? "", null);
  if (!title || !url || !externalId || !isLikelyListingUrl(url)) {
    return null;
  }

  const priceText = pickPriceTextFromObject(source);
  const images = pickImageUrlsFromObject(source, baseUrl);
  return {
    source: "avito",
    externalId,
    title,
    priceText,
    priceValueOptional: parsePriceValue(priceText),
    currencyTextOptional: extractCurrencyText(priceText),
    url,
    canonicalUrl: canonicalizeListingUrl(url),
    locationText: pickLocationFromObject(source),
    sellerType: detectSellerTypeFromObject(source),
    imageUrl1: images[0] ?? null,
    imageUrl2: images[1] ?? null,
    publishedTextOptional: pickFirstStringFromObject(source, ["date", "publishedAt", "createdAt"]),
    raw: {
      strategy: "embedded_json",
      source
    }
  };
}

function extractJsonAfterToken(text: string, token: string): string | null {
  const tokenIndex = text.indexOf(token);
  if (tokenIndex === -1) {
    return null;
  }

  const startIndex = text.slice(tokenIndex).search(/[\[{]/);
  if (startIndex === -1) {
    return null;
  }

  let index = tokenIndex + startIndex;
  const opening = text[index];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(tokenIndex + startIndex, index + 1);
      }
    }
  }

  return null;
}

function collectListingObjects(root: unknown, baseUrl: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const stack: unknown[] = [root];
  let visited = 0;

  while (stack.length > 0 && visited < 50000) {
    visited += 1;
    const current = stack.pop();

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    const record = current as Record<string, unknown>;
    if (looksLikeListingObject(record, baseUrl)) {
      found.push(record);
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return found;
}

function unwrapEmbeddedPayload(payload: unknown): unknown {
  let current = payload;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (typeof current !== 'string') {
      return current;
    }

    const trimmed = current.trim().replace(/;$/, '');
    const decoded = trimmed.startsWith('%7B') || trimmed.startsWith('%5B') || trimmed.startsWith('%22')
      ? decodeURIComponent(trimmed)
      : trimmed;

    if (!decoded || decoded === current) {
      return current;
    }

    try {
      current = JSON.parse(decoded);
    } catch {
      return decoded;
    }
  }

  return current;
}

function parseEmbeddedJsonListings($: CheerioAPI, baseUrl: string): ParsedListingCandidate[] {
  const listings = new Map<string, ParsedListingCandidate>();

  $("script").each((_, node) => {
    const type = $(node).attr("type") ?? "text/javascript";
    if (type === "application/ld+json") {
      return;
    }

    const raw = ($(node).html() ?? $(node).text() ?? "").trim();
    if (!raw || raw.length < 20) {
      return;
    }

    for (const token of SCRIPT_JSON_TOKENS) {
      if (!raw.includes(token)) {
        continue;
      }

      const jsonPayload = extractJsonAfterToken(raw, token);
      if (!jsonPayload) {
        continue;
      }

      try {
        const parsed = unwrapEmbeddedPayload(JSON.parse(jsonPayload));
        const candidates = collectListingObjects(parsed, baseUrl);
        for (const candidate of candidates) {
          const listing = mapEmbeddedListing(candidate, baseUrl);
          if (!listing) {
            continue;
          }
          listings.set(listing.externalId ?? listing.canonicalUrl, listing);
        }
      } catch {
        // Ignore broken JS blobs and keep scanning other scripts.
      }
    }
  });

  return [...listings.values()];
}

function parseMfeStateListings($: CheerioAPI, baseUrl: string): ParsedListingCandidate[] {
  const listings = new Map<string, ParsedListingCandidate>();

  $('script[type="mime/invalid"][data-mfe-state="true"]').each((_, node) => {
    const raw = ($(node).html() ?? $(node).text() ?? '').trim();
    if (!raw || raw.includes('sandbox')) {
      return;
    }

    try {
      const parsed = JSON.parse(decodeHtmlEntities(raw)) as Record<string, unknown>;
      const stateData = parsed.state && typeof parsed.state === 'object'
        ? ((parsed.state as Record<string, unknown>).data ?? parsed.state)
        : parsed;
      const catalogItems = stateData && typeof stateData === 'object'
        ? (((stateData as Record<string, unknown>).catalog as Record<string, unknown> | undefined)?.items)
        : null;

      if (Array.isArray(catalogItems)) {
        for (const item of catalogItems) {
          if (!item || typeof item !== 'object') {
            continue;
          }
          const listing = mapAvitoCatalogItem(item as Record<string, unknown>, baseUrl);
          if (!listing) {
            continue;
          }
          listings.set(listing.externalId ?? listing.canonicalUrl, listing);
        }
      }

      const candidates = collectListingObjects(stateData, baseUrl);
      for (const candidate of candidates) {
        const listing = mapEmbeddedListing(candidate, baseUrl);
        if (!listing) {
          continue;
        }
        listings.set(listing.externalId ?? listing.canonicalUrl, listing);
      }
    } catch {
      // Ignore malformed embedded MFE state blocks and keep scanning the page.
    }
  });

  return [...listings.values()];
}

function parseJsonLdListings($: CheerioAPI, baseUrl: string): ParsedListingCandidate[] {
  const output: ParsedListingCandidate[] = [];

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).contents().text().trim();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.itemListElement)
          ? parsed.itemListElement.map((entry: Record<string, unknown>) => entry.item ?? entry)
          : Array.isArray(parsed["@graph"])
            ? parsed["@graph"]
            : [parsed];

      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object") {
          continue;
        }

        const record = candidate as Record<string, unknown>;
        const url = absoluteUrl(pickStringValue(record.url), baseUrl);
        const title = pickFirstStringFromObject(record, ["name", "title"]);
        const externalId = extractExternalId(url ?? "", pickFirstStringFromObject(record, ["sku", "productID", "id"]));
        if (!url || !title || !externalId || !isLikelyListingUrl(url)) {
          continue;
        }

        const images = pickImageUrlsFromObject(record, baseUrl);
        const priceText = pickPriceTextFromObject(record) ?? textOrNull(
          record.offers && typeof record.offers === "object"
            ? `${pickStringValue((record.offers as Record<string, unknown>).price) ?? ""} ${pickStringValue((record.offers as Record<string, unknown>).priceCurrency) ?? ""}`
            : null
        );
        output.push({
          source: "avito",
          externalId,
          title,
          priceText,
          priceValueOptional: parsePriceValue(priceText),
          currencyTextOptional: extractCurrencyText(priceText),
          url,
          canonicalUrl: canonicalizeListingUrl(url),
          locationText: pickLocationFromObject(record),
          sellerType: "unknown",
          imageUrl1: images[0] ?? null,
          imageUrl2: images[1] ?? null,
          publishedTextOptional: null,
          raw: {
            strategy: "json_ld",
            source: record
          }
        });
      }
    } catch {
      // Ignore broken structured data blocks.
    }
  });

  return output;
}

function detectSuspectedReason(html: string, pageTitle: string | null, listingsCount: number, selectorHits: Record<string, number>): string | null {
  if (/доступ ограничен|problem with ip|access denied|verify you are human|too many requests/i.test(`${pageTitle ?? ''} ${html.slice(0, 3000)}`)) {
    return 'Avito вернул страницу ограничения доступа или CAPTCHA.';
  }

  if (listingsCount === 0) {
    const hitCount = Object.values(selectorHits).reduce((sum, value) => sum + value, 0);
    if (hitCount === 0) {
      return "В HTML не найдены знакомые контейнеры карточек и не извлечены данные из script/json.";
    }
    return "Контейнеры или ссылки были найдены, но из них не удалось собрать валидные карточки с title/url.";
  }

  return null;
}

export function parseAvitoSearchHtml(html: string, baseUrl: string): ParseResult {
  const $ = load(html);
  const pageTitle = textOrNull($("title").first().text());
  const selectorHits: Record<string, number> = {};
  const containerNodes = new Set<AnyNode>();

  for (const selector of CARD_SELECTORS) {
    const matches = $(selector).toArray();
    selectorHits[selector] = matches.length;
    for (const node of matches) {
      containerNodes.add(node as AnyNode);
    }
  }

  for (const node of titleAnchorContainers($, selectorHits)) {
    containerNodes.add(node);
  }

  const listings = new Map<string, ParsedListingCandidate>();
  const strategiesUsed = new Set<string>();

  for (const node of containerNodes) {
    const listing = extractCardListing($, node, baseUrl, "card_selector");
    if (!listing) {
      continue;
    }
    listings.set(listing.externalId ?? listing.canonicalUrl, listing);
    strategiesUsed.add("card_selector");
  }

  const jsonLdListings = parseJsonLdListings($, baseUrl);
  for (const listing of jsonLdListings) {
    const key = listing.externalId ?? listing.canonicalUrl;
    if (!listings.has(key)) {
      listings.set(key, listing);
    }
  }
  if (jsonLdListings.length > 0) {
    strategiesUsed.add("json_ld");
  }

  const embeddedJsonListings = parseEmbeddedJsonListings($, baseUrl);
  for (const listing of embeddedJsonListings) {
    const key = listing.externalId ?? listing.canonicalUrl;
    if (!listings.has(key)) {
      listings.set(key, listing);
    }
  }
  if (embeddedJsonListings.length > 0) {
    strategiesUsed.add("embedded_json");
  }

  const mfeStateListings = parseMfeStateListings($, baseUrl);
  for (const listing of mfeStateListings) {
    const key = listing.externalId ?? listing.canonicalUrl;
    if (!listings.has(key)) {
      listings.set(key, listing);
    }
  }
  if (mfeStateListings.length > 0) {
    strategiesUsed.add('mfe_state');
  }

  const warnings: string[] = [];
  const suspectedReason = detectSuspectedReason(html, pageTitle, listings.size, selectorHits);
  if (suspectedReason) {
    warnings.push(suspectedReason);
  }

  return {
    listings: [...listings.values()],
    diagnostics: {
      pageTitle,
      selectorsAttempted: [...CARD_SELECTORS, ...TITLE_LINK_SELECTORS.map((selector) => `title:${selector}`)],
      selectorHits,
      cardsFound: containerNodes.size,
      jsonLdCount: jsonLdListings.length,
      embeddedJsonCount: embeddedJsonListings.length,
      strategiesUsed: [...strategiesUsed],
      warnings,
      suspectedReason,
      sampleTitles: [...listings.values()].slice(0, 8).map((entry) => entry.title)
    }
  };
}

export interface AvitoFetchResult {
  listings: ParsedListingCandidate[];
  responseStatus: number | null;
  rawLength: number;
  warnings: string[];
  pageTitle: string | null;
  selectorsAttempted: string[];
  selectorHits: Record<string, number>;
  cardsFound: number;
  strategiesUsed: string[];
  suspectedReason: string | null;
  finalUrl: string;
  html: string;
  runtimeDiagnostics: SourceRuntimeDiagnostics | null;
}

interface AvitoSessionState {
  cookie: string;
  ua: string;
  ts: number;
  provider: 'imported' | 'bootstrap' | 'spfa';
  cookieId: number | null;
}

let avitoSession: AvitoSessionState | null = null;

function normalizeCurrency(currency: string | null): string | null {
  if (!currency) return null;
  const normalized = currency.trim().toUpperCase();
  if (normalized === '₽' || normalized === 'РУБ.' || normalized === 'РУБ') return 'RUB';
  return normalized;
}

function normalizeAvitoListing(listing: ParsedListingCandidate): ParsedListingCandidate {
  const priceValue = listing.priceValueOptional ?? null;
  const currency = normalizeCurrency(listing.currencyTextOptional) ?? 'RUB';
  const postedAt = listing.postedAt ?? listing.publishedTextOptional ?? null;

  return {
    ...listing,
    description: listing.description ?? listing.title,
    priceOriginal: listing.priceOriginal ?? priceValue,
    currencyOriginal: listing.currencyOriginal ?? currency,
    currencyTextOptional: currency,
    priceUsd: listing.priceUsd ?? (priceValue !== null ? toUsd(priceValue, currency) : null),
    postedAt,
    brandDetected: listing.brandDetected ?? detectBrand(listing.title),
    vertical: listing.vertical ?? 'fashion'
  };
}

function extractCookieHeader(response: Response): string {
  const raw = response.headers.get('set-cookie') ?? '';
  return raw
    .split(/,(?=\s*[\w-]+=)/)
    .map((entry) => entry.split(';')[0]?.trim())
    .filter((entry): entry is string => Boolean(entry && entry.includes('=')))
    .join('; ');
}

function providerToCookieProvider(provider: AvitoSessionState['provider'] | 'none'): RuntimeCookieProvider {
  if (provider === 'imported' || provider === 'spfa' || provider === 'bootstrap') {
    return provider;
  }
  return 'none';
}

function buildDiagnostics(
  provider: AvitoSessionState['provider'] | 'none',
  proxyActive: boolean,
  blockReason: string | null,
  lastRecoveryAction: string | null
): SourceRuntimeDiagnostics {
  return {
    cookieProvider: providerToCookieProvider(provider),
    transportMode: 'direct',
    proxyActive,
    blockReason,
    lastRecoveryAction
  };
}

function buildAvitoFailure(
  url: string,
  responseStatus: number | null,
  html: string,
  warnings: string[],
  suspectedReason: string,
  runtimeDiagnostics: SourceRuntimeDiagnostics
): AvitoFetchResult {
  return {
    listings: [],
    responseStatus,
    rawLength: html.length,
    warnings,
    pageTitle: html ? textOrNull(load(html)('title').first().text()) : null,
    selectorsAttempted: [],
    selectorHits: {},
    cardsFound: 0,
    strategiesUsed: [],
    suspectedReason,
    finalUrl: url,
    html,
    runtimeDiagnostics
  };
}

async function getAvitoSession(forceRefresh = false): Promise<AvitoSessionState> {
  if (!forceRefresh && avitoSession && Date.now() - avitoSession.ts < 20 * 60 * 1000) {
    return avitoSession;
  }

  const importedCookies = getSourceCookies('avito');
  if (importedCookies && importedCookies.length > 0) {
    avitoSession = {
      cookie: cookiesToHeaderFromStore(importedCookies),
      ua: pickUA(),
      ts: Date.now(),
      provider: 'imported',
      cookieId: null
    };
    return avitoSession;
  }

  if (config.spfaApiKey) {
    const cached = readSpfaCookieState();
    if (!forceRefresh && cached && isSpfaCookieFresh(cached)) {
      avitoSession = {
        cookie: cookiesObjectToHeader(cached.cookies),
        ua: cached.userAgent || pickUA(),
        ts: Date.now(),
        provider: 'spfa',
        cookieId: cached.id
      };
      console.log(`[Avito] Reusing cached SPFA cookies id=${cached.id}`);
      return avitoSession;
    }

    if (cached && !isSpfaCookieFresh(cached)) {
      clearSpfaCookieState();
    }

    if (!cached || canPurchaseNewSpfaCookie(cached)) {
      try {
        const payload = await fetchSpfaCookies(config.spfaApiKey);
        avitoSession = {
          cookie: cookiesObjectToHeader(payload.cookies),
          ua: payload.user_agent || pickUA(),
          ts: Date.now(),
          provider: 'spfa',
          cookieId: payload.id
        };
        console.log(`[Avito] Loaded SPFA cookies id=${payload.id} (${Object.keys(payload.cookies).join(', ')})`);
        return avitoSession;
      } catch (error) {
        console.warn(`[Avito] SPFA cookies failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const ua = pickUA();

  try {
    const response = await proxyFetch('https://www.avito.ru/', {
      headers: browserHeaders(ua, undefined, {
        acceptLanguage: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
      }),
      timeout: 15000,
      redirect: 'follow'
    });

    avitoSession = {
      cookie: extractCookieHeader(response),
      ua,
      ts: Date.now(),
      provider: 'bootstrap',
      cookieId: null
    };
    return avitoSession;
  } catch {
    return {
      cookie: '',
      ua,
      ts: Date.now(),
      provider: 'bootstrap',
      cookieId: null
    };
  }
}

async function tryRecoverBlockedSession(session: AvitoSessionState): Promise<AvitoSessionState | null> {
  if (!config.spfaApiKey || session.provider !== 'spfa' || !session.cookieId) {
    return null;
  }

  try {
    const accepted = await unblockSpfaCookies(config.spfaApiKey, session.cookieId);
    if (!accepted) {
      return null;
    }

    console.log(`[Avito] SPFA unblock requested for cookie id=${session.cookieId}`);
    markSpfaCookieUnblocked(session.cookieId);
    await humanDelay(5_000, 5_600);
    avitoSession = {
      ...session,
      ts: Date.now()
    };
    return avitoSession;
  } catch (error) {
    console.warn(`[Avito] SPFA unblock failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function buildAvitoSearchUrl(query: string): string {
  const url = new URL('https://www.avito.ru/rossiya/odezhda_obuv_aksessuary');
  url.searchParams.set('q', query);
  url.searchParams.set('s', '104');
  return url.toString();
}

async function requestAvitoSearch(url: string, session: AvitoSessionState): Promise<{
  responseStatus: number;
  html: string;
  finalUrl: string;
}> {
  const response = await proxyFetch(url, {
    headers: browserHeaders(session.ua, 'https://www.avito.ru/', {
      acceptLanguage: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      cookie: session.cookie
    }),
    timeout: 20000,
    redirect: 'follow'
  });

  return {
    responseStatus: response.status,
    html: await response.text(),
    finalUrl: response.url || url
  };
}

export async function fetchAvitoSearch(query: string): Promise<AvitoFetchResult> {
  const url = buildAvitoSearchUrl(query);
  const proxyActive = hasProxy();
  const importedCookieEntry = getSourceCookieEntry('avito');
  const importedCookies = importedCookieEntry?.cookies ?? getSourceCookies('avito') ?? [];
  const provider: AvitoSessionState['provider'] | 'none' = importedCookies.length > 0 ? 'imported' : 'none';

  try {
    const result = await crawlAvitoWithMeta(query, importedCookies);
    const warnings = [...result.warnings];

    if (!proxyActive) {
      warnings.unshift('Avito is running without PROXY_URL/PROXY_URLS. Browser crawl is best-effort only.');
    }

    if (result.listings.length === 0) {
      warnings.push(`Avito title: ${result.pageTitle ?? 'unknown'}`);
      warnings.push(`Avito state preview: ${result.statePreview ?? 'none'}`);
      warnings.push(`Avito data-markers: ${result.dataMarkers.join(', ') || 'none'}`);
      if (importedCookieEntry?.entry.id && (result.responseStatus === 401 || result.responseStatus === 403 || result.responseStatus === 429)) {
        markCookiePoolEntryFailure(importedCookieEntry.entry.id, `Avito HTTP ${result.responseStatus}`);
      }
    } else if (importedCookieEntry?.entry.id) {
      markCookiePoolEntrySuccess(importedCookieEntry.entry.id);
    }

    return {
      listings: result.listings.map((listing) => normalizeAvitoListing(listing)),
      responseStatus: result.responseStatus,
      rawLength: result.html.length,
      warnings,
      pageTitle: result.pageTitle,
      selectorsAttempted: ['window.__INITIAL_STATE__', 'window.__NEXT_DATA__', '[data-marker="item"]'],
      selectorHits: result.selectorHits,
      cardsFound: result.listings.length,
      strategiesUsed: result.strategiesUsed,
      suspectedReason: result.listings.length === 0 ? 'Avito hydrated page returned no extractable listings.' : null,
      finalUrl: result.finalUrl || url,
      html: result.html,
      runtimeDiagnostics: {
        cookieProvider: providerToCookieProvider(provider),
        transportMode: 'browser',
        proxyActive,
        blockReason: result.listings.length === 0 ? 'empty_search' : null,
        lastRecoveryAction: 'crawlee_playwright'
      }
    };
  } catch (error) {
    if (importedCookieEntry?.entry.id) {
      markCookiePoolEntryFailure(importedCookieEntry.entry.id, error instanceof Error ? error.message : String(error));
    }
    return buildAvitoFailure(
      url,
      null,
      '',
      [error instanceof Error ? error.message : String(error)],
      'Avito browser crawl failed.',
      {
        cookieProvider: providerToCookieProvider(provider),
        transportMode: 'browser',
        proxyActive,
        blockReason: 'request_failed',
        lastRecoveryAction: 'crawlee_playwright'
      }
    );
  }
}
