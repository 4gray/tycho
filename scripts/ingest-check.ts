// Dev tool: backfill this machine's real harness data into a scratch DB and print totals.
// Usage: npx tsx scripts/ingest-check.ts [db-path]
import { performance } from 'node:perf_hooks';
import { ADAPTERS } from '@tycho/adapters';
import { openDb, queries } from '@tycho/db';
import { Ingestor } from '@tycho/ingest';

const db = openDb(process.argv[2] ?? ':memory:');
for (const spec of ADAPTERS) {
  const t = performance.now();
  const ing = new Ingestor(db, spec);
  const res = ing.backfill();
  console.log(`${spec.harness}: ${res.length} files, ${res.reduce((a, r) => a + r.records, 0)} records, ${res.reduce((a, r) => a + r.skipped, 0)} skipped, ${Math.round(performance.now() - t)} ms`);
}
const byDay = db.prepare(`SELECT substr(timestamp,1,10) day, ROUND(SUM(cost_usd),2) cost, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_read_tokens) cr, SUM(cache_write_tokens) cw FROM usage_events GROUP BY day ORDER BY day`).all();
console.table(byDay);
console.log('unpriced models:', db.prepare(`SELECT model, COUNT(*) n FROM usage_events WHERE cost_usd IS NULL GROUP BY model`).all());
console.log('overview:', { ...queries.overview(db), daily: undefined, byModel: undefined });
