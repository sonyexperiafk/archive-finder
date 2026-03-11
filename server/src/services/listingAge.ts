import type { AgeConfidence, FeedSource } from '@avito-monitor/shared';
import type { ParsedListingCandidate } from '../parser/types';

export interface ListingAgeResult {
  ageMinutes: number | null;
  postedAt: string | null;
  confidence: AgeConfidence;
  rawText: string | null;
}

const FRESH_WINDOW_MINUTES = 60;

function asIso(date: Date): string {
  return date.toISOString();
}

function validParsedDate(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function ageFromTimestamp(timestamp: number): number | null {
  if (!validParsedDate(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000));
}

function resultFromTimestamp(timestamp: number, confidence: AgeConfidence, rawText: string | null): ListingAgeResult {
  return {
    ageMinutes: ageFromTimestamp(timestamp),
    postedAt: validParsedDate(timestamp) ? new Date(timestamp).toISOString() : null,
    confidence,
    rawText
  };
}

function parseAbsoluteValue(value: unknown): ListingAgeResult | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return resultFromTimestamp(timestamp, 'high', String(value));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && /^\d{10,13}$/.test(trimmed)) {
    const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return resultFromTimestamp(timestamp, 'high', trimmed);
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return resultFromTimestamp(parsed, 'high', trimmed);
  }

  const ymd = trimmed.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2})[:：](\d{2}))?/);
  if (ymd) {
    const [, year, month, day, hour = '0', minute = '0'] = ymd;
    const timestamp = new Date(
      Number.parseInt(year, 10),
      Number.parseInt(month, 10) - 1,
      Number.parseInt(day, 10),
      Number.parseInt(hour, 10),
      Number.parseInt(minute, 10)
    ).getTime();
    return resultFromTimestamp(timestamp, hour === '0' && minute === '0' ? 'medium' : 'high', trimmed);
  }

  return null;
}

function parseRelativeEnglish(value: string): ListingAgeResult | null {
  const lowered = value.toLowerCase();
  if (!lowered) return null;
  if (lowered.includes('just now')) {
    return resultFromTimestamp(Date.now(), 'high', value);
  }
  if (lowered.startsWith('today')) {
    const timeMatch = lowered.match(/today\s+(\d{1,2})[:：](\d{2})/);
    if (!timeMatch) {
      return resultFromTimestamp(Date.now(), 'medium', value);
    }
    const [, hour, minute] = timeMatch;
    const date = new Date();
    date.setHours(Number.parseInt(hour, 10), Number.parseInt(minute, 10), 0, 0);
    return resultFromTimestamp(date.getTime(), 'high', value);
  }
  if (lowered.startsWith('yesterday')) {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timeMatch = lowered.match(/yesterday\s+(\d{1,2})[:：](\d{2})/);
    if (timeMatch) {
      date.setHours(Number.parseInt(timeMatch[1] ?? '0', 10), Number.parseInt(timeMatch[2] ?? '0', 10), 0, 0);
      return resultFromTimestamp(date.getTime(), 'high', value);
    }
    return resultFromTimestamp(date.getTime(), 'medium', value);
  }

  const relative = lowered.match(/(\d+)\s*(minute|min|hour|day|week|month|year)s?\s+ago/);
  if (!relative) return null;
  const amount = Number.parseInt(relative[1] ?? '0', 10);
  const unit = relative[2];
  const unitMinutes = unit === 'minute' || unit === 'min'
    ? 1
    : unit === 'hour'
      ? 60
      : unit === 'day'
        ? 1440
        : unit === 'week'
          ? 10080
          : unit === 'month'
            ? 43200
            : 525600;
  return resultFromTimestamp(Date.now() - amount * unitMinutes * 60000, 'high', value);
}

function parseRelativeRussian(value: string): ListingAgeResult | null {
  const normalized = value.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('только что')) {
    return resultFromTimestamp(Date.now(), 'high', value);
  }
  if (normalized.startsWith('сегодня')) {
    const timeMatch = normalized.match(/сегодня\s+(\d{1,2})[:：](\d{2})/);
    if (!timeMatch) {
      return resultFromTimestamp(Date.now(), 'medium', value);
    }
    const date = new Date();
    date.setHours(Number.parseInt(timeMatch[1] ?? '0', 10), Number.parseInt(timeMatch[2] ?? '0', 10), 0, 0);
    return resultFromTimestamp(date.getTime(), 'high', value);
  }
  if (normalized.startsWith('вчера')) {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timeMatch = normalized.match(/вчера\s+(\d{1,2})[:：](\d{2})/);
    if (timeMatch) {
      date.setHours(Number.parseInt(timeMatch[1] ?? '0', 10), Number.parseInt(timeMatch[2] ?? '0', 10), 0, 0);
      return resultFromTimestamp(date.getTime(), 'high', value);
    }
    return resultFromTimestamp(date.getTime(), 'medium', value);
  }
  if (/час назад/.test(normalized)) {
    return resultFromTimestamp(Date.now() - 60 * 60000, 'high', value);
  }

  const relative = normalized.match(/(\d+)\s*(минут(?:а|ы)?|мин|час(?:а|ов)?|ч|дн(?:я|ей)?|день|недел(?:я|и|ь)|месяц(?:а|ев)?|мес|год(?:а|ов)?|лет)\s*назад/);
  if (!relative) return null;
  const amount = Number.parseInt(relative[1] ?? '0', 10);
  const unit = relative[2] ?? '';
  const unitMinutes = unit.startsWith('мин')
    ? 1
    : unit.startsWith('час') || unit === 'ч'
      ? 60
      : unit.startsWith('недел')
        ? 10080
        : unit.startsWith('меся') || unit === 'мес'
          ? 43200
          : unit.startsWith('год') || unit === 'лет'
            ? 525600
            : 1440;
  return resultFromTimestamp(Date.now() - amount * unitMinutes * 60000, 'high', value);
}

