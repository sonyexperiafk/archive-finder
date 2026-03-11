import { chromium } from 'playwright';
import { getDb } from '../db';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type SessionSource = 'carousell' | 'vinted' | 'mercari_jp' | 'kufar' | 'rakuma';

export interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface SourceSessionRow {
  source: string;
  cookies: string | null;
  local_storage: string | null;
  user_agent: string | null;
  logged_in_as: string | null;
  captured_at: string;
  expires_at: string | null;
  is_valid: number;
}

interface SessionConfig {
  loginUrl: string;
  cookieUrl: string;
  authCookiePatterns: string[];
  successUrlPattern?: string;
  timeoutMs: number;
  sessionDurationHours: number;
}

export interface StoredSession {
  source: string;
  cookies: SessionCookie[];
  localStorage: Record<string, string>;
  userAgent: string;
  loggedInAs: string | null;
  capturedAt: string;
  expiresAt: string | null;
  isValid: boolean;
}

export interface SessionListItem {
  source: string;
  loggedInAs: string | null;
  capturedAt: string;
  isValid: boolean;
  expiresAt: string | null;
}

const LOGIN_DETECTION: Partial<Record<SessionSource, SessionConfig>> = {
  carousell: {
    loginUrl: 'https://www.carousell.com.my/login/',
    cookieUrl: 'https://www.carousell.com.my/',
    authCookiePatterns: ['at', 'rt', 'userId', 'user_id', 'authToken', 'auth_token', 'jwt', '_t', '_t2', '_carousell', 'cs_'],
    successUrlPattern: 'carousell.com.my',
    timeoutMs: 5 * 60 * 1000,
    sessionDurationHours: 168
  },
  vinted: {
    loginUrl: 'https://www.vinted.com/member/signup/select_type',
    cookieUrl: 'https://www.vinted.com/',
    authCookiePatterns: ['access_token', '_vinted_fr_session', 'user_id', 'anon_id'],
    timeoutMs: 5 * 60 * 1000,
    sessionDurationHours: 72
  },
  mercari_jp: {
    loginUrl: 'https://jp.mercari.com/',
    cookieUrl: 'https://jp.mercari.com/',
    authCookiePatterns: ['mercari_session', 'token', 'access_token'],
    timeoutMs: 5 * 60 * 1000,
    sessionDurationHours: 168
  },
  kufar: {
    loginUrl: 'https://www.kufar.by/login',
    cookieUrl: 'https://www.kufar.by/',
    authCookiePatterns: ['session', 'jwt', 'auth'],
    timeoutMs: 5 * 60 * 1000,
    sessionDurationHours: 72
  },
  rakuma: {
    loginUrl: 'https://fril.jp/login',
    cookieUrl: 'https://fril.jp/',
    authCookiePatterns: ['_fril_session', 'token', 'auth'],
    timeoutMs: 5 * 60 * 1000,
    sessionDurationHours: 168
  }
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hasSessionConfig(source: string): source is SessionSource {
  return source in LOGIN_DETECTION;
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

function scheduleRecapture(source: string): void {
  if (!hasSessionConfig(source)) {
    return;
  }

  console.warn(`[SessionManager] ${source} session expired and requires manual reconnection.`);
}

function hasAuthCookie(cookies: SessionCookie[], patterns: string[]): boolean {
  return cookies.some((cookie) =>
    patterns.some((pattern) =>
      cookie.name.toLowerCase().includes(pattern.toLowerCase()) && cookie.value.length > 10
    )
  );
}

function normalizeRow(row: SourceSessionRow): StoredSession | null {
  const isValid = Boolean(row.is_valid);
  const expiresAt = row.expires_at;
  const cookies = parseJson<SessionCookie[]>(row.cookies, []);
  const authConfig = hasSessionConfig(row.source) ? LOGIN_DETECTION[row.source] : null;
  const hasRequiredAuth = authConfig ? hasAuthCookie(cookies, authConfig.authCookiePatterns) : true;
  if (isValid && expiresAt) {
    const expiresAtDate = new Date(expiresAt);
    if (Number.isFinite(expiresAtDate.getTime()) && expiresAtDate < new Date()) {
      invalidateSession(row.source, { recapture: true });
      return {
        source: row.source,
        cookies,
        localStorage: parseJson<Record<string, string>>(row.local_storage, {}),
        userAgent: row.user_agent ?? DEFAULT_USER_AGENT,
        loggedInAs: row.logged_in_as,
        capturedAt: row.captured_at,
        expiresAt,
        isValid: false
      };
    }
  }

  if (isValid && !hasRequiredAuth) {
    invalidateSession(row.source, { recapture: true });
    return {
      source: row.source,
      cookies,
      localStorage: parseJson<Record<string, string>>(row.local_storage, {}),
      userAgent: row.user_agent ?? DEFAULT_USER_AGENT,
      loggedInAs: row.logged_in_as,
      capturedAt: row.captured_at,
      expiresAt,
      isValid: false
    };
  }

  return {
    source: row.source,
    cookies,
    localStorage: parseJson<Record<string, string>>(row.local_storage, {}),
    userAgent: row.user_agent ?? DEFAULT_USER_AGENT,
    loggedInAs: row.logged_in_as,
    capturedAt: row.captured_at,
    expiresAt,
    isValid
  };
}

async function launchChromeBrowser() {
  try {
    return await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });
  } catch (error) {
    console.warn('[SessionManager] Falling back to bundled Chromium:', error instanceof Error ? error.message : String(error));
    return chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });
  }
}

