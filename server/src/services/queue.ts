import IORedis from 'ioredis';
import { Queue, QueueEvents } from 'bullmq';
import type { FeedSource } from '@avito-monitor/shared';
import { config } from '../config';

const redisHost = process.env.REDIS_HOST ?? '127.0.0.1';
const redisPort = Number.parseInt(process.env.REDIS_PORT ?? '6379', 10);

export const redisConnectionOptions = {
  host: redisHost,
  port: Number.isFinite(redisPort) ? redisPort : 6379,
  maxRetriesPerRequest: null
} as const;

export const queueRuntimeMode = config.standaloneRuntime ? 'standalone' : 'redis';

export interface CrawlJobData {
  feedId: number;
  source: FeedSource;
  reason: 'scheduler' | 'startup' | 'manual';
}

export interface NotifyJobData {
  listingId: number;
  title: string;
  brandName: string;
  priceUsd: number | null;
  source: FeedSource;
  url: string;
  imageUrl: string | null;
  score: number;
  tier: string | null;
}

type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

function emptyCounts(): QueueCounts {
  return {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0
  };
}

const standaloneStats: { crawl: QueueCounts; notify: QueueCounts } = {
  crawl: emptyCounts(),
  notify: emptyCounts()
};

const standalonePendingFeedIds = new Set<number>();
const standalonePendingNotifyIds = new Set<string>();
let standaloneNotifyHandler: ((job: NotifyJobData) => Promise<void>) | null = null;

export const redis = queueRuntimeMode === 'redis'
  ? new IORedis(redisConnectionOptions)
  : null;

const queueEventsConnection = queueRuntimeMode === 'redis'
  ? new IORedis(redisConnectionOptions)
  : null;

export const crawlQueue = queueRuntimeMode === 'redis'
  ? new Queue<CrawlJobData>('crawl', {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30_000
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 }
      }
    })
  : null;

export const notifyQueue = queueRuntimeMode === 'redis'
  ? new Queue<NotifyJobData>('notify', {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 15_000
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 }
      }
    })
  : null;

export const crawlEvents = queueRuntimeMode === 'redis' && queueEventsConnection
  ? new QueueEvents('crawl', {
      connection: redisConnectionOptions
    })
  : null;

export function registerStandaloneNotifyHandler(handler: ((job: NotifyJobData) => Promise<void>) | null): void {
  standaloneNotifyHandler = handler;
}

export function markStandaloneFeedQueued(feedId: number): void {
  if (queueRuntimeMode !== 'standalone') return;
  standalonePendingFeedIds.add(feedId);
  standaloneStats.crawl.waiting = standalonePendingFeedIds.size;
}

export function markStandaloneCrawlStart(feedId: number): void {
  if (queueRuntimeMode !== 'standalone') return;
  standalonePendingFeedIds.delete(feedId);
  standaloneStats.crawl.waiting = standalonePendingFeedIds.size;
  standaloneStats.crawl.active += 1;
}

export function markStandaloneCrawlFinish(feedId: number, success: boolean): void {
  if (queueRuntimeMode !== 'standalone') return;
  standalonePendingFeedIds.delete(feedId);
  standaloneStats.crawl.waiting = standalonePendingFeedIds.size;
  standaloneStats.crawl.active = Math.max(0, standaloneStats.crawl.active - 1);
  if (success) {
    standaloneStats.crawl.completed += 1;
  } else {
    standaloneStats.crawl.failed += 1;
  }
}

export function setStandalonePaused(pausedCount: number): void {
  if (queueRuntimeMode !== 'standalone') return;
  standaloneStats.crawl.paused = Math.max(0, pausedCount);
}

export async function enqueueNotifyJob(job: NotifyJobData, jobId = `notify-${job.listingId}`): Promise<void> {
  if (queueRuntimeMode === 'redis' && notifyQueue) {
    await notifyQueue.add('notify', job, { jobId });
    return;
  }

  if (standalonePendingNotifyIds.has(jobId)) {
    return;
  }

  standalonePendingNotifyIds.add(jobId);
  standaloneStats.notify.waiting = standalonePendingNotifyIds.size;
  standaloneStats.notify.active += 1;

  try {
    await standaloneNotifyHandler?.(job);
    standaloneStats.notify.completed += 1;
  } catch (error) {
    standaloneStats.notify.failed += 1;
    throw error;
  } finally {
    standalonePendingNotifyIds.delete(jobId);
    standaloneStats.notify.waiting = standalonePendingNotifyIds.size;
    standaloneStats.notify.active = Math.max(0, standaloneStats.notify.active - 1);
  }
}

export async function getQueueStats() {
  if (queueRuntimeMode === 'standalone') {
    return {
      crawl: { ...standaloneStats.crawl },
      notify: { ...standaloneStats.notify }
    };
  }

  if (!crawlQueue || !notifyQueue) {
    return {
      crawl: emptyCounts(),
      notify: emptyCounts()
    };
  }

  const [crawl, notify] = await Promise.all([
    crawlQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    notifyQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused')
  ]);

  return {
    crawl,
    notify
  };
}

export async function drainQueues(): Promise<void> {
  if (queueRuntimeMode === 'standalone') {
    standalonePendingFeedIds.clear();
    standalonePendingNotifyIds.clear();
    standaloneStats.crawl.waiting = 0;
    standaloneStats.crawl.delayed = 0;
    standaloneStats.notify.waiting = 0;
    standaloneStats.notify.delayed = 0;
    return;
  }

  await Promise.all([
    crawlQueue?.drain(true),
    notifyQueue?.drain(true)
  ]);
}

export async function closeQueueServices(): Promise<void> {
  standaloneNotifyHandler = null;
  if (queueRuntimeMode === 'standalone') {
    return;
  }

  await Promise.allSettled([
    crawlEvents?.close(),
    crawlQueue?.close(),
    notifyQueue?.close(),
    redis?.quit(),
    queueEventsConnection?.quit()
  ]);
}
