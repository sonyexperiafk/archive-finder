import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

export type AppLogLevel = 'info' | 'warn' | 'error';

const runtimeLogPath = path.join(config.dataRoot, 'runtime-errors.log');

function ensureLogDir(): void {
  fs.mkdirSync(path.dirname(runtimeLogPath), { recursive: true });
}

export function runtimeLogFilePath(): string {
  return runtimeLogPath;
}

export function appendRuntimeLog(level: AppLogLevel, message: string, meta?: Record<string, unknown>): void {
  ensureLogDir();
  const payload = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ?? {})
  };
  fs.appendFileSync(runtimeLogPath, `${JSON.stringify(payload)}\n`, 'utf8');
}

export function readRuntimeLog(limitLines = 250): string {
  try {
    const raw = fs.readFileSync(runtimeLogPath, 'utf8');
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-limitLines).join('\n');
  } catch {
    return '';
  }
}
