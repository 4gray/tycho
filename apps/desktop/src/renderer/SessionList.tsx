import { useEffect, useState } from 'react';
import type { SessionDetail, SessionRow } from '@tycho/core';
import { Tape } from './Tape';
import { STAMP, costLabel, harness, span, tokens } from './format';

function Strip({ s, onOpen }: { s: SessionRow; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => window.tycho.session(s.id).then((d) => alive && setDetail(d));
    void load();
    const off = window.tycho.onChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, [open, s.id, s.updatedAt]);
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
            {s.subagents > 0 && ` · ${s.subagents} subagent${s.subagents > 1 ? 's' : ''}`}
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
          <div className="fig" title={costLabel(s).title}>{costLabel(s).text}</div>
          {stamp && <span className={`stamp ${stamp.code}`} title={stamp.title}>{stamp.code}</span>}
        </div>
      </button>
      <div className={`tape${open ? ' on' : ''}`}>
        {open && (detail ? <Tape d={detail} onOpen={() => onOpen(s.id)} /> : <p className="small">Loading…</p>)}
      </div>
    </>
  );
}

export function SessionList({ rows, empty, onOpen }: { rows: SessionRow[]; empty: string; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <div className="empty">{empty}</div>;
  return <div className="rack">{rows.map((s) => <Strip key={s.id} s={s} onOpen={onOpen} />)}</div>;
}
