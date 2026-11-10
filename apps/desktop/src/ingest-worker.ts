/**
 * Runs in an Electron utilityProcess. Sole writer to the database: backfills every adapter,
 * then watches sources and ingests appends. Talks to main only through parentPort messages.
 */
import { ADAPTERS } from '@tycho/adapters';
import { openDb } from '@tycho/db';
import { Ingestor, watchSources } from '@tycho/ingest';
import type { WorkerEvent } from './worker-protocol';

const dbPath = process.argv[2];
if (!dbPath) throw new Error('ingest-worker: missing db path');

const post = (e: WorkerEvent) => process.parentPort.postMessage(e);
const db = openDb(dbPath);

for (const spec of ADAPTERS) {
  const ing = new Ingestor(db, spec);
  try {
    let last = 0;
    ing.backfill((p) => {
      const now = Date.now();
      if (now - last > 200 || p.done === p.total) {
        last = now;
        post({ type: 'progress', ...p });
        post({ type: 'changed', topic: 'sessions' });
      }
    });
    watchSources(ing, () => post({ type: 'changed', topic: 'usage' }));
  } catch (e) {
    post({ type: 'error', harness: spec.harness, message: (e as Error).message });
  }
}
post({ type: 'ready' });
