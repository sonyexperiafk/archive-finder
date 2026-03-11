import type { CookiePoolEntry, FeedSource } from '@avito-monitor/shared';
import { getDb } from '../db';

export interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
}

interface CookieRow {
  cookies: string;
  expires_at: string | null;
  is_valid: number;
}

interface CookiePoolRow {
  id: number;
  source: FeedSource;
  label: string | null;
  cookies_json: string;
  cookie_count: number;
  user_agent: string | null;
  notes: string | null;
  is_valid: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

function hasSourceSessionsTable(): boolean {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'source_sessions'
      LIMIT 1
    `).get() as { 1?: number } | undefined;
    return Boolean(row);
  } catch {
    return false;
  }
}

function normalizeCookie(candidate: Partial<StoredCookie> | null | undefined): StoredCookie | null {
  if (!candidate?.name || !candidate.value) {
    return null;
  }

  return {
    name: candidate.name,
    value: candidate.value,
    domain: candidate.domain,
    path: candidate.path,
    expires: candidate.expires,
    httpOnly: candidate.httpOnly,
    secure: candidate.secure
  };
}

function hasCookiePoolTable(): boolean {
  const db = getDb();
  try {
    const row = db.prepare(`
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'cookie_pool_entries'
      LIMIT 1
    `).get() as { 1?: number } | undefined;
    return Boolean(row);
  } catch {
    return false;
  }
}

function mapCookiePoolRow(row: CookiePoolRow): CookiePoolEntry {
  return {
    id: row.id,
    source: row.source,
    label: row.label,
    cookieCount: row.cookie_count,
    userAgent: row.user_agent,
    notes: row.notes,
    isValid: Boolean(row.is_valid),
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
    consecutiveFailures: row.consecutive_failures,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCookiePoolCookies(raw: string): StoredCookie[] | null {
  try {
    const parsed = JSON.parse(raw) as StoredCookie[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonCookieArray(raw: string): StoredCookie[] | null {
  try {
    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      key?: string;
      value?: string;
      domain?: string;
      path?: string;
      expires?: number;
      expirationDate?: number;
      httpOnly?: boolean;
      secure?: boolean;
    }>;

    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed
      .map((entry) => normalizeCookie({
        name: entry.name ?? entry.key ?? '',
        value: entry.value ?? '',
        domain: entry.domain,
        path: entry.path,
        expires: entry.expires ?? entry.expirationDate,
        httpOnly: entry.httpOnly,
        secure: entry.secure
      }))
      .filter((entry): entry is StoredCookie => Boolean(entry));
  } catch {
    return null;
  }
}

function parseJsonCookieObject(raw: string): StoredCookie[] | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }

    return Object.entries(parsed)
      .map(([name, value]) => normalizeCookie({ name, value }))
      .filter((entry): entry is StoredCookie => Boolean(entry));
  } catch {
    return null;
  }
}

function parseNetscapeCookieJar(raw: string): StoredCookie[] | null {
  if (!raw.includes('\t') || raw.split('\n').length < 2) {
    return null;
  }

  const cookies = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('\t'))
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 7) {
        return null;
      }

      return normalizeCookie({
        domain: parts[0],
        path: parts[2],
        secure: parts[3] === 'TRUE',
        expires: Number.parseInt(parts[4] ?? '', 10) || undefined,
        name: parts[5],
        value: parts[6]
      });
    })
    .filter((entry): entry is StoredCookie => Boolean(entry));

  return cookies.length > 0 ? cookies : null;
}

function parseCookieHeader(raw: string): StoredCookie[] {
  return raw
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) {
        return null;
      }

      return normalizeCookie({
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim()
      });
    })
    .filter((entry): entry is StoredCookie => Boolean(entry));
}

export function parseCookieInput(raw: string): StoredCookie[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    return parseJsonCookieArray(trimmed) ?? [];
  }

  if (trimmed.startsWith('{')) {
    return parseJsonCookieObject(trimmed) ?? [];
  }

  return parseNetscapeCookieJar(trimmed) ?? parseCookieHeader(trimmed);
}

export function cookiesToHeader(cookies: StoredCookie[]): string {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

export function saveImportedCookies(source: string, raw: string, userAgent?: string): {
  ok: boolean;
  count: number;
  error?: string;
} {
  if (!hasSourceSessionsTable()) {
    return {
      ok: false,
      count: 0,
      error: 'source_sessions table is missing. Start the app once so migrations can create session storage.'
    };
  }

  const cookies = parseCookieInput(raw);
  if (cookies.length === 0) {
    return {
      ok: false,
      count: 0,
      error: 'Could not parse cookies. Check the format and try again.'
    };
  }

  const db = getDb();
  const nowSeconds = Date.now() / 1000;
  const maxExpires = cookies
    .map((cookie) => cookie.expires ?? 0)
    .filter((expires) => expires > nowSeconds)
    .sort((left, right) => right - left)[0];
  const expiresAt = maxExpires
    ? new Date(maxExpires * 1000).toISOString()
    : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const label = `${source} cookies ${new Date().toLocaleString('en-US', { hour12: false })}`;

  if (hasCookiePoolTable()) {
    db.prepare(`
      INSERT INTO cookie_pool_entries (
        source,
        label,
        cookies_json,
        cookie_count,
        user_agent,
        notes,
        is_valid,
        consecutive_failures,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(
      source,
      label,
      JSON.stringify(cookies),
      cookies.length,
      userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Imported via Sources',
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  db.prepare(`
    INSERT INTO source_sessions (
      source,
      cookies,
      local_storage,
      user_agent,
      logged_in_as,
      captured_at,
      expires_at,
      is_valid
    ) VALUES (?, ?, '{}', ?, 'imported', datetime('now'), ?, 1)
    ON CONFLICT(source) DO UPDATE SET
      cookies = excluded.cookies,
      local_storage = excluded.local_storage,
      user_agent = excluded.user_agent,
      logged_in_as = excluded.logged_in_as,
      captured_at = excluded.captured_at,
      expires_at = excluded.expires_at,
      is_valid = 1
  `).run(
    source,
    JSON.stringify(cookies),
    userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    expiresAt
  );

  return { ok: true, count: cookies.length };
}

export function listCookiePoolEntries(source?: FeedSource): CookiePoolEntry[] {
  if (!hasCookiePoolTable()) {
    return [];
  }

  const rows = getDb().prepare(`
    SELECT *
    FROM cookie_pool_entries
    WHERE (? IS NULL OR source = ?)
    ORDER BY source ASC, is_valid DESC, consecutive_failures ASC, COALESCE(last_success_at, created_at) DESC, created_at DESC
  `).all(source ?? null, source ?? null) as unknown as CookiePoolRow[];

  return rows.map(mapCookiePoolRow);
}

export function addCookiePoolEntry(input: {
  source: FeedSource;
  rawCookies: string;
  label?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}): { ok: boolean; count: number; entry: CookiePoolEntry | null; error?: string } {
  if (!hasCookiePoolTable()) {
    return { ok: false, count: 0, entry: null, error: 'cookie_pool_entries table is missing. Run migrations first.' };
  }

  const cookies = parseCookieInput(input.rawCookies);
  if (cookies.length === 0) {
    return { ok: false, count: 0, entry: null, error: 'Could not parse cookies. Check the format and try again.' };
  }

  const now = new Date().toISOString();
  const info = getDb().prepare(`
    INSERT INTO cookie_pool_entries (
      source,
      label,
      cookies_json,
      cookie_count,
      user_agent,
      notes,
      is_valid,
      consecutive_failures,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
  `).run(
    input.source,
    input.label?.trim() || `${input.source} cookies ${new Date().toLocaleString('en-US', { hour12: false })}`,
    JSON.stringify(cookies),
    cookies.length,
    input.userAgent ?? null,
    input.notes ?? null,
    now,
    now
  );

  const entryId = Number(info.lastInsertRowid);
  const entry = listCookiePoolEntries(input.source).find((item) => item.id === entryId) ?? null;
  return { ok: true, count: cookies.length, entry };
}

export function deleteCookiePoolEntry(id: number): void {
  if (!hasCookiePoolTable()) {
    return;
  }
  getDb().prepare(`DELETE FROM cookie_pool_entries WHERE id = ?`).run(id);
}

export function getSourceCookieEntry(source: FeedSource): { entry: CookiePoolEntry; cookies: StoredCookie[] } | null {
  if (!hasCookiePoolTable()) {
    return null;
  }

  const row = getDb().prepare(`
    SELECT *
    FROM cookie_pool_entries
    WHERE source = ?
      AND is_valid = 1
    ORDER BY consecutive_failures ASC, COALESCE(last_success_at, created_at) DESC, created_at DESC
    LIMIT 1
  `).get(source) as CookiePoolRow | undefined;

  if (!row) {
    return null;
  }

  const cookies = parseCookiePoolCookies(row.cookies_json);
  if (!cookies || cookies.length === 0) {
    return null;
  }

  getDb().prepare(`
    UPDATE cookie_pool_entries
    SET last_used_at = ?, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), row.id);

  return {
    entry: mapCookiePoolRow(row),
    cookies
  };
}

export function getSourceCookies(source: string): StoredCookie[] | null {
  const fromPool = getSourceCookieEntry(source as FeedSource);
  if (fromPool) {
    return fromPool.cookies;
  }

  if (!hasSourceSessionsTable()) {
    return null;
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT cookies, expires_at, is_valid
    FROM source_sessions
    WHERE source = ? AND is_valid = 1
    LIMIT 1
  `).get(source) as CookieRow | undefined;

  if (!row) {
    return null;
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    db.prepare('UPDATE source_sessions SET is_valid = 0 WHERE source = ?').run(source);
    return null;
  }

  try {
    const parsed = JSON.parse(row.cookies) as StoredCookie[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function invalidateCookies(source: string): void {
  if (!hasSourceSessionsTable()) {
    return;
  }

  const db = getDb();
  db.prepare('UPDATE source_sessions SET is_valid = 0 WHERE source = ?').run(source);
}

export function markCookiePoolEntrySuccess(id: number): void {
  if (!hasCookiePoolTable()) {
    return;
  }
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE cookie_pool_entries
    SET is_valid = 1,
        consecutive_failures = 0,
        last_success_at = ?,
        last_error = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, id);
}

export function markCookiePoolEntryFailure(id: number, errorMessage: string): void {
  if (!hasCookiePoolTable()) {
    return;
  }
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE cookie_pool_entries
    SET consecutive_failures = consecutive_failures + 1,
        last_failure_at = ?,
        last_error = ?,
        is_valid = CASE WHEN consecutive_failures + 1 >= 3 THEN 0 ELSE is_valid END,
        updated_at = ?
    WHERE id = ?
  `).run(now, errorMessage, now, id);
}
