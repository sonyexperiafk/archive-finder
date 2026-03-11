import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

interface SpfaEnvelope<T> {
  success?: boolean;
  results?: T;
  message?: string;
}

export interface SpfaCookiePayload {
  id: number;
  cookies: Record<string, string>;
  user_agent: string;
}

export interface SpfaCookieState {
  id: number;
  cookies: Record<string, string>;
  userAgent: string;
  acquiredAt: string;
  expiresAt: string;
  lastUnblockAt: string | null;
  lastPurchaseAt: string | null;
  consecutiveBlockCount: number;
  nextPurchaseAllowedAt: string;
}

async function postSpfa<T>(path: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`${config.spfaBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });
}

export function cookiesObjectToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([name, value]) => Boolean(name) && typeof value === 'string')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function stateFromPayload(payload: SpfaCookiePayload, acquiredAt = new Date()): SpfaCookieState {
  const acquiredAtIso = acquiredAt.toISOString();
  const expiresAtIso = new Date(acquiredAt.getTime() + 12 * 60 * 60 * 1000).toISOString();
  return {
    id: payload.id,
    cookies: payload.cookies,
    userAgent: payload.user_agent,
    acquiredAt: acquiredAtIso,
    expiresAt: expiresAtIso,
    lastUnblockAt: null,
    lastPurchaseAt: acquiredAtIso,
    consecutiveBlockCount: 0,
    nextPurchaseAllowedAt: expiresAtIso
  };
}

export function readSpfaCookieState(): SpfaCookieState | null {
  try {
    const raw = fs.readFileSync(config.spfaCookieCachePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SpfaCookieState>;
    if (
      typeof parsed.id !== 'number'
      || !parsed.cookies
      || typeof parsed.userAgent !== 'string'
      || typeof parsed.acquiredAt !== 'string'
      || typeof parsed.expiresAt !== 'string'
    ) {
      return null;
    }

    return {
      id: parsed.id,
      cookies: parsed.cookies,
      userAgent: parsed.userAgent,
      acquiredAt: parsed.acquiredAt,
      expiresAt: parsed.expiresAt,
      lastUnblockAt: parsed.lastUnblockAt ?? null,
      lastPurchaseAt: parsed.lastPurchaseAt ?? parsed.acquiredAt,
      consecutiveBlockCount: typeof parsed.consecutiveBlockCount === 'number' ? parsed.consecutiveBlockCount : 0,
      nextPurchaseAllowedAt: typeof parsed.nextPurchaseAllowedAt === 'string' ? parsed.nextPurchaseAllowedAt : parsed.expiresAt
    };
  } catch {
    return null;
  }
}

export function isSpfaCookieFresh(state: SpfaCookieState, now = Date.now()): boolean {
  const expiresAt = Date.parse(state.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function canPurchaseNewSpfaCookie(state: SpfaCookieState, now = Date.now()): boolean {
  const nextAllowed = Date.parse(state.nextPurchaseAllowedAt);
  if (!Number.isFinite(nextAllowed)) {
    return !isSpfaCookieFresh(state, now);
  }
  return nextAllowed <= now;
}

export function writeSpfaCookieState(state: SpfaCookieState): void {
  fs.mkdirSync(path.dirname(config.spfaCookieCachePath), { recursive: true });
  fs.writeFileSync(config.spfaCookieCachePath, JSON.stringify(state, null, 2), 'utf8');
}

export function clearSpfaCookieState(): void {
  try {
    fs.unlinkSync(config.spfaCookieCachePath);
  } catch {
    // Ignore missing file.
  }
}

export async function fetchSpfaBalance(apiKey: string): Promise<number | null> {
  const response = await postSpfa<{ balance?: number }>('/balance/', { api_key: apiKey });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as { balance?: number };
  return typeof payload.balance === 'number' ? payload.balance : null;
}

export async function fetchSpfaCookies(apiKey: string): Promise<SpfaCookiePayload> {
  const response = await postSpfa<SpfaCookiePayload>('/cookies/', { api_key: apiKey });
  if (!response.ok) {
    throw new Error(`SPFA cookies HTTP ${response.status}`);
  }

  const payload = await response.json() as SpfaEnvelope<SpfaCookiePayload>;
  const result = payload.results;
  if (!result?.id || !result.cookies || !result.user_agent) {
    throw new Error(payload.message ?? 'SPFA returned incomplete cookies payload');
  }

  writeSpfaCookieState(stateFromPayload(result));
  return result;
}

export async function unblockSpfaCookies(apiKey: string, id: number): Promise<boolean> {
  const response = await postSpfa('/unblock/', {
    api_key: apiKey,
    id
  });

  return [200, 202, 409].includes(response.status);
}

export function markSpfaCookieUnblocked(id: number): void {
  const cached = readSpfaCookieState();
  if (!cached || cached.id !== id) {
    return;
  }

  writeSpfaCookieState({
      ...cached,
      lastUnblockAt: new Date().toISOString()
  });
}

export function markSpfaCookieBlocked(id: number): void {
  const cached = readSpfaCookieState();
  if (!cached || cached.id !== id) {
    return;
  }

  writeSpfaCookieState({
    ...cached,
    consecutiveBlockCount: cached.consecutiveBlockCount + 1
  });
}

export function markSpfaCookieHealthy(id: number): void {
  const cached = readSpfaCookieState();
  if (!cached || cached.id !== id) {
    return;
  }

  writeSpfaCookieState({
    ...cached,
    consecutiveBlockCount: 0
  });
}
