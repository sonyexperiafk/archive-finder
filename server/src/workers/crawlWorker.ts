import { Worker, type Job } from 'bullmq';
import { config } from '../config';
import { redisConnectionOptions } from '../services/queue';
import type { CrawlJobData } from '../services/queue';
import type { PollerService, RunFeedResult } from '../services/poller';

interface ClosableWorker {
  close(): Promise<void>;
}

export function createCrawlWorker(poller: PollerService) {
  if (config.standaloneRuntime) {
    return {
      async close() {}
    } satisfies ClosableWorker;
  }

  const worker = new Worker<CrawlJobData, RunFeedResult>(
    'crawl',
    async (job: Job<CrawlJobData>) => {
      const result = await poller.runFeedNow(job.data.feedId);

      const error = result.latestRun?.error ?? null;
      if (error) {
        throw new Error(error);
      }

      return result;
    },
    {
      connection: redisConnectionOptions,
      concurrency: Math.max(1, Math.min(config.globalFetchConcurrency, 3)),
      limiter: {
        max: 90,
        duration: 60_000
      }
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Queue] crawl completed feed=${job.data.feedId} source=${job.data.source}`);
  });

  worker.on('failed', (job, error) => {
    console.error(
      `[Queue] crawl failed feed=${job?.data.feedId ?? 'unknown'} source=${job?.data.source ?? 'unknown'}: ${error.message}`
    );
  });

  return worker;
}
