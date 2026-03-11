import type { FeedWithFilter } from '@avito-monitor/shared';
import type { Store } from '../store';
import { config } from '../config';
import type { PollerService } from './poller';
import { crawlQueue, markStandaloneFeedQueued, setStandalonePaused, type CrawlJobData } from './queue';

function schedulerId(feedId: number): string {
  return `feed-${feedId}`;
}

function immediateJobId(feedId: number): string {
  return `feed-${feedId}-immediate`;
}

function intervalMs(feed: FeedWithFilter): number {
  const configured = Math.max(feed.effectivePollIntervalSec || feed.pollIntervalSec || 60, 30);
  const seconds = feed.consecutiveFailures > 0 || feed.sourceStatus === 'backoff' || feed.sourceStatus === 'blocked'
    ? Math.max(configured, 120)
    : configured;
  return seconds * 1000;
}

function offsetMs(feedId: number): number {
  return (feedId * 7919) % 30_000;
}

function shouldEnqueueImmediately(feed: FeedWithFilter): boolean {
  if (!feed.lastCheckedAt) {
    return true;
  }

  const lastChecked = Date.parse(feed.lastCheckedAt);
  if (!Number.isFinite(lastChecked)) {
    return true;
  }

  return Date.now() - lastChecked >= intervalMs(feed);
}

async function removeImmediateJob(feedId: number): Promise<void> {
  if (!crawlQueue) return;
  const existing = await crawlQueue.getJob(immediateJobId(feedId));
  if (existing) {
    await existing.remove().catch(() => undefined);
  }
}

export class CrawlSchedulerService {
  private paused = false;

  constructor(
    private readonly store: Store,
    private readonly poller?: PollerService
  ) {}

  async start(): Promise<void> {
    if (config.standaloneRuntime) {
      if (!this.paused) {
        this.poller?.start();
      }
      await this.syncAllFeeds();
      return;
    }

    await this.syncAllFeeds();
  }

  async stop(): Promise<void> {
    if (config.standaloneRuntime) {
      setStandalonePaused(this.store.listFeeds().filter((feed) => feed.enabled).length);
      return;
    }
    // BullMQ schedulers live in Redis; no in-process timers to stop here.
  }

  async pause(): Promise<void> {
    this.paused = true;
    if (config.standaloneRuntime) {
      setStandalonePaused(this.store.listFeeds().filter((feed) => feed.enabled).length);
      this.poller?.stop();
      return;
    }
    await this.syncAllFeeds();
  }

  async resume(): Promise<void> {
    if (!this.paused) {
      if (config.standaloneRuntime) {
        setStandalonePaused(0);
      }
      return;
    }
    this.paused = false;

    if (config.standaloneRuntime) {
      setStandalonePaused(0);
      this.poller?.start();
      await this.syncAllFeeds();
      return;
    }

    await this.syncAllFeeds();
  }

  isPaused(): boolean {
    return this.paused;
  }

  async syncAllFeeds(): Promise<void> {
    const feeds = this.store.listFeeds();

    if (config.standaloneRuntime) {
      if (this.paused) {
        setStandalonePaused(feeds.filter((feed) => feed.enabled).length);
        return;
      }

      setStandalonePaused(0);
      this.poller?.start();
      for (const feed of feeds) {
        if (feed.enabled && shouldEnqueueImmediately(feed)) {
          markStandaloneFeedQueued(feed.id);
          this.poller?.requestImmediateRun(feed.id);
        }
      }
      return;
    }

    const enabledFeedIds = new Set<number>();

    for (const feed of feeds) {
      if (!this.paused && feed.enabled) {
        enabledFeedIds.add(feed.id);
        await this.syncFeed(feed);
      } else {
        await this.removeFeed(feed.id);
      }
    }

    const schedulers = await crawlQueue?.getJobSchedulers(0, -1, true);
    for (const scheduler of schedulers ?? []) {
      const id = scheduler.id ?? scheduler.key;
      if (!id || (!id.startsWith('feed-') && !id.startsWith('feed:'))) continue;

      const feedId = Number.parseInt(id.replace(/^feed[:-]/, ''), 10);
      if (!Number.isFinite(feedId) || enabledFeedIds.has(feedId)) continue;

      await crawlQueue?.removeJobScheduler(id).catch(() => undefined);
    }
  }

  async syncFeed(feed: FeedWithFilter, options: { enqueueImmediate?: boolean } = {}): Promise<void> {
    if (config.standaloneRuntime) {
      if (this.paused || !feed.enabled) {
        return;
      }

      this.poller?.start();
      if (options.enqueueImmediate || shouldEnqueueImmediately(feed)) {
        markStandaloneFeedQueued(feed.id);
        this.poller?.requestImmediateRun(feed.id);
      }
      return;
    }

    if (this.paused || !feed.enabled || !crawlQueue) {
      await this.removeFeed(feed.id);
      return;
    }

    const jobData: CrawlJobData = {
      feedId: feed.id,
      source: feed.source,
      reason: 'scheduler'
    };

    await crawlQueue.upsertJobScheduler(
      schedulerId(feed.id),
      {
        every: intervalMs(feed),
        offset: offsetMs(feed.id)
      },
      {
        name: `crawl:${feed.source}`,
        data: jobData
      }
    );

    if (options.enqueueImmediate || shouldEnqueueImmediately(feed)) {
      await crawlQueue.add(
        `crawl:${feed.source}:immediate`,
        {
          feedId: feed.id,
          source: feed.source,
          reason: options.enqueueImmediate ? 'manual' : 'startup'
        },
        {
          jobId: immediateJobId(feed.id)
        }
      );
    } else {
      await removeImmediateJob(feed.id);
    }
  }

  async removeFeed(feedId: number): Promise<void> {
    if (config.standaloneRuntime || !crawlQueue) {
      return;
    }
    await crawlQueue.removeJobScheduler(schedulerId(feedId)).catch(() => undefined);
    await removeImmediateJob(feedId);
  }
}
