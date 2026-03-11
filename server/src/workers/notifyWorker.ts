import TelegramBot from 'node-telegram-bot-api';
import { Worker, type Job } from 'bullmq';
import { config } from '../config';
import { redisConnectionOptions, registerStandaloneNotifyHandler, type NotifyJobData } from '../services/queue';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

const SOURCE_LABELS: Record<string, string> = {
  mercari_jp: 'Mercari JP',
  vinted: 'Vinted',
  avito: 'Avito',
  kufar: 'Kufar',
  rakuma: 'Rakuma',
  carousell: 'Carousell'
};

interface ClosableWorker {
  close(): Promise<void>;
}

export function createNotifyWorker() {
  const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: false }) : null;
  const sendNotification = async (data: NotifyJobData): Promise<void> => {
    if (!bot || !CHAT_ID) {
      return;
    }

    const { brandName, imageUrl, priceUsd, score, source, tier, title, url } = data;
    const lines = [
      `${tier ? `Tier ${tier}` : 'High score'} | ${score}`,
      brandName,
      title,
      priceUsd !== null ? `$${priceUsd}` : 'Price unavailable',
      SOURCE_LABELS[source] ?? source,
      url
    ];
    const message = lines.join('\n');

    if (imageUrl) {
      await bot.sendPhoto(CHAT_ID, imageUrl, { caption: message });
    } else {
      await bot.sendMessage(CHAT_ID, message);
    }
  };

  if (config.standaloneRuntime) {
    registerStandaloneNotifyHandler(sendNotification);
    return {
      async close() {
        registerStandaloneNotifyHandler(null);
      }
    } satisfies ClosableWorker;
  }

  const worker = new Worker<NotifyJobData>(
    'notify',
    async (job: Job<NotifyJobData>) => sendNotification(job.data),
    {
      connection: redisConnectionOptions
    }
  );

  worker.on('failed', (job, error) => {
    console.error(`[Queue] notify failed listing=${job?.data.listingId ?? 'unknown'}: ${error.message}`);
  });

  return worker;
}
