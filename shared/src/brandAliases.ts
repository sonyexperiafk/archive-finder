import type { BrandEntry } from './brands';
import { BRAND_CATALOG } from './brands';

export function normalizeBrandText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\w\s'.+\-()]/g, '')
    .normalize('NFC');
}

export const ALIAS_MAP: Map<string, string> = new Map();
export const BRAND_ALIASES: Record<string, string> = {};

for (const brand of BRAND_CATALOG) {
  for (const alias of brand.aliases) {
    const normalized = normalizeBrandText(alias);
    ALIAS_MAP.set(normalized, brand.canonical);
    BRAND_ALIASES[normalized] = brand.canonical;
  }
}

function hasBoundary(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return pattern.test(haystack);
}

export function detectBrand(text: string): string | null {
  const normalized = normalizeBrandText(text);
  let bestMatch: { canonical: string; length: number } | null = null;

  for (const [alias, canonical] of ALIAS_MAP) {
    if (alias.length < 3) continue;
    const matched = alias.length <= 3 ? hasBoundary(normalized, alias) : normalized.includes(alias);
    if (!matched) continue;
    if (!bestMatch || alias.length > bestMatch.length) {
      bestMatch = { canonical, length: alias.length };
    }
  }

  return bestMatch?.canonical ?? null;
}

export function detectAllBrands(text: string): string[] {
  const normalized = normalizeBrandText(text);
  const found = new Set<string>();
  for (const [alias, canonical] of ALIAS_MAP) {
    if (alias.length < 3) continue;
    const matched = alias.length <= 3 ? hasBoundary(normalized, alias) : normalized.includes(alias);
    if (matched) found.add(canonical);
  }
  return [...found];
}

export function findBrandEntry(canonical: string): BrandEntry | null {
  return BRAND_CATALOG.find((brand) => brand.canonical === canonical) ?? null;
}

export function detectBrandEntry(text: string): BrandEntry | null {
  const canonical = detectBrand(text);
  if (!canonical) return null;
  return findBrandEntry(canonical);
}

export function getBrandTier(brandName: string): BrandEntry['tier'] | null {
  const entry = findBrandEntry(brandName);
  return entry?.tier ?? null;
}

export function normalizeBrandSelection(input: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of input) {
    const canonical = detectBrand(item)
      ?? BRAND_CATALOG.find((brand) => normalizeBrandText(brand.canonical) === normalizeBrandText(item))?.canonical
      ?? item.trim();
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }

  return normalized;
}
