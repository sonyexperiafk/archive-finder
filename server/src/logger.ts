import { appendRuntimeLog, type AppLogLevel } from './services/appLogs';

type LogLevel = "info" | "warn" | "error";
const PROCESS_LOGGER_KEY = '__archiveFinderProcessLoggerInstalled';

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...meta
  };

  console.log(JSON.stringify(payload));
  appendRuntimeLog(level as AppLogLevel, message, meta);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    log("info", message, meta);
  },
  warn(message: string, meta?: Record<string, unknown>) {
    log("warn", message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    log("error", message, meta);
  }
};

const globalState = globalThis as typeof globalThis & { [PROCESS_LOGGER_KEY]?: boolean };
if (!globalState[PROCESS_LOGGER_KEY]) {
  globalState[PROCESS_LOGGER_KEY] = true;

  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandled rejection', {
      error: reason instanceof Error ? reason.message : String(reason)
    });
  });

  process.on('uncaughtException', (error) => {
    log('error', 'uncaught exception', {
      error: error instanceof Error ? error.message : String(error)
    });
  });
}
