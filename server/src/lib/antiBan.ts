export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.6261.119 Mobile Safari/537.36'
] as const;

const sourceUA: Record<string, { ua: string; assignedAt: number }> = {};

type HeaderOptions = {
  accept?: string;
  acceptLanguage?: string;
  cookie?: string;
  origin?: string;
  secFetchSite?: 'same-origin' | 'same-site' | 'cross-site' | 'none';
  extra?: Record<string, string>;
};

function chromiumClientHints(ua: string): Record<string, string> {
  if (!/(Chrome\/|Chromium\/|Edg\/)/.test(ua)) {
    return {};
  }

  const major = ua.match(/(?:Chrome|Chromium|Edg)\/(\d+)/)?.[1] ?? '122';
  const brand = ua.includes('Edg/') ? 'Microsoft Edge' : 'Google Chrome';

  const platform = ua.includes('Macintosh')
    ? '"macOS"'
    : ua.includes('Windows')
      ? '"Windows"'
      : '"Linux"';

  return {
    'sec-ch-ua': `"Not(A:Brand";v="8", "Chromium";v="${major}", "${brand}";v="${major}"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': platform
  };
}

export function pickUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0];
}

export function getSourceUA(source: string): string {
  const existing = sourceUA[source];
  if (!existing || Date.now() - existing.assignedAt > 4 * 60 * 60 * 1000) {
    sourceUA[source] = {
      ua: pickUA(),
      assignedAt: Date.now()
    };
  }
  return sourceUA[source]?.ua ?? USER_AGENTS[0];
}

export function humanDelay(minMs = 1_500, maxMs = 4_500): Promise<void> {
  const floor = Math.max(0, Math.min(minMs, maxMs));
  const ceil = Math.max(floor, Math.max(minMs, maxMs));
  const ms = floor + Math.random() * (ceil - floor) + (Math.random() < 0.1 ? 5_000 : 0);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function jitteredMs(baseMs: number, ratio = 0.25): number {
  const delta = baseMs * ratio;
  return Math.max(250, Math.round(baseMs + (Math.random() * delta * 2 - delta)));
}

export function browserHeaders(ua: string, referer?: string, options: HeaderOptions = {}): Record<string, string> {
  return {
    'User-Agent': ua,
    Accept: options.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': options.acceptLanguage ?? 'en-US,en;q=0.9,ru;q=0.8,ja;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': options.secFetchSite ?? (referer ? 'same-origin' : 'none'),
    'Sec-Fetch-User': '?1',
    ...(referer ? { Referer: referer } : {}),
    ...(options.origin ? { Origin: options.origin } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...chromiumClientHints(ua),
    ...(options.extra ?? {})
  };
}

export function apiHeaders(ua: string, referer: string, options: HeaderOptions = {}): Record<string, string> {
  return {
    'User-Agent': ua,
    Accept: options.accept ?? 'application/json, text/plain, */*',
    'Accept-Language': options.acceptLanguage ?? 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    Referer: referer,
    Origin: options.origin ?? new URL(referer).origin,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': options.secFetchSite ?? 'same-origin',
    ...(options.cookie ? { Cookie: options.cookie } : {}),
    ...chromiumClientHints(ua),
    ...(options.extra ?? {})
  };
}

export function isBlocked(body: string, status: number): boolean {
  if ([401, 403, 429, 503].includes(status)) {
    return true;
  }

  const normalized = body.toLowerCase();
  const probe = normalized.slice(0, 8000);
  if (
    probe.includes('access denied')
    || probe.includes('403 forbidden')
    || probe.includes('доступ ограничен')
    || probe.includes('problem with ip')
    || probe.includes('проблема с ip')
    || probe.includes('bot verification')
    || probe.includes('verify you are human')
    || probe.includes('too many requests')
    || probe.includes('temporarily blocked')
    || probe.includes('captcha')
    || probe.includes('cloudflare')
    || probe.includes('just a moment')
    || probe.includes('ddos-guard')
    || probe.includes('please verify')
    || probe.includes('заблокирован')
  ) {
    return true;
  }

  const looksHtml = normalized.includes('<html') || normalized.includes('<!doctype html') || normalized.includes('<title');
  return looksHtml && normalized.trim().length < 3_000;
}

export const CURRENCY_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 1 / 150,
  RUB: 1 / 90,
  BYN: 1 / 3.1,
  CNY: 1 / 7.2,
  SGD: 0.74,
  MYR: 0.22,
  AUD: 0.65,
  CAD: 0.74,
  KRW: 1 / 1330,
  HKD: 1 / 7.8,
  TWD: 0.031,
  PLN: 0.25,
  CZK: 0.044,
  SEK: 0.096,
  DKK: 0.145,
  HUF: 0.0028,
  RON: 0.22
};

export function toUsd(amount: number, currency: string): number {
  const rate = CURRENCY_RATES[currency.toUpperCase()] ?? 1;
  return Math.round(amount * rate * 100) / 100;
}
