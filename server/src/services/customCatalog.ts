import { getDb } from '../db';

export type CustomCatalogKind = 'brand' | 'tag';

export interface CustomCatalogTerm {
  id: number;
  kind: CustomCatalogKind;
  term: string;
  normalizedTerm: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomCatalogRow {
  id: number;
  kind: CustomCatalogKind;
  term: string;
  normalized_term: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const CACHE_TTL_MS = 5_000;

let cachedAt = 0;
let cachedRows: CustomCatalogTerm[] = [];

function normalizeTerm(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function splitBulkTerms(raw: string): string[] {
  return raw
    .split(/\r?\n|,|;/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapRow(row: CustomCatalogRow): CustomCatalogTerm {
  return {
    id: row.id,
    kind: row.kind,
    term: row.term,
    normalizedTerm: row.normalized_term,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function refreshCache(force = false): CustomCatalogTerm[] {
  if (!force && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRows;
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT id, kind, term, normalized_term, enabled, created_at, updated_at
    FROM custom_catalog_terms
    ORDER BY kind ASC, term COLLATE NOCASE ASC
  `).all() as unknown as CustomCatalogRow[];

  cachedRows = rows.map(mapRow);
  cachedAt = Date.now();
  return cachedRows;
}

function invalidateCache(): void {
  cachedAt = 0;
}

export function listCustomCatalogTerms(kind?: CustomCatalogKind): CustomCatalogTerm[] {
  const rows = refreshCache();
  return kind ? rows.filter((entry) => entry.kind === kind) : rows;
}

export function listEnabledCustomBrands(): string[] {
  return listCustomCatalogTerms('brand')
    .filter((entry) => entry.enabled)
    .map((entry) => entry.term);
}

export function listEnabledCustomTags(): string[] {
  return listCustomCatalogTerms('tag')
    .filter((entry) => entry.enabled)
    .map((entry) => entry.term);
}

export function replaceCustomCatalogTerms(kind: CustomCatalogKind, raw: string): CustomCatalogTerm[] {
  const db = getDb();
  const now = new Date().toISOString();
  const terms = [...new Set(splitBulkTerms(raw).map((entry) => normalizeTerm(entry)).filter(Boolean))]
    .map((normalized) => ({ normalized, display: splitBulkTerms(raw).find((entry) => normalizeTerm(entry) === normalized) ?? normalized }));

  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM custom_catalog_terms WHERE kind = ?`).run(kind);
    const insertStmt = db.prepare(`
      INSERT INTO custom_catalog_terms (kind, term, normalized_term, enabled, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    for (const term of terms) {
      insertStmt.run(kind, term.display, term.normalized, now, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  invalidateCache();
  return listCustomCatalogTerms(kind);
}

export function deleteCustomCatalogTerm(id: number): void {
  getDb().prepare(`DELETE FROM custom_catalog_terms WHERE id = ?`).run(id);
  invalidateCache();
}

export function detectCustomBrand(text: string): string | null {
  const normalized = normalizeTerm(text);
  let best: CustomCatalogTerm | null = null;

  for (const entry of listCustomCatalogTerms('brand')) {
    if (!entry.enabled) continue;
    const needle = entry.normalizedTerm;
    if (!needle || needle.length < 2) continue;
    if (!normalized.includes(needle)) continue;
    if (!best || needle.length > best.normalizedTerm.length) {
      best = entry;
    }
  }

  return best?.term ?? null;
}

export function matchCustomTags(text: string): string[] {
  const normalized = normalizeTerm(text);
  const matches: string[] = [];

  for (const entry of listCustomCatalogTerms('tag')) {
    if (!entry.enabled || !entry.normalizedTerm) continue;
    if (normalized.includes(entry.normalizedTerm)) {
      matches.push(entry.term);
    }
  }

  return matches;
}
