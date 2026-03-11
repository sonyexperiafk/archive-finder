import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { detectBrandInText } from '@avito-monitor/shared';
import { parseAvitoSearchHtml } from '../src/parser/avito';
import { parseMercariSearchHtml } from '../src/parser/mercari';
import { matchListing } from '../src/services/matcher';

const fixturesDir = path.resolve(fileURLToPath(new URL('./fixtures', import.meta.url)));

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

describe('parseAvitoSearchHtml', () => {
  it('parses item cards with images, price text, location, and seller type', () => {
    const html = readFixture('avito-search-basic.html');
    const result = parseAvitoSearchHtml(html, 'https://www.avito.ru');

    expect(result.listings).toHaveLength(2);
    expect(result.diagnostics.cardsFound).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.strategiesUsed).toContain('card_selector');

    const [first, second] = result.listings;
    expect(first.title).toBe('Yohji Yamamoto oversized hoodie');
    expect(first.priceText).toBe('15 500 ₽');
    expect(first.locationText).toBe('Москва');
    expect(first.sellerType).toBe('private');
    expect(first.imageUrl1).toContain('hoodie-1.jpg');
    expect(first.imageUrl2).toContain('hoodie-2.jpg');
    expect(second.sellerType).toBe('business');
  });

  it('falls back to JSON-LD when DOM cards are absent', () => {
    const html = readFixture('avito-search-jsonld.html');
    const result = parseAvitoSearchHtml(html, 'https://www.avito.ru');

    expect(result.listings).toHaveLength(1);
    expect(result.diagnostics.strategiesUsed).toContain('json_ld');
    expect(result.listings[0].title).toBe('N.Hoolywood zip shirt');
    expect(result.listings[0].imageUrl2).toContain('shirt-2.jpg');
  });

  it('parses embedded JSON script state', () => {
    const html = readFixture('avito-search-embedded-json.html');
    const result = parseAvitoSearchHtml(html, 'https://www.avito.ru');

    expect(result.listings).toHaveLength(1);
    expect(result.diagnostics.strategiesUsed).toContain('embedded_json');
    expect(result.listings[0].title).toBe('Guidi leather jacket');
    expect(result.listings[0].locationText).toBe('Екатеринбург');
  });

  it('detects Avito block pages and explains why nothing was extracted', () => {
    const html = readFixture('avito-search-blocked.html');
    const result = parseAvitoSearchHtml(html, 'https://www.avito.ru');

    expect(result.listings).toHaveLength(0);
    expect(result.diagnostics.pageTitle).toContain('Доступ ограничен');
    expect(result.diagnostics.suspectedReason).toContain('ограничения доступа');
  });

  it('matches brands and include keywords through the matcher', () => {
    const html = readFixture('avito-search-basic.html');
    const result = parseAvitoSearchHtml(html, 'https://www.avito.ru');
    const hoodie = result.listings[0];

    const match = matchListing(hoodie, {
      includeKeywords: ['hoodie'],
      excludeKeywords: ['kids'],
      brands: ['yohji'],
      minPriceValueOptional: 10000,
      maxPriceValueOptional: 20000,
      sellerTypePreference: 'private',
      notes: null
    });

    expect(match.isMatch).toBe(true);
    expect(match.matchedBrand).toBe('Yohji Yamamoto');
  });
});

describe('parseMercariSearchHtml', () => {

  it('does not produce false positives for short brands like MA+', () => {
    expect(detectBrandInText('maonosuke 白×水色 パーカー')).toBe(null);
  });
  it('extracts rendered item cards from Mercari DOM', () => {
    const html = readFixture('mercari-search-rendered.html');
    const result = parseMercariSearchHtml(html, 'https://jp.mercari.com');

    expect(result.listings).toHaveLength(2);
    expect(result.diagnostics.cardsFound).toBe(3);
    expect(result.diagnostics.strategiesUsed).toContain('mercari_dom');

    const [shopListing, userListing] = result.listings;
    expect(shopListing.source).toBe('mercari_jp');
    expect(shopListing.sellerType).toBe('business');
    expect(shopListing.url).toContain('/shops/product/2JLmwQT72tPSwz7p5xdBKV');
    expect(shopListing.priceText).toBe('¥ 5,200');
    expect(userListing.sellerType).toBe('private');
    expect(userListing.url).toContain('/item/m10443741219');
    expect(userListing.imageUrl1).toContain('m10443741219_1.jpg');
  });
});

