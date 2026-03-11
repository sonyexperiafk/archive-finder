import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import {
  BRAND_ALIASES,
  BRANDS,
  RESELL_MAX_PRICE_USD,
  RESELL_MIN_PRICE_USD,
  SEARCH_CATEGORIES,
  SEARCH_PRESETS,
  SEARCH_SOURCES,
  type FeedSource,
  type Gender,
  type SearchPresetKey,
  type TimeFilter,
  type Vertical,
  VERTICALS
} from '@avito-monitor/shared';
import { closeDatabase, getDb } from './db';
import { readLastHtml, readLastParseReport } from './lib/debug';
import { addCookiePoolEntry, deleteCookiePoolEntry, listCookiePoolEntries, saveImportedCookies } from './lib/cookieStore';
import { applyMigrations } from './lib/migrations';
import { readRuntimeLog, runtimeLogFilePath } from './services/appLogs';
import { deleteCustomCatalogTerm, listCustomCatalogTerms, listEnabledCustomBrands, listEnabledCustomTags, replaceCustomCatalogTerms } from './services/customCatalog';
import { diagnosticsReportFilePath, readDiagnosticsReport, writeDiagnosticsReport } from './services/diagnosticsReport';
import { PollerService } from './services/poller';
import { closeQueueServices, drainQueues, getQueueStats } from './services/queue';
import { CrawlSchedulerService } from './services/scheduler';
import { buildSearchFeed, type StartSearchInput } from './services/search';
import { getStoredSession, invalidateSession, launchSessionCapture, listSessions } from './services/sessionManager';
import { createStore } from './store';
import { createCrawlWorker } from './workers/crawlWorker';
import { createNotifyWorker } from './workers/notifyWorker';

const sourceKeys = SEARCH_SOURCES.map((source) => source.key) as [typeof SEARCH_SOURCES[number]['key'], ...typeof SEARCH_SOURCES[number]['key'][]];
const categoryKeys = SEARCH_CATEGORIES.map((category) => category.key) as [typeof SEARCH_CATEGORIES[number]['key'], ...typeof SEARCH_CATEGORIES[number]['key'][]];
const presetKeys = SEARCH_PRESETS.map((preset) => preset.key) as [typeof SEARCH_PRESETS[number]['key'], ...typeof SEARCH_PRESETS[number]['key'][]];

const FeedSourceEnum = z.enum(sourceKeys);
const SearchCategoryEnum = z.enum(categoryKeys);
const SearchPresetEnum = z.enum(presetKeys);
const SearchModeEnum = z.enum(['quick', 'exact_url']);
const TimeFilterEnum = z.enum(['all', 'today', 'week']);
const VerticalEnum = z.literal('fashion');
const GenderEnum = z.enum(['men', 'women', 'unisex']);
const SessionSourceEnum = z.enum(['avito', 'carousell', 'vinted', 'mercari_jp', 'kufar', 'rakuma']);
const CustomCatalogKindEnum = z.enum(['brand', 'tag']);
type ActiveSource = FeedSource;
const activePresetKeys = new Set<SearchPresetKey>(SEARCH_PRESETS.map((preset) => preset.key));

function normalizePresetKey(value: string | null | undefined): SearchPresetKey | null {
  if (!value) return null;
  const legacyMap: Record<string, SearchPresetKey> = {
    japanese_designer: 'japanese_archive',
    archive_2000s: 'japanese_archive'
  };
  const normalized = legacyMap[value] ?? value;
  return activePresetKeys.has(normalized as SearchPresetKey) ? (normalized as SearchPresetKey) : null;
}

const StartSearchSchema = z.object({
  sessionId: z.number().int().nullable().optional(),
  source: FeedSourceEnum,
  vertical: VerticalEnum.default('fashion'),
  categoryKey: SearchCategoryEnum,
  presetKey: SearchPresetEnum.nullable().optional(),
  searchMode: SearchModeEnum.default('quick'),
  exactUrl: z.string().trim().nullable().optional(),
  customQuery: z.string().trim().nullable().optional(),
  pollIntervalSec: z.number().int().min(30).max(900).optional(),
  minPriceValueOptional: z.number().nullable().optional(),
  maxPriceValueOptional: z.number().nullable().optional(),
  privateSellersOnly: z.boolean().default(false)
});

