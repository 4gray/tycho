import { useState } from 'react';
import type { SessionRow } from '@tycho/core';
import { STAMP, harness, span, tokens, usd } from './format';

function Strip({ s }: { s: SessionRow }) {
  const [open, setOpen] = useState(false);
  const h = harness(s.harness);
  const stamp = s.costSource ? STAMP[s.costSource] : null;
  return (
    <>
      <button className="strip" aria-expanded={open} onClick={() => setOpen(!open)}>
        <div className="holder" style={{ ['--c' as string]: h.color }}>
          <span className="dot" style={{ background: h.color }} />
          {h.label}
        </div>
        <div>
          <div className="title">
            {s.live && <span className="live-dot" aria-label="running" />}
            {s.title}
          </div>
          <div className="meta">
            {s.model ?? 'unknown model'} · {span(s.startedAt, s.updatedAt)}
          </div>
        </div>
        <div className="proj"><div className="fig">{s.projectPath?.split('/').pop() ?? '—'}</div></div>
        <div className="tok"><div className="fig">{tokens(s.totalTokens)}</div></div>
        <div>
          <div className="fig">
            {s.toolCalls}
            {s.toolErrors > 0 && <small> · {s.toolErrors} failed</small>}
          </div>
        </div>
        <div className="cost">
          <div className="fig">{s.costSource === 'estimated' ? '~' : ''}{usd(s.costUsd)}</div>
          {stamp && <span className={`stamp ${stamp.code}`} title={stamp.title}>{stamp.code}</span>}
        </div>
      </button>
      <div className={`tape${open ? ' on' : ''}`}>
        {open && <div className="tape-foot"><span>Tool-call timeline and per-turn tokens arrive with the Claude Code adapter (M1).</span></div>}
      </div>
    </>
  );
}

export function SessionList({ rows, empty }: { rows: SessionRow[]; empty: string }) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return <div className="rack">{rows.map((s) => <Strip key={s.id} s={s} />)}</div>;
}
