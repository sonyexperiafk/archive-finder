import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSearchCategory, type FeedSource, type QueryMetric, type SearchCategoryKey } from '@avito-monitor/shared';
import { config } from '../config';

const bundledQueryFilePath = path.resolve(fileURLToPath(new URL('../../../shared/searchQueries.txt', import.meta.url)));
const queryFilePath = fs.existsSync(path.join(config.appRoot, 'shared', 'searchQueries.txt'))
  ? path.join(config.appRoot, 'shared', 'searchQueries.txt')
  : bundledQueryFilePath;
const circularState = new Map<string, number>();
const lastQueryByKey = new Map<string, string>();

let cachedQueries: string[] | null = null;
let cachedMtimeMs = 0;

function loadRawQueries(): string[] {
  const stat = fs.statSync(queryFilePath);
  if (!cachedQueries || stat.mtimeMs !== cachedMtimeMs) {
    cachedQueries = fs.readFileSync(queryFilePath, 'utf8')
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    cachedMtimeMs = stat.mtimeMs;
  }
  return cachedQueries;
}

function isJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function isCyrillic(text: string): boolean {
  return /[\u0400-\u04ff]/.test(text);
}

function normalizeQueryText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function categoryKeywords(categoryKey: SearchCategoryKey, source: FeedSource): string[] {
  const category = getSearchCategory(categoryKey);
  return [
    category.labelEn,
    category.quickQueryBySource[source] ?? '',
    ...category.keywords
  ]
    .map((entry) => normalizeQueryText(entry))
    .filter(Boolean);
}

function queryMatchesCategory(query: string, categoryKey: SearchCategoryKey, source: FeedSource): boolean {
  const normalizedQuery = normalizeQueryText(query);
  return categoryKeywords(categoryKey, source).some((keyword) => normalizedQuery.includes(keyword));
}

function sourceCategoryPool(source: FeedSource, categoryKey?: SearchCategoryKey | null): string[] {
  if (categoryKey) {
    return categoryKeywords(categoryKey, source).slice(0, 4);
  }

  return ['jacket', 'coat', 'hoodie', 'pants', 'boots', 'bag']
    .map((entry) => normalizeQueryText(entry))
    .filter(Boolean);
}

function buildGeneratedCustomQueries(
  source: FeedSource,
  customBrands: string[],
  customTags: string[],
  categoryKey?: SearchCategoryKey | null
): string[] {
  if (customBrands.length === 0) {
    return [];
  }

  const categories = sourceCategoryPool(source, categoryKey).slice(0, 5);
  const tags = (customTags.length > 0 ? customTags : ['archive', 'vintage', 'rare', 'grail', 'leather', 'avant-garde'])
    .map((entry) => normalizeQueryText(entry))
    .filter(Boolean)
    .slice(0, 8);
  const output: string[] = [];
  const seen = new Set<string>();

  outer:
  for (const brand of customBrands.map((entry) => entry.trim()).filter(Boolean)) {
    for (const category of categories) {
      const candidates = [`${brand} ${category}`, `${category} ${brand}`];
      for (const candidate of candidates) {
        const normalized = normalizeQueryText(candidate);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          output.push(candidate);
        }
        if (output.length >= 10_000) break outer;
      }

      for (const tag of tags) {
        const candidatesWithTag = [
          `${brand} ${tag} ${category}`,
          `${tag} ${brand} ${category}`,
          `${brand} ${category} ${tag}`
        ];
        for (const candidate of candidatesWithTag) {
          const normalized = normalizeQueryText(candidate);
          if (!seen.has(normalized)) {
            seen.add(normalized);
            output.push(candidate);
          }
          if (output.length >= 10_000) break outer;
        }
      }
    }
  }

  return output;
}

function sourceQueries(
  source: FeedSource,
  brandFocus: string[] = [],
  categoryKey?: SearchCategoryKey | null,
  customBrands: string[] = [],
  customTags: string[] = []
): string[] {
  const normalizedFocus = brandFocus.map((entry) => entry.toLowerCase());
  const base = loadRawQueries().filter((query) => {
    if (source === 'mercari_jp' || source === 'rakuma') {
      return true;
    }
    if (source === 'avito' || source === 'kufar') {
      return !isJapanese(query);
    }
      return !isJapanese(query) || /rick owens|undercover|guidi|yohji|kapital|julius/i.test(query);
  });
  const generatedCustom = buildGeneratedCustomQueries(source, customBrands, customTags, categoryKey);
  const merged = [...generatedCustom, ...base];

  if (normalizedFocus.length === 0) {
    if (!categoryKey) {
      return [...new Set(merged)];
    }
    const categoryFiltered = merged.filter((query) => queryMatchesCategory(query, categoryKey, source));
    return categoryFiltered.length > 0 ? [...new Set(categoryFiltered)] : [...new Set(merged)];
  }

  const focused = merged.filter((query) => normalizedFocus.some((brand) => query.toLowerCase().includes(brand)));
  const narrowed = focused.length > 0 ? focused : merged;
  if (!categoryKey) {
    return [...new Set(narrowed)];
  }
  const categoryFiltered = narrowed.filter((query) => queryMatchesCategory(query, categoryKey, source));
  return categoryFiltered.length > 0 ? [...new Set(categoryFiltered)] : [...new Set(narrowed)];
}

