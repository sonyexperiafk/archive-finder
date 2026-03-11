import {
  BRAND_CATALOG,
  getSearchPreset,
  type FeedSource,
  type SearchCategoryKey,
  type SearchPresetKey,
  type Vertical
} from '@avito-monitor/shared';

type QuerySource = Extract<FeedSource, 'avito' | 'mercari_jp' | 'kufar' | 'vinted' | 'carousell' | 'rakuma'>;

type BuildOptions = {
  includeJapanese: boolean;
  includeEnglish: boolean;
  extraTerms?: string[];
};

const SOURCE_HINTS: Partial<Record<QuerySource, string[]>> = {
  mercari_jp: ['アーカイブ ジャケット', 'デザイナー 古着', 'ホースレザー', '本人期', 'レザージャケット デザイナー'],
  rakuma: ['アーカイブ', 'デザイナーズ', 'ヴィンテージ ジャケット', '本人期', 'ホースレザー'],
  vinted: ['archive jacket designer', 'avant garde coat', 'japanese designer', 'designer leather jacket'],
  kufar: ['дизайнерская куртка', 'архивная одежда', 'японский дизайнер', 'кожаная куртка дизайнер'],
  avito: ['дизайнерская куртка', 'архивная одежда', 'японский дизайнер куртка', 'кожаная куртка дизайнер', 'авангард одежда'],
  carousell: ['designer leather jacket', 'archive fashion', 'avant garde coat', 'japanese designer vintage']
};

const SOURCE_DEFAULT_BATCH: Record<QuerySource, number> = {
  mercari_jp: 12,
  rakuma: 10,
  vinted: 10,
  kufar: 8,
  avito: 10,
  carousell: 8
};

const tierWeight: Record<string, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
  D: 1
};

const rotatorState = new Map<string, number>();

function localizedAliasForSource(sourceId: QuerySource, aliases: string[]): string | null {
  if (sourceId !== 'mercari_jp' && sourceId !== 'rakuma') {
    return null;
  }

  return aliases.find((alias) => /[\u3040-\u30ff\u3400-\u9fff]/.test(alias)) ?? null;
}

function weightedSourceQueries(sourceId: QuerySource, focusedBrands: string[], options: BuildOptions): string[] {
  const focusedSet = focusedBrands.length > 0 ? new Set(focusedBrands) : null;
  const orderedBrands = BRAND_CATALOG
    .filter((brand) => !focusedSet || focusedSet.has(brand.canonical))
    .sort((left, right) => {
      const tierDelta = (tierWeight[right.tier] ?? 1) - (tierWeight[left.tier] ?? 1);
      if (tierDelta !== 0) return tierDelta;
      const resaleDelta = right.resaleScore - left.resaleScore;
      if (resaleDelta !== 0) return resaleDelta;
      return left.canonical.localeCompare(right.canonical);
    });

  const output: string[] = [];
  const seedTerms = [...(options.extraTerms ?? []), ...(SOURCE_HINTS[sourceId] ?? [])];
  for (const term of seedTerms) output.push(term);

  for (const brand of orderedBrands) {
    const weight = tierWeight[brand.tier] ?? 1;
    if (options.includeEnglish) {
      for (let index = 0; index < weight; index += 1) {
        output.push(brand.canonical);
      }
    }
    if (options.includeJapanese) {
      const localized = localizedAliasForSource(sourceId, brand.aliases);
      if (localized) {
        output.push(localized);
      }
    }
  }

  return output.filter(Boolean);
}

function nextRotatedBatch(key: string, queries: string[], batchSize: number): string[] {
  if (queries.length === 0) return [];

  const uniquePool = [...new Set(queries)];
  const weightedPool = queries.length >= batchSize ? queries : uniquePool;
  const start = rotatorState.get(key) ?? 0;
  const batch: string[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < weightedPool.length * 2 && batch.length < batchSize; offset += 1) {
    const index = (start + offset) % weightedPool.length;
    const query = weightedPool[index];
    if (!query || seen.has(query)) continue;
    seen.add(query);
    batch.push(query);
  }

  if (batch.length < batchSize) {
    for (const query of uniquePool) {
      if (batch.length >= batchSize) break;
      if (seen.has(query)) continue;
      seen.add(query);
      batch.push(query);
    }
  }

  rotatorState.set(key, (start + batchSize) % weightedPool.length);
  return batch;
}

function sourceBuildOptions(sourceId: QuerySource): BuildOptions {
  return {
    includeJapanese: sourceId === 'mercari_jp' || sourceId === 'rakuma',
    includeEnglish: true
  };
}

export function buildQueryPlan(
  presetIds: SearchPresetKey[],
  sourceId: QuerySource,
  _categoryKey?: SearchCategoryKey | null,
  customQuery?: string | null,
  maxQueries = SOURCE_DEFAULT_BATCH[sourceId],
  _vertical: Vertical = 'fashion'
): string[] {
  const focusedBrands = presetIds.flatMap((presetId) => getSearchPreset(presetId).brandFocus);
  const weightedQueries = weightedSourceQueries(sourceId, focusedBrands, sourceBuildOptions(sourceId));
  const allQueries = customQuery?.trim()
    ? [customQuery.trim(), ...weightedQueries]
    : weightedQueries;

  const rotatorKey = JSON.stringify({
    sourceId,
    presetIds,
    customQuery: customQuery?.trim() ?? '',
    maxQueries
  });

  return nextRotatedBatch(rotatorKey, allQueries, Math.max(1, maxQueries));
}
