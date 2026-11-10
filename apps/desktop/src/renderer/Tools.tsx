import { useState } from 'react';
import { useTycho } from './useQuery';
import { HARNESS, harness } from './format';
import { HarnessPicker, RangePicker, type Days } from './Range';

const dur = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`);
type SortKey = 'calls' | 'rate' | 'avgMs';

export function Tools() {
  const [days, setDays] = useState<Days>(30);
  const [h, setH] = useState<string>();
  const [sort, setSort] = useState<SortKey>('calls');
  const { data: rows = [] } = useTycho(() => window.tycho.tools({ days, harness: h }), [days, h]);
  const rate = (r: { calls: number; errors: number }) => (r.calls ? r.errors / r.calls : 0);
  const sorted = [...rows].sort((a, b) => (sort === 'calls' ? b.calls - a.calls : sort === 'rate' ? rate(b) - rate(a) : (b.avgMs ?? -1) - (a.avgMs ?? -1)));
  const maxCalls = Math.max(1, ...rows.map((r) => r.calls));
  const th = (k: SortKey, label: string) => (
    <th className="n">
      <button className={`sort${sort === k ? ' on' : ''}`} onClick={() => setSort(k)} aria-pressed={sort === k}>{label}</button>
    </th>
  );
  return (
    <>
      <h1>Tools</h1>
      <p className="sub">What agents reached for, how often it failed, and how long it took.</p>
      <div className="toolbar">
        <RangePicker value={days} onChange={setDays} />
        <HarnessPicker value={h} onChange={setH} options={Object.entries(HARNESS).map(([k, v]) => [k, v.label])} />
      </div>
      {rows.length === 0 ? (
        <div className="empty">No tool calls in this range.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Tool</th><th>Harness</th>{th('calls', 'Calls')}{th('rate', 'Error rate')}{th('avgMs', 'Avg')}<th className="n">p90</th></tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const er = rate(r);
              return (
                <tr key={`${r.harness}:${r.name}`}>
                  <td><code>{r.name}</code></td>
                  <td><span className="chip" style={{ ['--c' as string]: harness(r.harness).color }}>{harness(r.harness).label}</span></td>
                  <td className="n">
                    <span className="inline-bar"><i style={{ width: `${(r.calls / maxCalls) * 100}%` }} /></span>
                    {r.calls.toLocaleString()}
                  </td>
                  <td className={`n${er >= 0.1 ? ' err' : ''}`}>{r.errors ? `${(er * 100).toFixed(1)}%` : '0%'}</td>
                  <td className="n">{dur(r.avgMs)}</td>
                  <td className="n">{dur(r.p90Ms)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