function validateUrlForSource(source: ActiveSource, value: string): void {
  const url = new URL(value);
  if (source === 'avito' && !url.hostname.includes('avito.ru')) {
    throw new Error('Avito requires an avito.ru URL.');
  }
  if (source === 'mercari_jp' && !url.hostname.includes('mercari.com')) {
    throw new Error('Mercari JP requires a jp.mercari.com URL.');
  }
  if (source === 'kufar' && !url.hostname.includes('kufar.by') && !url.hostname.includes('api.kufar.by')) {
    throw new Error('Kufar requires a kufar.by or api.kufar.by URL.');
  }
  if (source === 'vinted' && !url.hostname.includes('vinted.com')) {
    throw new Error('Vinted requires a vinted.com URL.');
  }
  if (source === 'carousell' && !url.hostname.includes('carousell.com')) {
    throw new Error('Carousell requires a carousell.com URL.');
  }
  if (source === 'rakuma' && !url.hostname.includes('fril.jp') && !url.hostname.includes('api.fril.jp')) {
    throw new Error('Rakuma requires a fril.jp URL.');
  }
}

function toStartSearchInput(body: unknown): StartSearchInput & { sessionId?: number | null } {
  const parsed = StartSearchSchema.parse(body);
  if (parsed.searchMode === 'exact_url' && parsed.exactUrl) {
    validateUrlForSource(parsed.source as ActiveSource, parsed.exactUrl);
  }
  return parsed as StartSearchInput & { sessionId?: number | null };
}

function activeSource(source: string): source is typeof SEARCH_SOURCES[number]['key'] {
  return SEARCH_SOURCES.some((entry) => entry.key === source);
}

function toActiveSource(source: string): ActiveSource {
  if (activeSource(source)) {
    return source as ActiveSource;
  }
  throw new Error(`Unsupported active source: ${source}`);
}

