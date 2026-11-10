import { useEffect, useRef, useState } from 'react';
import type { SearchHit } from '@tycho/core';
import { HARNESS, harness } from './format';
import { HarnessPicker, RangePicker, type Days } from './Range';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Render FTS snippet markers as <mark> elements; the text itself is never parsed as HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/);
  return <p>{parts.map((p, i) => (p.startsWith('\u0002') ? <mark key={i}>{p.slice(1, -1)}</mark> : p))}</p>;
}

export function Search({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [days, setDays] = useState<Days>(undefined);
  const [h, setH] = useState<string>();
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!q.trim()) return setHits(null);
    let alive = true;
    const t = setTimeout(() => void window.tycho.search({ q, days, harness: h, limit: 100 }).then((r) => alive && setHits(r)), 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, days, h]);
  return (
    <>
      <h1>Search</h1>
      <p className="sub">Full-text across every harness. Secrets are redacted before indexing.</p>
      <div className="search">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts, replies and summaries" aria-label="Search messages" />
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <RangePicker value={days} onChange={setDays} />
        <HarnessPicker value={h} onChange={setH} options={Object.entries(HARNESS).map(([k, v]) => [k, v.label])} />
      </div>
      {hits === null ? null : hits.length === 0 ? (
        <div className="empty">No messages match “{q}”.</div>
      ) : (
        <ol className="hits">
          {hits.map((x) => {
            const hs = harness(x.harness);
            return (
              <li key={x.messageId}>
                <button className="hit" onClick={() => onOpen(x.sessionId.includes('/agent-') ? x.sessionId.split('/')[0]! : x.sessionId)}>
                  <div className="hit-head">
                    <span className="chip" style={{ ['--c' as string]: hs.color }}>{hs.label}</span>
                    <b>{x.sessionTitle}</b>
                    <span className="small">{x.role === 'user' ? 'you' : x.role} · {x.projectPath?.split('/').pop() ?? '—'} · {when.format(new Date(x.timestamp))}</span>
                  </div>
                  <Snippet text={x.snippet} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