function parseRelativeJapanese(value: string): ListingAgeResult | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.includes('たった今')) {
    return resultFromTimestamp(Date.now(), 'high', value);
  }
  if (normalized.startsWith('今日')) {
    const timeMatch = normalized.match(/今日\s*(\d{1,2})[:：](\d{2})/);
    if (!timeMatch) {
      return resultFromTimestamp(Date.now(), 'medium', value);
    }
    const date = new Date();
    date.setHours(Number.parseInt(timeMatch[1] ?? '0', 10), Number.parseInt(timeMatch[2] ?? '0', 10), 0, 0);
    return resultFromTimestamp(date.getTime(), 'high', value);
  }
  if (normalized.startsWith('昨日')) {
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timeMatch = normalized.match(/昨日\s*(\d{1,2})[:：](\d{2})/);
    if (timeMatch) {
      date.setHours(Number.parseInt(timeMatch[1] ?? '0', 10), Number.parseInt(timeMatch[2] ?? '0', 10), 0, 0);
      return resultFromTimestamp(date.getTime(), 'high', value);
    }
    return resultFromTimestamp(date.getTime(), 'medium', value);
  }

  const relative = normalized.match(/(\d+)\s*(分前|時間前|日前|週間前|ヶ月前|か月前|年前)/);
  if (!relative) return null;
  const amount = Number.parseInt(relative[1] ?? '0', 10);
  const unit = relative[2];
  const unitMinutes = unit === '分前'
    ? 1
    : unit === '時間前'
      ? 60
      : unit === '週間前'
        ? 10080
        : unit === 'ヶ月前' || unit === 'か月前'
          ? 43200
          : unit === '年前'
            ? 525600
            : 1440;
  return resultFromTimestamp(Date.now() - amount * unitMinutes * 60000, 'high', value);
}

export function parseListingAge(value: unknown): ListingAgeResult {
  const absolute = parseAbsoluteValue(value);
  if (absolute) return absolute;

  if (typeof value === 'string') {
    return parseRelativeRussian(value)
      ?? parseRelativeJapanese(value)
      ?? parseRelativeEnglish(value)
      ?? {
        ageMinutes: null,
        postedAt: null,
        confidence: 'unknown',
        rawText: value.trim() || null
      };
  }

  return {
    ageMinutes: null,
    postedAt: null,
    confidence: 'unknown',
    rawText: null
  };
}

function firstValue(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return raw[key];
    }
  }
  return null;
}

export function normalizeListingAge(source: FeedSource, rawListing: Record<string, unknown>): ListingAgeResult {
  const sourceSpecificKeys: Record<FeedSource, string[]> = {
    avito: ['postedAt', 'publishedTextOptional', 'sortTimeStamp', 'date', 'itemDate', 'createdAt'],
    vinted: ['postedAt', 'created_at_ts', 'created_at', 'updated_at'],
    mercari_jp: ['postedAt', 'created', 'updated'],
    rakuma: ['postedAt', 'publishedTextOptional', 'created_at', 'updated_at'],
    kufar: ['postedAt', 'published_at', 'list_time', 'created_at'],
    carousell: ['postedAt', 'created_time', 'createdAt', 'updatedAt', 'publishedTextOptional']
  };

  const direct = parseListingAge(firstValue(rawListing, sourceSpecificKeys[source]));
  if (direct.ageMinutes !== null || direct.postedAt) {
    return direct;
  }

  const generic = parseListingAge(firstValue(rawListing, [
    'postedAt',
    'publishedTextOptional',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
    'timestamp',
    'published',
    'date'
  ]));
  if (generic.ageMinutes !== null || generic.postedAt) {
    return generic;
  }

  return direct.rawText || generic.rawText
    ? {
        ageMinutes: null,
        postedAt: null,
        confidence: direct.confidence !== 'unknown' ? direct.confidence : generic.confidence,
        rawText: direct.rawText ?? generic.rawText
      }
    : {
        ageMinutes: null,
        postedAt: null,
        confidence: 'unknown',
        rawText: null
      };
}

export function normalizeCandidateAge(candidate: ParsedListingCandidate): ListingAgeResult {
  const raw = {
    ...(candidate.raw ?? {}),
    postedAt: candidate.postedAt ?? null,
    publishedTextOptional: candidate.publishedTextOptional ?? null
  };
  return normalizeListingAge(candidate.source, raw);
}

export function isFreshListing(ageMinutes: number | null): boolean {
  return ageMinutes !== null && ageMinutes <= FRESH_WINDOW_MINUTES;
}

export function withinFreshWindow(ageMinutes: number | null, maxAgeMinutes = FRESH_WINDOW_MINUTES): boolean {
  return ageMinutes !== null && ageMinutes <= maxAgeMinutes;
}

export function freshWindowMinutes(): number {
  return FRESH_WINDOW_MINUTES;
}

export function freshnessBucket(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'unknown';
  if (ageMinutes <= 15) return 'lt15m';
  if (ageMinutes <= 30) return 'lt30m';
  if (ageMinutes <= 60) return 'lt60m';
  return 'stale';
}
