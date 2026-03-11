import fs from 'node:fs';
import path from 'node:path';
import type { FeedWithFilter } from '@avito-monitor/shared';
import type { Store } from '../store';
import { config } from '../config';
import { readRuntimeLog, runtimeLogFilePath } from './appLogs';

const reportPath = path.join(config.dataRoot, 'runtime-diagnostics.txt');

function formatDate(value: string | null | undefined): string {
  if (!value) return 'n/a';
  return value;
}

function latestRunIsHealthy(feed: FeedWithFilter): boolean {
  const run = feed.latestRun;
  if (!run) return false;
  return !run.error && (run.responseStatus === null || run.responseStatus < 400);
}

function sourceStateLabel(feed: FeedWithFilter): string {
  if (latestRunIsHealthy(feed)) return 'WORKING';
  if (feed.sourceStatus === 'paused') return 'PAUSED';
  if (feed.sourceStatus === 'blocked' || feed.sourceStatus === 'limited') return 'BLOCKED';
  return 'ISSUE';
}

function sourcePriority(feed: FeedWithFilter): number {
  if (latestRunIsHealthy(feed)) return 4;
  if (feed.sourceStatus === 'active' && !feed.lastError) return 3;
  if (feed.sourceStatus === 'active') return 2;
  if (feed.sourceStatus === 'paused') return 1;
  return 0;
}

function aggregateFeedsBySource(feeds: FeedWithFilter[]): FeedWithFilter[] {
  const bestBySource = new Map<string, FeedWithFilter>();

  for (const feed of feeds) {
    const existing = bestBySource.get(feed.source);
    if (!existing) {
      bestBySource.set(feed.source, feed);
      continue;
    }

    const existingPriority = sourcePriority(existing);
    const nextPriority = sourcePriority(feed);
    const existingCheckedAt = existing.lastCheckedAt ? Date.parse(existing.lastCheckedAt) : 0;
    const nextCheckedAt = feed.lastCheckedAt ? Date.parse(feed.lastCheckedAt) : 0;

    if (nextPriority > existingPriority || (nextPriority === existingPriority && nextCheckedAt > existingCheckedAt)) {
      bestBySource.set(feed.source, feed);
    }
  }

  return [...bestBySource.values()].sort((left, right) => {
    const statusDelta = sourcePriority(right) - sourcePriority(left);
    if (statusDelta !== 0) return statusDelta;
    return (Date.parse(right.lastCheckedAt ?? '') || 0) - (Date.parse(left.lastCheckedAt ?? '') || 0);
  });
}

export function diagnosticsReportFilePath(): string {
  return reportPath;
}

export function buildDiagnosticsReport(store: Store): string {
  const feeds = aggregateFeedsBySource(store.listFeeds());
  const sourceHealth = new Map(store.listSourceHealth().map((entry) => [entry.source, entry]));
  const sessionHealth = new Map(store.listSessionHealth().map((entry) => [entry.source, entry]));
  const proxyHealth = new Map(store.listProxyHealth().map((entry) => [entry.source, entry]));
  const topQueries = store.listQueryMetrics(undefined, 12);

  const lines: string[] = [];
  lines.push(`Archive Finder diagnostics snapshot`);
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`File: ${reportPath}`);
  lines.push('');
  lines.push(`Sources`);

  for (const feed of feeds) {
    const latestRun = feed.latestRun;
    const sourceEntry = sourceHealth.get(feed.source);
    const sessionEntry = sessionHealth.get(feed.source);
    const proxyEntry = proxyHealth.get(feed.source);
    lines.push(
      [
        `${feed.source.toUpperCase()} [${sourceStateLabel(feed)}]`,
        `status=${feed.sourceStatus}`,
        `last_check=${formatDate(feed.lastCheckedAt)}`,
        `interval=${feed.effectivePollIntervalSec}s`,
        `items=${latestRun?.itemsExtracted ?? 0}`,
        `new=${latestRun?.newMatchesFound ?? 0}`,
        `old_skip=${latestRun?.itemsSkippedByAge ?? 0}`,
        `query=${latestRun?.queryText ?? 'n/a'}`
      ].join(' | ')
    );
    lines.push(
      [
        `  last_error=${feed.lastError ?? latestRun?.error ?? 'ok'}`,
        `success_rate=${sourceEntry ? `${Math.round(sourceEntry.successRateLast50)}%` : 'n/a'}`,
        `avg_extracted=${sourceEntry ? Math.round(sourceEntry.avgItemsExtracted) : 'n/a'}`,
        `avg_new=${sourceEntry ? Math.round(sourceEntry.avgNewItemsInserted) : 'n/a'}`,
        `parser=${sourceEntry?.currentParserMode ?? 'n/a'}`,
        `session_valid=${sessionEntry ? String(sessionEntry.isValid) : 'n/a'}`,
        `proxy=${proxyEntry?.proxyId ?? 'n/a'}`,
        `proxy_success=${proxyEntry ? `${Math.round(proxyEntry.extractionSuccessRate)}%` : 'n/a'}`
      ].join(' | ')
    );
  }

  lines.push('');
  lines.push(`Top queries`);
  for (const entry of topQueries) {
    lines.push(
      [
        entry.source,
        entry.query,
        `quality=${entry.queryQualityScore}`,
        `runs=${entry.totalRuns}`,
        `found=${entry.totalFound}`,
        `new=${entry.newItemsFound}`,
        `rec=${entry.recommendationsProduced}`,
        `noise=${Math.round(entry.noiseRatio * 100)}%`,
        `cooldown=${entry.cooldownUntil ?? 'off'}`
      ].join(' | ')
    );
  }

  lines.push('');
  lines.push(`Recent runs`);
  for (const feed of feeds) {
    const run = feed.latestRun;
    if (!run) continue;
    lines.push(
      [
        feed.source,
        `started=${run.startedAt}`,
        `http=${run.responseStatus ?? 'n/a'}`,
        `items=${run.itemsExtracted}`,
        `matches=${run.matchesFound}`,
        `new=${run.newMatchesFound}`,
        `old_skip=${run.itemsSkippedByAge ?? 0}`,
        `unknown_age=${run.itemsUnknownAge ?? 0}`,
        `error=${run.error ?? 'ok'}`
      ].join(' | ')
    );
  }

  const runtimeLog = readRuntimeLog(24);
  lines.push('');
  lines.push(`Runtime log`);
  lines.push(`File: ${runtimeLogFilePath()}`);
  lines.push(runtimeLog || 'No runtime log entries yet.');

  return lines.join('\n');
}

export function writeDiagnosticsReport(store: Store): string {
  const text = buildDiagnosticsReport(store);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, text, 'utf8');
  return text;
}

export function readDiagnosticsReport(): string {
  try {
    return fs.readFileSync(reportPath, 'utf8');
  } catch {
    return '';
  }
}
