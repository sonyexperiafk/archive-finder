import { closeDatabase, openDatabase } from '../src/db';
import { applyMigrations } from '../src/lib/migrations';
import { createStore } from '../src/store';
import { closeQueueServices, crawlQueue, drainQueues, notifyQueue } from '../src/services/queue';

async function tryApiReset(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:4000/api/admin/reset-live-state', {
      method: 'POST'
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  const apiReset = await tryApiReset();

  if (!apiReset) {
    const db = openDatabase();
    applyMigrations(db);
    const store = createStore(db);
    store.resetLiveState();
    db.close();
    closeDatabase();

    await drainQueues();
    await Promise.allSettled([
      crawlQueue?.clean(0, 1000, 'completed'),
      crawlQueue?.clean(0, 1000, 'failed'),
      notifyQueue?.clean(0, 1000, 'completed'),
      notifyQueue?.clean(0, 1000, 'failed')
    ]);
  }

  await closeQueueServices();
  console.log(apiReset ? 'Live state reset via API.' : 'Live state reset via direct DB/queue cleanup.');
}

await main();
