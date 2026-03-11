import { openDatabase } from '../src/db';
import { applyMigrations } from '../src/lib/migrations';
import { createStore } from '../src/store';

const db = openDatabase();
applyMigrations(db);
const store = createStore(db);

const existing = store.listFeeds();
if (existing.length === 0) {
  store.createFeed({
    source: 'mercari_jp',
    searchMode: 'quick',
    fetchMode: 'direct',
    categoryKey: 'jackets',
    presetKey: 'japanese_archive',
    customQuery: null,
    name: 'Mercari JP / Japanese Archive',
    url: 'https://jp.mercari.com/search?keyword=%E3%82%B8%E3%83%A3%E3%82%B1%E3%83%83%E3%83%88&status=on_sale&sort=created_time&order=desc',
    enabled: true,
    pollIntervalSec: 30,
    filter: {
      includeKeywords: ['ジャケット', 'archive', 'designer'],
      excludeKeywords: [],
      brands: [],
      minPriceValueOptional: null,
      maxPriceValueOptional: null,
      sellerTypePreference: 'any',
      notes: 'Mercari JP стартовый источник'
    }
  });

  store.createFeed({
    source: 'kufar',
    searchMode: 'quick',
    fetchMode: 'direct',
    categoryKey: 'jackets',
    presetKey: 'high_demand',
    customQuery: null,
    name: 'Kufar BY / High Demand',
    url: 'https://api.kufar.by/search-api/v2/search/rendered-paginated?lang=ru&cat=1010&query=%D0%BA%D1%83%D1%80%D1%82%D0%BA%D0%B0&size=30&sort=lst.d',
    enabled: true,
    pollIntervalSec: 45,
    filter: {
      includeKeywords: ['куртка', 'archive', 'rare'],
      excludeKeywords: [],
      brands: [],
      minPriceValueOptional: null,
      maxPriceValueOptional: null,
      sellerTypePreference: 'any',
      notes: 'Kufar BY стартовый источник'
    }
  });

  store.createFeed({
    source: 'vinted',
    searchMode: 'quick',
    fetchMode: 'direct',
    categoryKey: 'jackets',
    presetKey: 'high_demand',
    customQuery: null,
    name: 'Vinted / High Demand',
    url: 'https://www.vinted.com/catalog?search_text=jacket&order=newest_first',
    enabled: true,
    pollIntervalSec: 60,
    filter: {
      includeKeywords: ['jacket', 'archive', 'rare'],
      excludeKeywords: [],
      brands: [],
      minPriceValueOptional: null,
      maxPriceValueOptional: null,
      sellerTypePreference: 'any',
      notes: 'Vinted стартовый источник'
    }
  });
}

db.close();
console.log('Seed complete.');