function sourceKey(source: FeedSource, brandFocus: string[] = [], customQuery?: string | null, categoryKey?: SearchCategoryKey | null): string {
  return JSON.stringify({
    source,
    brandFocus: [...brandFocus].sort(),
    customQuery: customQuery?.trim() ?? '',
    categoryKey: categoryKey ?? ''
  });
}

export function loadQueries(): string[] {
  return [...loadRawQueries()];
}

export function queryQualityScore(metric?: Pick<QueryMetric, 'newItemsFound' | 'totalRuns' | 'avgRecommendationScore' | 'noiseRatio'>): number {
  if (!metric) return 50;
  const volumeScore = Math.min(25, metric.newItemsFound * 3);
  const stabilityPenalty = Math.min(20, Math.max(metric.totalRuns - metric.newItemsFound, 0));
  const recommendationScore = Math.min(35, metric.avgRecommendationScore / 2);
  const noisePenalty = Math.min(40, metric.noiseRatio * 40);
  return Math.max(1, Math.round(50 + volumeScore + recommendationScore - stabilityPenalty - noisePenalty));
}

function sortQueriesByQuality(
  queries: string[],
  source: FeedSource,
  metrics: QueryMetric[] = []
): string[] {
  const metricMap = new Map(metrics.map((metric) => [metric.query.toLowerCase(), metric]));
  const now = Date.now();

  return [...queries]
    .filter((query) => {
      const metric = metricMap.get(query.toLowerCase());
      if (!metric?.cooldownUntil) return true;
      const cooldownUntil = Date.parse(metric.cooldownUntil);
      return !Number.isFinite(cooldownUntil) || cooldownUntil <= now;
    })
    .sort((left, right) => {
      const leftMetric = metricMap.get(left.toLowerCase());
      const rightMetric = metricMap.get(right.toLowerCase());
      const qualityDelta = queryQualityScore(rightMetric) - queryQualityScore(leftMetric);
      if (qualityDelta !== 0) return qualityDelta;

      if (source === 'mercari_jp' || source === 'rakuma') {
        const japaneseDelta = Number(isJapanese(right)) - Number(isJapanese(left));
        if (japaneseDelta !== 0) return japaneseDelta;
      }

      const cyrillicDelta = Number(isCyrillic(right)) - Number(isCyrillic(left));
      if ((source === 'avito' || source === 'kufar') && cyrillicDelta !== 0) {
        return cyrillicDelta;
      }

      return left.localeCompare(right);
    });
}

function rotationWeight(metric?: QueryMetric): number {
  const quality = queryQualityScore(metric);
  if (quality >= 90) return 6;
  if (quality >= 80) return 5;
  if (quality >= 70) return 4;
  if (quality >= 60) return 3;
  if (quality >= 45) return 2;
  return 1;
}

function buildRotationPool(
  queries: string[],
  customQuery: string | null,
  metrics: QueryMetric[]
): string[] {
  const metricMap = new Map(metrics.map((metric) => [metric.query.toLowerCase(), metric]));
  const weighted: string[] = [];

  if (customQuery?.trim()) {
    const normalized = customQuery.trim();
    for (let index = 0; index < 6; index += 1) {
      weighted.push(normalized);
    }
  }

  for (const query of queries) {
    const weight = rotationWeight(metricMap.get(query.toLowerCase()));
    for (let index = 0; index < weight; index += 1) {
      weighted.push(query);
    }
  }

  return weighted;
}

export function getNextQuery(input: {
  source: FeedSource;
  brandFocus?: string[];
  customQuery?: string | null;
  categoryKey?: SearchCategoryKey | null;
  metrics?: QueryMetric[];
  extraBrands?: string[];
  extraTags?: string[];
}): string {
  const { source, brandFocus = [], customQuery = null, categoryKey = null, metrics = [], extraBrands = [], extraTags = [] } = input;
  const key = sourceKey(source, brandFocus, customQuery, categoryKey);
  const pool = sortQueriesByQuality(sourceQueries(source, brandFocus, categoryKey, extraBrands, extraTags), source, metrics);
  const rotationPool = buildRotationPool(pool, customQuery, metrics);
  if (rotationPool.length === 0) {
    return customQuery?.trim() || 'archive jacket';
  }

  let cursor = circularState.get(key) ?? 0;
  const previous = lastQueryByKey.get(key) ?? null;
  let query = rotationPool[cursor % rotationPool.length]!;

  if (rotationPool.length > 1 && previous === query) {
    for (let attempts = 0; attempts < rotationPool.length; attempts += 1) {
      cursor = (cursor + 1) % rotationPool.length;
      query = rotationPool[cursor]!;
      if (query !== previous) {
        break;
      }
    }
  }

  circularState.set(key, (cursor + 1) % rotationPool.length);
  lastQueryByKey.set(key, query);
  return query;
}

export function getRandomQuery(input: {
  source: FeedSource;
  brandFocus?: string[];
  customQuery?: string | null;
  categoryKey?: SearchCategoryKey | null;
  metrics?: QueryMetric[];
  extraBrands?: string[];
  extraTags?: string[];
}): string {
  const { source, brandFocus = [], customQuery = null, categoryKey = null, metrics = [], extraBrands = [], extraTags = [] } = input;
  const pool = sortQueriesByQuality(sourceQueries(source, brandFocus, categoryKey, extraBrands, extraTags), source, metrics);
  const rotationPool = buildRotationPool(pool, customQuery, metrics);
  if (rotationPool.length === 0) {
    return customQuery?.trim() || 'archive jacket';
  }
  const index = Math.floor(Math.random() * rotationPool.length);
  return rotationPool[index]!;
}
