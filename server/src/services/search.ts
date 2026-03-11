import {
  BRANDS,
  RESELL_BRAND_POOL,
  SEARCH_CATEGORIES,
  SEARCH_PRESETS,
  SEARCH_SOURCES,
  getSearchCategory,
  getSearchPreset,
  type FeedSource,
  type SearchCategoryKey,
  type SearchPresetKey,
  type Vertical
} from '@avito-monitor/shared';
import type { FeedInput } from '../store';
import { buildKufarUrl } from '../parser/kufar';
import { buildQueryPlan } from './queryPlanner';

export interface StartSearchInput {
  source: Extract<FeedSource, 'avito' | 'mercari_jp' | 'kufar' | 'vinted' | 'carousell' | 'rakuma'>;
  vertical?: Vertical;
  categoryKey: SearchCategoryKey;
  presetKey?: SearchPresetKey | null;
  searchMode: 'quick' | 'exact_url';
  fetchMode?: 'direct' | 'assisted';
  exactUrl?: string | null;
  customQuery?: string | null;
  pollIntervalSec?: number;
  minPriceValueOptional?: number | null;
  maxPriceValueOptional?: number | null;
  privateSellersOnly?: boolean;
}

export function getSourceLabel(source: FeedSource): string {
  return SEARCH_SOURCES.find((entry) => entry.key === source)?.label ?? source;
}

function buildUrlForQuery(source: StartSearchInput['source'], query: string, vertical: Vertical): string {
  if (source === 'avito') {
    const url = new URL('https://www.avito.ru/rossiya/odezhda_obuv_aksessuary');
    url.searchParams.set('q', query);
    url.searchParams.set('s', '104');
    return url.toString();
  }

  if (source === 'mercari_jp') {
    const url = new URL('https://jp.mercari.com/search');
    url.searchParams.set('keyword', query);
    url.searchParams.set('status', 'on_sale');
    url.searchParams.set('sort', 'created_time');
    url.searchParams.set('order', 'desc');
    return url.toString();
  }

  if (source === 'kufar') {
    return buildKufarUrl(query, vertical);
  }

  if (source === 'vinted') {
    const url = new URL('https://www.vinted.com/catalog');
    url.searchParams.set('search_text', query);
    url.searchParams.set('order', 'newest_first');
    return url.toString();
  }

  if (source === 'carousell') {
    return `https://www.carousell.com.my/search/${encodeURIComponent(query)}?addRecent=true&canChangeKeyword=true&includeSuggestions=true&t-search_query_source=direct_search`;
  }

  if (source === 'rakuma') {
    return `https://fril.jp/search/${encodeURIComponent(query)}?order=desc&sort=created_at`;
  }

  throw new Error(`Unsupported search source: ${source}`);
}

export function buildSearchUrl(input: StartSearchInput): string {
  if (input.searchMode === 'exact_url') {
    if (!input.exactUrl?.trim()) {
      throw new Error('Exact URL mode requires a full search URL.');
    }
    return input.exactUrl.trim();
  }

  const vertical = input.vertical ?? 'fashion';
  const plan = buildQueryPlan(input.presetKey ? [input.presetKey] : [], input.source, input.categoryKey, input.customQuery ?? null, 1, vertical);
  const category = getSearchCategory(input.categoryKey);
  const query = plan[0]
    ?? input.customQuery?.trim()
    ?? category.quickQueryBySource[input.source]
    ?? category.keywords[0]
    ?? 'archive finder';
  return buildUrlForQuery(input.source, query, vertical);
}

function defaultPollInterval(source: StartSearchInput['source']): number {
  if (source === 'avito') return 9 * 60;
  if (source === 'mercari_jp') return 7 * 60;
  if (source === 'vinted') return 6 * 60;
  if (source === 'kufar') return 8 * 60;
  if (source === 'rakuma') return 7 * 60;
  if (source === 'carousell') return 10 * 60;
  return 7 * 60;
}

export function buildSearchFeed(input: StartSearchInput): FeedInput {
  const category = getSearchCategory(input.categoryKey);
  const preset = input.presetKey ? getSearchPreset(input.presetKey) : null;
  const sourceLabel = getSourceLabel(input.source);
  const vertical = input.vertical ?? 'fashion';
  const url = buildSearchUrl({ ...input, vertical });
  const pollIntervalSec = input.pollIntervalSec ?? defaultPollInterval(input.source);
  const presetBrands = preset ? preset.brandFocus : [];
  const includeKeywords = [
    ...category.keywords,
    ...(preset?.tags ?? []),
    ...(input.customQuery?.trim() ? [input.customQuery.trim()] : [])
  ];
  const brandPool = presetBrands.length > 0 ? presetBrands : [...RESELL_BRAND_POOL];

  return {
    source: input.source,
    vertical,
    searchMode: input.searchMode,
    fetchMode: input.fetchMode ?? 'direct',
    categoryKey: input.categoryKey,
    presetKey: input.presetKey ?? null,
    customQuery: input.customQuery?.trim() || null,
    name: preset ? `${sourceLabel} / ${preset.label}` : `${sourceLabel} / ${category.label}`,
    url,
    enabled: true,
    pollIntervalSec,
    filter: {
      includeKeywords,
      excludeKeywords: [],
      brands: brandPool,
      minPriceValueOptional: input.minPriceValueOptional ?? null,
      maxPriceValueOptional: input.maxPriceValueOptional ?? null,
      sellerTypePreference: 'any',
      notes: preset ? `Preset: ${preset.label}` : `Category: ${category.labelEn}`
    }
  };
}

export function getRenderWaitSelectors(source: FeedSource): string[] {
  if (source === 'mercari_jp') return ['[data-testid="item-cell"]', 'a[data-testid="thumbnail-link"]', 'a[href*="/item/"]'];
  return [];
}

export function getCategoryOptions() {
  return SEARCH_CATEGORIES;
}

export function getPresetOptions() {
  return SEARCH_PRESETS;
}