export async function buildApp() {
  const db = getDb();
  applyMigrations(db);
  const store = createStore(db);
  store.backfillListingGender();
  store.backfillVintedListings();
  const app = Fastify({ logger: false });
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'];
  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin || origin === 'null') return true;
    return allowedOrigins.includes(origin) || origin.startsWith('app://archive-finder');
  };

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true
  });

  const io = new SocketIOServer(app.server, {
    cors: {
      origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['polling', 'websocket'],
    allowUpgrades: true
  });
  const captureInProgress = new Set<string>();

  const poller = new PollerService(store, {
    emitFeedStatus(payload) {
      io.emit('feed:status', payload);
    },
    emitNewMatch(payload) {
      io.emit('listing:new_match', payload);
    },
    emitListingUpsert(payload) {
      io.emit('listing:upsert', payload);
    },
    emitListingsNew(payload) {
      io.emit('listings:new', payload);
    }
  });

  const existingFeeds = store.listFeeds();
  for (const feed of existingFeeds) {
    if (!activeSource(feed.source as string) && feed.enabled) {
      store.updateFeed(feed.id, {
        source: feed.source,
        vertical: feed.vertical,
        searchMode: feed.searchMode,
        fetchMode: feed.fetchMode,
        categoryKey: feed.categoryKey,
        presetKey: feed.presetKey,
        customQuery: feed.customQuery,
        name: feed.name,
        url: feed.url,
        enabled: false,
        pollIntervalSec: feed.pollIntervalSec,
        filter: feed.filter
      });
      continue;
    }

    if (feed.source === 'mercari_jp' && !feed.presetKey) {
      const upgraded = buildSearchFeed({
        source: 'mercari_jp',
        vertical: feed.vertical ?? 'fashion',
        categoryKey: feed.categoryKey ?? 'jackets',
        presetKey: 'japanese_archive',
        searchMode: feed.searchMode,
        exactUrl: feed.searchMode === 'exact_url' ? feed.url : undefined,
        customQuery: feed.customQuery ?? undefined,
        pollIntervalSec: 7 * 60
      });
      store.updateFeed(feed.id, { ...upgraded, enabled: feed.enabled });
      continue;
    }

    if (activeSource(feed.source as string) && feed.searchMode === 'quick') {
      const rebuilt = buildSearchFeed({
        source: toActiveSource(feed.source),
        vertical: feed.vertical ?? 'fashion',
        categoryKey: feed.categoryKey ?? 'jackets',
        presetKey: normalizePresetKey(feed.presetKey),
        searchMode: 'quick',
        customQuery: feed.customQuery ?? undefined,
        pollIntervalSec: feed.pollIntervalSec
      });
      store.updateFeed(feed.id, { ...rebuilt, enabled: feed.enabled });
    }
  }

  const afterCleanup = store.listFeeds();
  const defaultSources: Array<{ source: ActiveSource; vertical: Vertical; categoryKey: typeof SEARCH_CATEGORIES[number]['key']; presetKey: SearchPresetKey; pollIntervalSec: number; enabled?: boolean }> = [
    { source: 'avito', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'high_demand', pollIntervalSec: 9 * 60, enabled: true },
    { source: 'mercari_jp', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'japanese_archive', pollIntervalSec: 7 * 60, enabled: true },
    { source: 'kufar', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'high_demand', pollIntervalSec: 8 * 60, enabled: true },
    { source: 'vinted', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'high_demand', pollIntervalSec: 6 * 60, enabled: true },
    { source: 'carousell', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'high_demand', pollIntervalSec: 10 * 60, enabled: true },
    { source: 'rakuma', vertical: 'fashion', categoryKey: 'jackets', presetKey: 'japanese_archive', pollIntervalSec: 7 * 60, enabled: true }
  ];
  for (const entry of defaultSources) {
    if (afterCleanup.some((feed) => feed.source === entry.source)) continue;
    store.createFeed({
      ...buildSearchFeed({ ...entry, searchMode: 'quick' }),
      enabled: entry.enabled ?? true
    });
  }

  const scheduler = new CrawlSchedulerService(store, poller);
  const crawlWorker = createCrawlWorker(poller);
  const notifyWorker = createNotifyWorker();
  writeDiagnosticsReport(store);
  await scheduler.start();

  app.get('/api/health', async () => ({ ok: true, source: 'archive-finder' }));

  app.get('/api/queue/stats', async (_request, reply) => {
    const stats = await getQueueStats();
    return reply.send(stats);
  });

  app.post('/api/queue/flush', async (_request, reply) => {
    await drainQueues();
    return reply.send({ ok: true, message: 'Queues drained' });
  });

  app.get('/api/image-proxy', async (request, reply) => {
    const { url } = request.query as { url?: string };
    if (!url) {
      return reply.code(400).send('missing url');
    }

    try {
      const decodedUrl = decodeURIComponent(url);
      const target = new URL(decodedUrl);
      if (!['http:', 'https:'].includes(target.protocol)) {
        return reply.code(400).send('invalid url');
      }

      const hostname = target.hostname.toLowerCase();
      const allowedHosts = [
        'mercdn.net',
        'static.mercdn.net',
        'vinted-assets.com',
        'vinted.com',
        'fril.jp',
        'rms.kufar.by',
        'yams.kufar.by',
        'carousell.com',
        'carousell-static',
        'karousell.com',
        'sg-ex-listed',
        'avito.st',
        'img.avito.st',
        'static.avito.st',
        'i.avito.ru',
        'avatars.mds.yandex.net'
      ];
      if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        return reply.code(403).send('domain not allowed');
      }

      const response = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: decodedUrl.includes('mercdn')
            ? 'https://jp.mercari.com/'
            : decodedUrl.includes('vinted')
              ? 'https://www.vinted.com/'
              : decodedUrl.includes('fril')
                ? 'https://fril.jp/'
                : decodedUrl.includes('kufar')
                  ? 'https://www.kufar.by/'
                    : decodedUrl.includes('karousell') || decodedUrl.includes('carousell') || decodedUrl.includes('sg-ex-listed')
                      ? 'https://www.carousell.com.my/'
                    : decodedUrl.includes('avito') || decodedUrl.includes('yandex')
                      ? 'https://www.avito.ru/'
                    : 'https://google.com/',
          Accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow'
      });

      if (!response.ok) {
        console.warn('[image-proxy] upstream failed:', response.status, decodedUrl.slice(0, 120));
        return reply.code(response.status).send(`upstream ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return reply.code(400).send('not an image');
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      return reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=86400')
        .header('Access-Control-Allow-Origin', '*')
        .send(buffer);
    } catch (error) {
      console.error('[image-proxy] error:', error);
      return reply.code(502).send('proxy error');
    }
  });

  app.get('/api/config/search', async () => ({
    sources: SEARCH_SOURCES,
    categories: SEARCH_CATEGORIES,
    presets: SEARCH_PRESETS,
    verticals: VERTICALS,
    brands: BRANDS,
    aliases: BRAND_ALIASES,
    customBrands: listEnabledCustomBrands(),
    customTags: listEnabledCustomTags()
  }));

  app.get('/api/cookie-pool', async (request) => {
    const query = z.object({
      source: FeedSourceEnum.optional()
    }).parse(request.query ?? {});

    return {
      entries: listCookiePoolEntries(query.source)
    };
  });

  app.post('/api/cookie-pool', async (request, reply) => {
    const body = z.object({
      source: FeedSourceEnum,
      cookies: z.string().trim().min(1),
      label: z.string().trim().nullable().optional(),
      userAgent: z.string().trim().nullable().optional(),
      notes: z.string().trim().nullable().optional()
    }).parse(request.body);

    const result = addCookiePoolEntry({
      source: body.source,
      rawCookies: body.cookies,
      label: body.label,
      userAgent: body.userAgent,
      notes: body.notes
    });

    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      ok: true,
      cookieCount: result.count,
      entry: result.entry
    };
  });

  app.delete('/api/cookie-pool/:id', async (request, reply) => {
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    deleteCookiePoolEntry(id);
    return reply.send({ ok: true });
  });

  app.get('/api/custom-catalog', async () => ({
    brands: listCustomCatalogTerms('brand'),
    tags: listCustomCatalogTerms('tag')
  }));

  app.put('/api/custom-catalog/:kind', async (request, reply) => {
    const kind = CustomCatalogKindEnum.parse((request.params as { kind: 'brand' | 'tag' }).kind);
    const body = z.object({
      text: z.string().default('')
    }).parse(request.body ?? {});
    const terms = replaceCustomCatalogTerms(kind, body.text);
    return reply.send({ ok: true, kind, terms });
  });

  app.delete('/api/custom-catalog/:kind/:id', async (request, reply) => {
    const kind = CustomCatalogKindEnum.parse((request.params as { kind: 'brand' | 'tag' }).kind);
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    deleteCustomCatalogTerm(id);
    return reply.send({ ok: true, kind });
  });

  app.get('/api/sessions', async () => ({
    sessions: listSessions()
  }));

  app.post('/api/sessions/:source/capture', async (request, reply) => {
    const source = SessionSourceEnum.parse((request.params as { source: string }).source);
    if (captureInProgress.has(source)) {
      return reply.send({
        ok: true,
        status: 'in_progress',
        message: 'Browser already open. Please finish logging in.'
      });
    }

    captureInProgress.add(source);
    void launchSessionCapture(source)
      .then((result) => {
        captureInProgress.delete(source);
        console.log(`[Sessions] Capture result for ${source}:`, result);
      })
      .catch((error) => {
        captureInProgress.delete(source);
        console.error(`[Sessions] Capture error for ${source}:`, error);
      });

    return reply.send({
      ok: true,
      status: 'browser_opening',
      message: `Chrome window opening for ${source}. Log in when it appears.`
    });
  });

  app.post('/api/sessions/:source/import-cookies', async (request, reply) => {
    const source = FeedSourceEnum.parse((request.params as { source: string }).source);
    const { cookies, userAgent } = request.body as { cookies?: string; userAgent?: string };

    if (!cookies?.trim()) {
      return reply.code(400).send({ error: 'No cookies provided.' });
    }

    const result = saveImportedCookies(source, cookies, userAgent);
    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }

    return reply.send({ ok: true, cookieCount: result.count });
  });

  app.get('/api/sessions/:source/status', async (request, reply) => {
    const source = SessionSourceEnum.parse((request.params as { source: string }).source);
    const session = getStoredSession(source);
    return reply.send({
      source,
      connected: Boolean(session?.isValid),
      inProgress: captureInProgress.has(source),
      loggedInAs: session?.loggedInAs ?? null,
      capturedAt: session?.capturedAt ?? null
    });
  });

  app.delete('/api/sessions/:source', async (request, reply) => {
    const source = SessionSourceEnum.parse((request.params as { source: string }).source);
    invalidateSession(source);
    return reply.send({ ok: true });
  });

  app.get('/api/search-sessions', async () => ({
    sessions: poller.enrichFeeds(store.listFeeds(poller.getRunningFeedIds()).filter((session) => activeSource(session.source as string)))
  }));

  app.post('/api/search-sessions/start', async (request, reply) => {
    try {
      const input = toStartSearchInput(request.body);
      const feedInput = buildSearchFeed(input);

      let session = null;
      if (input.sessionId) {
        const existing = store.getFeedById(input.sessionId, poller.getRunningFeedIds());
        if (!existing) {
          return reply.code(404).send({ error: 'Search source not found.' });
        }
        session = store.updateFeed(input.sessionId, {
          ...feedInput,
          fetchMode: 'direct'
        });
      } else {
        session = store.createFeed(feedInput);
      }

      if (!session) {
        return reply.code(500).send({ error: 'Failed to save search source.' });
      }

      await scheduler.resume();
      await scheduler.syncFeed(session);
      const result = await poller.runFeedNow(session.id);
      return { ok: true, session: result.feed, latestRun: result.latestRun, report: result.report };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to start search.' });
    }
  });

  app.post('/api/search-sessions/:id/stop', async (request, reply) => {
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    const existing = store.getFeedById(id, poller.getRunningFeedIds());
    if (!existing) {
      return reply.code(404).send({ error: 'Search source not found.' });
    }

    const updated = store.updateFeed(id, {
      source: existing.source,
      searchMode: existing.searchMode,
      fetchMode: existing.fetchMode,
      categoryKey: existing.categoryKey,
      presetKey: existing.presetKey,
      customQuery: existing.customQuery,
      name: existing.name,
      url: existing.url,
      enabled: false,
      pollIntervalSec: existing.pollIntervalSec,
      filter: existing.filter
    });

    if (updated) {
      await scheduler.syncFeed(updated);
    }

    return { ok: true, session: poller.enrichFeed(updated) };
  });

  app.post('/api/search-sessions/:id/refresh', async (request, reply) => {
    try {
      const id = z.coerce.number().int().parse((request.params as { id: string }).id);
      await scheduler.resume();
      const result = await poller.runFeedNow(id);
      return { ok: true, session: result.feed, latestRun: result.latestRun, report: result.report };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to refresh search source.' });
    }
  });

  app.post('/api/search-sessions/:id/assisted/open-browser', async (request, reply) => {
    try {
      const id = z.coerce.number().int().parse((request.params as { id: string }).id);
      const result = await poller.openAssistedBrowser(id);
      return { ok: true, session: result.feed, latestRun: result.latestRun, report: result.report };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Local browser mode is disabled for active sources.' });
    }
  });

  app.get('/api/search-sessions/:id/runs', async (request, reply) => {
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse((request.query as { limit?: string }).limit ?? 20);
    const session = store.getFeedById(id, poller.getRunningFeedIds());
    if (!session) {
      return reply.code(404).send({ error: 'Search source not found.' });
    }

    return {
      session: poller.enrichFeed(session),
      runs: store.listFeedRuns(id, limit),
      assistedModeReady: false
    };
  });

  app.get('/api/listings', async (request) => {
    const query = z.object({
      feedId: z.coerce.number().int().optional(),
      source: FeedSourceEnum.optional(),
      vertical: VerticalEnum.default('fashion'),
      gender: GenderEnum.optional(),
      scope: z.enum(['all', 'matched', 'new']).default('all'),
      timeFilter: TimeFilterEnum.default('all'),
      minPriceUsd: z.coerce.number().default(RESELL_MIN_PRICE_USD),
      maxPriceUsd: z.coerce.number().default(RESELL_MAX_PRICE_USD),
      withPhotoOnly: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(250),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(request.query ?? {});

    return {
      listings: store.listListings({
        ...query,
        gender: query.gender as Gender | undefined
      })
    };
  });

  app.get('/api/recommendations', async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(300).default(120),
      offset: z.coerce.number().int().min(0).default(0),
      timeFilter: TimeFilterEnum.default('all'),
      vertical: VerticalEnum.optional(),
      minPriceUsd: z.coerce.number().default(RESELL_MIN_PRICE_USD),
      maxPriceUsd: z.coerce.number().default(RESELL_MAX_PRICE_USD)
    }).parse(request.query ?? {});

    return store.listRecommendations(
      query.limit,
      query.offset,
      query.timeFilter as TimeFilter,
      query.vertical,
      query.minPriceUsd,
      query.maxPriceUsd
    );
  });

  app.get('/api/opportunities', async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(40),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(request.query ?? {});

    return {
      opportunities: store.listOpportunities(query.limit, query.offset)
    };
  });

  app.get('/api/likes', async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(300).default(120),
      offset: z.coerce.number().int().min(0).default(0)
    }).parse(request.query ?? {});

    return {
      likes: store.listLikes(query.limit, query.offset)
    };
  });

  app.post('/api/likes/:listingId', async (request, reply) => {
    const listingId = z.coerce.number().int().parse((request.params as { listingId: string }).listingId);
    const { listing, liked } = store.toggleLikeListing(listingId);
    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found.' });
    }
    io.emit(liked ? 'listing:liked' : 'listing:unliked', liked ? { listing } : { listingId });
    return { ok: true, liked, listing };
  });

  app.delete('/api/likes/:listingId', async (request, reply) => {
    const listingId = z.coerce.number().int().parse((request.params as { listingId: string }).listingId);
    const listing = store.unlikeListing(listingId);
    if (!listing) {
      return reply.code(404).send({ error: 'Listing not found.' });
    }
    io.emit('listing:unliked', { listingId });
    return { ok: true, listing };
  });

  app.get('/api/events/recent', async () => ({
    events: store.listRecentEvents(50)
  }));

  app.get('/api/diagnostics/health', async () => ({
    queue: await getQueueStats(),
    diagnostics: {
      sources: store.listSourceHealth(),
      sessions: store.listSessionHealth(),
      proxies: store.listProxyHealth(),
      queries: store.listQueryMetrics(undefined, 120)
    }
  }));

  app.get('/api/diagnostics/report', async () => ({
    path: diagnosticsReportFilePath(),
    text: readDiagnosticsReport() || writeDiagnosticsReport(store)
  }));

  app.get('/api/logs/runtime', async () => ({
    path: runtimeLogFilePath(),
    text: readRuntimeLog()
  }));

  app.post('/api/admin/reset-live-state', async () => {
    await scheduler.pause();
    poller.resetLiveState();
    store.resetLiveState();
    for (const feed of store.listFeeds()) {
      store.updateFeedRuntime(feed.id, {
        effectivePollIntervalSec: feed.pollIntervalSec,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        sourceStatus: 'paused',
        lastBackoffReason: 'Live state reset. Automatic polling stays paused until the next manual run.'
      });
    }
    await drainQueues();
    writeDiagnosticsReport(store);
    return { ok: true };
  });

  app.get('/api/config/brands', async () => ({
    brands: BRANDS,
    aliases: BRAND_ALIASES,
    customBrands: listEnabledCustomBrands(),
    customTags: listEnabledCustomTags()
  }));

  app.get('/api/debug/feeds/:id/last-html', async (request, reply) => {
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    const html = readLastHtml(id);
    if (!html) {
      return reply.code(404).send({ error: 'Debug HTML is not available yet.' });
    }

    reply.header('X-Debug-File-Path', html.path);
    return reply.type('text/html; charset=utf-8').send(html.html);
  });

  app.get('/api/debug/feeds/:id/last-parse-report', async (request, reply) => {
    const id = z.coerce.number().int().parse((request.params as { id: string }).id);
    const report = readLastParseReport(id);
    if (!report) {
      return reply.code(404).send({ error: 'Parse report is not available yet.' });
    }

    return report;
  });

  app.post('/api/debug/feeds/:id/test-parse', async (request, reply) => {
    try {
      const id = z.coerce.number().int().parse((request.params as { id: string }).id);
      const report = await poller.testParse(id);
      return report;
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Failed to test parser.' });
    }
  });

  app.addHook('onClose', async () => {
    poller.stop();
    await scheduler.stop();
    await Promise.allSettled([
      crawlWorker.close(),
      notifyWorker.close()
    ]);
    await closeQueueServices();
    io.close();
    closeDatabase();
  });

  io.on('connection', (socket) => {
    socket.emit('feed:bootstrap', {
      sessions: poller.enrichFeeds(store.listFeeds(poller.getRunningFeedIds()).filter((session) => activeSource(session.source as string))),
      listings: store.listListings({
        scope: 'all',
        limit: 100,
        timeFilter: 'all',
        vertical: 'fashion',
        minPriceUsd: RESELL_MIN_PRICE_USD,
        maxPriceUsd: RESELL_MAX_PRICE_USD
      }),
      sources: SEARCH_SOURCES,
      categories: SEARCH_CATEGORIES,
      presets: SEARCH_PRESETS,
      verticals: VERTICALS,
      brands: BRANDS,
      customBrands: listEnabledCustomBrands(),
      customTags: listEnabledCustomTags()
    });
  });

  return { app, poller, store, io, scheduler, crawlWorker, notifyWorker };
}
