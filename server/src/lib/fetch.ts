import { config } from "../config";

const DEFAULT_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
};

export interface FetchPageResult {
  ok: boolean;
  status: number;
  statusText: string;
  html: string;
  contentType: string | null;
  finalUrl: string;
  headers: Record<string, string>;
  fetchedAt: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408;
}

export async function fetchPage(url: string): Promise<FetchPageResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        redirect: "follow",
        signal: controller.signal
      });

      const html = await response.text();
      const result: FetchPageResult = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        html,
        contentType: response.headers.get("content-type"),
        finalUrl: response.url,
        headers: Object.fromEntries(response.headers.entries()),
        fetchedAt: new Date().toISOString()
      };

      if (!response.ok && isRetryableStatus(response.status) && attempt < 2) {
        await wait(500 * attempt);
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await wait(500 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown fetch error");
}
