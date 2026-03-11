import { config } from './config';
import { buildApp } from './app';
import { logger } from './logger';

let runningApp: Awaited<ReturnType<typeof buildApp>>['app'] | null = null;

export async function startDesktopServer(port = config.port): Promise<string> {
  if (runningApp) {
    return `http://127.0.0.1:${port}`;
  }

  const { app } = await buildApp();
  await app.listen({ host: '127.0.0.1', port });
  runningApp = app;
  logger.info('desktop server started', { port });
  return `http://127.0.0.1:${port}`;
}

export async function stopDesktopServer(): Promise<void> {
  if (!runningApp) {
    return;
  }

  await runningApp.close();
  runningApp = null;
}
