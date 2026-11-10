/**
 * Runs in an Electron utilityProcess. Sole writer to the database: backfills every adapter,
 * then watches sources and ingests appends. Talks to main only through parentPort messages.
 */
import { ADAPTERS } from '@tycho/adapters';
import { openDb } from '@tycho/db';
import { Ingestor, redactExisting, watchSources } from '@tycho/ingest';
import type { WorkerEvent } from './worker-protocol';

const dbPath = process.argv[2];
if (!dbPath) throw new Error('ingest-worker: missing db path');

const post = (e: WorkerEvent) => process.parentPort.postMessage(e);
const db = openDb(dbPath);
const redacted = redactExisting(db);
if (redacted) post({ type: 'changed', topic: 'sessions' });

const ingestors = ADAPTERS.map((spec) => new Ingestor(db, spec));

// Watch everything first, so live sessions keep updating while a large history loads.
for (const ing of ingestors) {
  try {
    watchSources(ing, () => post({ type: 'changed', topic: 'usage' }));
  } catch (e) {
    post({ type: 'error', harness: ing.spec.harness, message: (e as Error).message });
  }
}

void (async () => {
  // Batches commit as they go; refresh the UI every couple of seconds during the first load.
  const pulse = setInterval(() => post({ type: 'changed', topic: 'sessions' }), 2000);
  for (const ing of ingestors) {
    try {
      let last = 0;
      await ing.backfillAsync((p) => {
        const now = Date.now();
        if (now - last > 200 || p.done === p.total) {
          last = now;
          post({ type: 'progress', ...p });
        }
      });
    } catch (e) {
      post({ type: 'error', harness: ing.spec.harness, message: (e as Error).message });
    }
  }
  clearInterval(pulse);
  post({ type: 'changed', topic: 'sessions' });
  post({ type: 'ready' });
})();
