import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await build({
  entryPoints: [path.resolve(__dirname, '../src/desktopEntry.ts')],
  outfile: path.resolve(__dirname, '../dist/desktopBundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: [
    'fastify',
    '@fastify/cors',
    'socket.io',
    'zod',
    'bullmq',
    'ioredis',
    'node-telegram-bot-api',
    'crawlee',
    '@crawlee/playwright',
    'playwright',
    'got-scraping',
    'cheerio',
    'undici'
  ],
  logLevel: 'info'
});