export async function launchSessionCapture(source: string): Promise<{
  success: boolean;
  loggedInAs: string | null;
  error?: string;
}> {
  const config = LOGIN_DETECTION[source as SessionSource];
  if (!config) {
    return { success: false, loggedInAs: null, error: `No config for: ${source}` };
  }

  console.log(`[SessionManager] Launching browser for ${source}...`);

  const browser = await launchChromeBrowser();
  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1400, height: 900 },
    locale: 'en-US'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    const windowWithChrome = window as Window & { chrome?: { runtime: Record<string, never> } };
    windowWithChrome.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  try {
    console.log(`[SessionManager] Opening ${config.loginUrl}`);
    await page.goto(config.loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    });

    const deadline = Date.now() + config.timeoutMs;
    let finalCookies: SessionCookie[] = [];

    console.log(`[SessionManager] Waiting for login on ${source} (up to ${config.timeoutMs / 60_000} min)...`);

    while (Date.now() < deadline) {
      await page.waitForTimeout(2_000);

      const browserCookies = await context.cookies();
      const sourceCookies = await context.cookies([config.cookieUrl]);
      const cookieNames = sourceCookies.map((cookie) => cookie.name).join(', ');
      console.log(`[SessionManager] ${source} cookies (${sourceCookies.length}): ${cookieNames}`);

      if (hasAuthCookie(sourceCookies, config.authCookiePatterns)) {
        finalCookies = sourceCookies as SessionCookie[];
        console.log(`[SessionManager] Auth cookies detected for ${source}.`);
        break;
      }

      const currentUrl = page.url();
      if (
        config.successUrlPattern
        && currentUrl.includes(config.successUrlPattern)
        && !currentUrl.includes('/login')
        && browserCookies.length > 5
      ) {
        finalCookies = sourceCookies.length > 0 ? sourceCookies as SessionCookie[] : browserCookies as SessionCookie[];
        console.log(`[SessionManager] Login detected via URL change: ${currentUrl}`);
        break;
      }
    }

    if (finalCookies.length === 0) {
      await browser.close();
      return { success: false, loggedInAs: null, error: 'Timeout waiting for login' };
    }

    if (!page.url().includes(new URL(config.cookieUrl).hostname)) {
      await page.goto(config.cookieUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000
      }).catch(() => {});
    }

    await page.waitForTimeout(2_000);
    finalCookies = await context.cookies([config.cookieUrl]) as SessionCookie[];

    const loggedInAs = await page.evaluate(() => {
      const selectors = [
        '[data-testid="topbar-profile-picture"]',
        '[aria-label="My Profile"]',
        '.username',
        '[data-testid="username"]'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim();
        if (text) {
          return text;
        }

        const alt = element?.getAttribute('alt');
        if (alt?.trim()) {
          return alt.trim();
        }
      }

      return null;
    }).catch(() => null);

    const localStorage = await page.evaluate(() => {
      return Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, index) => {
        const key = window.localStorage.key(index);
        return key ? [key, window.localStorage.getItem(key) ?? ''] : null;
      }).filter((entry): entry is [string, string] => Array.isArray(entry)));
    }).catch(() => ({} as Record<string, string>));

    const db = getDb();
    const expiresAt = new Date(Date.now() + config.sessionDurationHours * 60 * 60 * 1000).toISOString();

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
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, 1)
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
      JSON.stringify(finalCookies),
      JSON.stringify(localStorage),
      DEFAULT_USER_AGENT,
      loggedInAs,
      expiresAt
    );

    console.log(`[SessionManager] Saved ${finalCookies.length} cookies for ${source}. User: ${loggedInAs ?? 'unknown'}`);

    await browser.close();
    return { success: true, loggedInAs };
  } catch (error) {
    await browser.close().catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SessionManager] Capture failed for ${source}: ${message}`);
    return { success: false, loggedInAs: null, error: message };
  }
}

export function getStoredSession(source: string): StoredSession | null {
  if (!hasSourceSessionsTable()) {
    return null;
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT source, cookies, local_storage, user_agent, logged_in_as, captured_at, expires_at, is_valid
    FROM source_sessions
    WHERE source = ?
    LIMIT 1
  `).get(source) as SourceSessionRow | undefined;

  if (!row) {
    return null;
  }

  const normalized = normalizeRow(row);
  return normalized?.isValid ? normalized : null;
}

