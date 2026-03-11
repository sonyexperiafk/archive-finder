import fs from 'node:fs';
import path from 'node:path';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const appRoot = path.resolve(process.env.ARCHIVE_FINDER_APP_ROOT ?? process.cwd());

function resolveDefaultDataRoot(root: string): string {
  const localData = path.join(root, 'data');
  const parentData = path.resolve(root, '../data');

  if (fs.existsSync(localData)) {
    return localData;
  }

  if (fs.existsSync(parentData)) {
    return parentData;
  }

  return localData;
}

const dataRoot = path.resolve(process.env.ARCHIVE_FINDER_DATA_DIR ?? resolveDefaultDataRoot(appRoot));

export const config = {
  appRoot,
  dataRoot,
  standaloneRuntime: boolFromEnv('ARCHIVE_FINDER_STANDALONE', false),
  port: intFromEnv('PORT', 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  databasePath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataRoot, 'avito-monitor.sqlite'),
  debugDir: process.env.DEBUG_DIR ? path.resolve(process.env.DEBUG_DIR) : path.join(dataRoot, 'debug'),
  assistedBrowserDir: process.env.ASSISTED_BROWSER_DIR ? path.resolve(process.env.ASSISTED_BROWSER_DIR) : path.join(dataRoot, 'assisted'),
  spfaApiKey: process.env.SPFA_API_KEY ?? '',
  spfaBaseUrl: process.env.SPFA_BASE_URL ?? 'https://spfa.ru/api',
  spfaCookieCachePath: process.env.SPFA_COOKIE_CACHE_PATH ? path.resolve(process.env.SPFA_COOKIE_CACHE_PATH) : path.join(dataRoot, 'spfa-avito-cookie.json'),
  pollerTickMs: intFromEnv('POLLER_TICK_MS', 5000),
  globalFetchConcurrency: intFromEnv('GLOBAL_FETCH_CONCURRENCY', 3),
  requestTimeoutMs: intFromEnv('REQUEST_TIMEOUT_MS', 12000),
  renderTimeoutMs: intFromEnv('RENDER_TIMEOUT_MS', 20000),
  renderWaitMs: intFromEnv('RENDER_WAIT_MS', 4000),
  maxListingsPerFeed: intFromEnv('MAX_LISTINGS_PER_FEED', 60)
};
