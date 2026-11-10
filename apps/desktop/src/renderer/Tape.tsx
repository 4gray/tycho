import type { SessionDetail } from '@tycho/core';
import { tokens, usd } from './format';

const MAX_LANES = 12;
const MAX_BARS = 120;

/** Tool calls on a shared time axis, one lane per tool, plus tokens per API turn. */
export function Tape({ d, onOpen }: { d: SessionDetail; onOpen?: () => void }) {
  const t0 = Date.parse(d.session.startedAt);
  const t1 = Math.max(Date.parse(d.session.updatedAt), t0 + 1);
  const pct = (iso: string | null) => (iso ? ((Date.parse(iso) - t0) / (t1 - t0)) * 100 : 0);

  const byName = new Map<string, SessionDetail['toolCalls']>();
  for (const c of d.toolCalls) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  const lanes = [...byName.entries()].sort((a, b) => b[1].length - a[1].length);
  const shown = lanes.slice(0, MAX_LANES);
  const hidden = lanes.slice(MAX_LANES).reduce((a, [, v]) => a + v.length, 0);

  // Bucket turns so very long sessions still fit.
  const per = Math.ceil(d.turns.length / MAX_BARS) || 1;
  const bars: { fresh: number; cached: number; cost: number }[] = [];
  d.turns.forEach((t, i) => {
    const b = (bars[Math.floor(i / per)] ??= { fresh: 0, cached: 0, cost: 0 });
    b.fresh += t.inputTokens + t.outputTokens + t.cacheWriteTokens;
    b.cached += t.cacheReadTokens;
    b.cost += t.costUsd ?? 0;
  });
  const maxBar = Math.max(1, ...bars.map((b) => b.fresh + b.cached));

  return (
    <div>
      {shown.length === 0 ? (
        <p className="small">No tool calls in this session.</p>
      ) : (
        <div className="gantt">
          {shown.map(([name, calls]) => (
            <Lane key={name} name={name} calls={calls} pct={pct} />
          ))}
        </div>
      )}
      {hidden > 0 && <p className="small">+{hidden} calls to {lanes.length - MAX_LANES} other tools</p>}
      {bars.length > 0 && (
        <div className="turns" aria-label="Tokens per turn">
          {bars.map((b, i) => (
            <span key={i} title={`${tokens(b.fresh)} new, ${tokens(b.cached)} cached · ${usd(b.cost)}`} style={{ height: `${((b.fresh + b.cached) / maxBar) * 100}%` }}>
              <i style={{ height: `${(b.cached / Math.max(1, b.fresh + b.cached)) * 100}%` }} />
            </span>
          ))}
        </div>
      )}
      <div className="tape-foot">
        <span>
          {d.turns.length} API turns{per > 1 ? ` (${per} per bar)` : ''} · pale = cache read
        </span>
        {onOpen && <button onClick={onOpen}>Open transcript</button>}
      </div>
    </div>
  );
}

function Lane({ name, calls, pct }: { name: string; calls: SessionDetail['toolCalls']; pct: (iso: string | null) => number }) {
  const errors = calls.filter((c) => c.status === 'error').length;
  return (
    <>
      <span title={`${calls.length} calls${errors ? `, ${errors} failed` : ''}`}>
        {name} <span className="lane-n">{calls.length}</span>
      </span>
      <div className="track">
        {calls.map((c) => {
          const left = pct(c.startedAt);
          const width = Math.max(0.6, pct(c.endedAt ?? c.startedAt) - left);
          return <div key={c.id} className={`bar${c.status === 'error' ? ' error' : ''}`} style={{ left: `${left}%`, width: `${width}%` }} />;
        })}
      </div>
    </>
  );
}
