import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { config } from '../config';
import type { FetchPageResult } from '../lib/fetch';
import { humanDelay } from '../lib/antiBan';

interface AssistedSession {
  context: BrowserContext;
  page: Page;
}

interface CapturedResponse {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
}

interface FetchRenderedPageOptions {
  captureResponseUrls?: string[];
}

async function launchChromeHeadless() {
  try {
    return await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch {
    return chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
  }
}

async function launchChromePersistent(userDataDir: string) {
  try {
    return await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch {
    return chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
  }
}

async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).chrome = { runtime: {} };
  });
}

async function waitForSelectors(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) {
    await page.waitForTimeout(config.renderWaitMs);
    return;
  }

  await page.waitForLoadState('networkidle', { timeout: Math.min(8_000, config.renderTimeoutMs) }).catch(() => undefined);

  const deadline = Date.now() + config.renderTimeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          await page.waitForTimeout(1_000);
          return;
        }
      } catch {
        // Ignore transient selector errors and keep polling.
      }
    }

    await page.waitForTimeout(500);
  }

  await page.waitForTimeout(config.renderWaitMs);
}

async function waitForCapturedResponses(
  page: Page,
  capturedResponses: CapturedResponse[],
  patterns: string[] | undefined
): Promise<void> {
  if (!patterns?.length) {
    return;
  }

  const deadline = Date.now() + Math.min(12_000, config.renderTimeoutMs);
  while (Date.now() < deadline) {
    if (capturedResponses.some((response) => shouldCaptureResponse(response.url, patterns))) {
      await page.waitForTimeout(1_000);
      return;
    }
    await page.waitForTimeout(400);
  }
}

function shouldCaptureResponse(url: string, patterns: string[] | undefined): boolean {
  if (!patterns?.length) {
    return false;
  }

  return patterns.some((pattern) => url.includes(pattern));
}

async function buildFetchResult(
  page: Page,
  response: Awaited<ReturnType<Page['goto']>> | null,
  capturedResponses: CapturedResponse[] = []
): Promise<FetchPageResult & { capturedResponses: CapturedResponse[] }> {
  const headers: Record<string, string> = response ? await response.allHeaders().catch(() => ({} as Record<string, string>)) : {};
  return {
    ok: response?.ok() ?? true,
    status: response?.status() ?? 200,
    statusText: response?.statusText() ?? 'OK',
    html: await page.content(),
    contentType: response?.headers()['content-type'] ?? headers['content-type'] ?? 'text/html; charset=utf-8',
    finalUrl: page.url(),
    headers,
    fetchedAt: new Date().toISOString(),
    capturedResponses
  };
}

export class BrowserService {
  private readonly assistedSessions = new Map<number, AssistedSession>();

  async fetchRenderedPage(
    url: string,
    selectors: string[],
    options?: FetchRenderedPageOptions
  ): Promise<FetchPageResult & { capturedResponses: CapturedResponse[] }> {
    const browser = await launchChromeHeadless();
    const capturedResponses: CapturedResponse[] = [];

    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
      });
      await applyStealth(context);
      const page = await context.newPage();
      await humanDelay(250, 900);
      page.on('response', async (capturedResponse) => {
        if (!shouldCaptureResponse(capturedResponse.url(), options?.captureResponseUrls)) {
          return;
        }

        try {
          capturedResponses.push({
            url: capturedResponse.url(),
            status: capturedResponse.status(),
            contentType: capturedResponse.headers()['content-type'] ?? null,
            body: await capturedResponse.text()
          });
        } catch {
          // Ignore bodies that cannot be read.
        }
      });

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.renderTimeoutMs
      }).catch(() => null);
      await waitForSelectors(page, selectors);
      await waitForCapturedResponses(page, capturedResponses, options?.captureResponseUrls);
      const result = await buildFetchResult(page, response, capturedResponses);
      await context.close().catch(() => undefined);
      return result;
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  async openAssistedSession(feedId: number, url: string, selectors: string[]): Promise<FetchPageResult> {
    const existing = this.assistedSessions.get(feedId);
    if (existing) {
      return this.fetchAssistedPage(feedId, url, selectors, false);
    }

    const userDataDir = path.join(config.assistedBrowserDir, `feed-${feedId}`);
    await fs.mkdir(userDataDir, { recursive: true });
    const context = await launchChromePersistent(userDataDir);
    await applyStealth(context);
    const page = context.pages()[0] ?? await context.newPage();
    this.assistedSessions.set(feedId, { context, page });

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.renderTimeoutMs
    }).catch(() => null);
    await waitForSelectors(page, selectors);
    return buildFetchResult(page, response);
  }

  async fetchAssistedPage(feedId: number, url: string, selectors: string[], forceNavigate = true): Promise<FetchPageResult> {
    const session = this.assistedSessions.get(feedId);
    if (!session) {
      throw new Error('Local assisted mode is not open yet. Start the browser first.');
    }

    let response = null;
    if (forceNavigate || session.page.url() !== url) {
      response = await session.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.renderTimeoutMs
      }).catch(() => null);
    } else {
      response = await session.page.reload({
        waitUntil: 'domcontentloaded',
        timeout: config.renderTimeoutMs
      }).catch(() => null);
    }

    await waitForSelectors(session.page, selectors);
    return buildFetchResult(session.page, response);
  }

  hasAssistedSession(feedId: number): boolean {
    return this.assistedSessions.has(feedId);
  }

  async closeAssistedSession(feedId: number): Promise<void> {
    const session = this.assistedSessions.get(feedId);
    if (!session) {
      return;
    }

    this.assistedSessions.delete(feedId);
    await session.context.close().catch(() => undefined);
  }

  async shutdown(): Promise<void> {
    const ids = [...this.assistedSessions.keys()];
    for (const id of ids) {
      await this.closeAssistedSession(id);
    }
  }
}
