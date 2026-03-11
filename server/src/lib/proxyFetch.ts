const PROXY_URL = process.env.PROXY_URL ?? '';
const PROXY_URLS = (process.env.PROXY_URLS ?? '')
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter(Boolean);
const dispatcherCache = new Map<string, unknown>();

function pickProxyUrl(): string {
  if (PROXY_URLS.length > 0) {
    return PROXY_URLS[Math.floor(Math.random() * PROXY_URLS.length)] ?? PROXY_URLS[0];
  }
  return PROXY_URL;
}

export function hasProxy(): boolean {
  return Boolean(PROXY_URL || PROXY_URLS.length > 0);
}

export function getProxyUrl(): string | null {
  const proxyUrl = pickProxyUrl();
  return proxyUrl || null;
}

async function getDispatcher(proxyUrl: string): Promise<unknown> {
  const existing = dispatcherCache.get(proxyUrl);
  if (existing) {
    return existing;
  }

  const { ProxyAgent } = await import('undici');
  const dispatcher = new ProxyAgent(proxyUrl);
  dispatcherCache.set(proxyUrl, dispatcher);
  return dispatcher;
}

export async function proxyFetch(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout, ...rest } = options;
  const signal = options.signal ?? AbortSignal.timeout(timeout ?? 15000);

  const proxyUrl = pickProxyUrl();
  if (!proxyUrl) {
    return fetch(url, {
      ...rest,
      signal
    });
  }

  const { fetch: undiciFetch } = await import('undici');
  const dispatcher = await getDispatcher(proxyUrl);
  const requestInit = {
    ...rest,
    signal,
    dispatcher
  };
  const undiciFetchFn = undiciFetch as unknown as (target: string, init?: unknown) => Promise<Response>;

  return undiciFetchFn(url, requestInit);
}