export function invalidateSession(source: string, options?: { recapture?: boolean }): void {
  if (!hasSourceSessionsTable()) {
    if (options?.recapture) {
      scheduleRecapture(source);
    }
    return;
  }

  const db = getDb();
  db.prepare('UPDATE source_sessions SET is_valid = 0 WHERE source = ?').run(source);
  if (options?.recapture) {
    scheduleRecapture(source);
  }
}

export function listSessions(): SessionListItem[] {
  if (!hasSourceSessionsTable()) {
    return [];
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT source, cookies, local_storage, user_agent, logged_in_as, captured_at, expires_at, is_valid
    FROM source_sessions
    ORDER BY source ASC
  `).all() as unknown as SourceSessionRow[];

  return rows
    .map((row) => normalizeRow(row))
    .filter((row): row is StoredSession => Boolean(row))
    .map((row) => ({
      source: row.source,
      loggedInAs: row.loggedInAs,
      capturedAt: row.capturedAt,
      isValid: row.isValid,
      expiresAt: row.expiresAt
    }));
}

export function saveSessionSnapshot(
  source: string,
  payload: {
    cookies: SessionCookie[];
    localStorage?: Record<string, string>;
    userAgent?: string;
    loggedInAs?: string | null;
    expiresAt?: string | null;
  }
): void {
  if (!hasSourceSessionsTable()) {
    return;
  }

  const db = getDb();
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
    ) VALUES (?, ?, ?, ?, ?, datetime('now'), ?, 1)
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
    JSON.stringify(payload.cookies),
    JSON.stringify(payload.localStorage ?? {}),
    payload.userAgent ?? DEFAULT_USER_AGENT,
    payload.loggedInAs ?? null,
    payload.expiresAt ?? null
  );
}

export function cookiesToHeader(cookies: Array<Pick<SessionCookie, 'name' | 'value'>>): string {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
