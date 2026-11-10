import type { SessionDetail } from '@tycho/core';
import { useTycho } from './useQuery';
import { Tape } from './Tape';
import { APPROXIMATE, STAMP, costLabel, harness, span, tokens } from './format';

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function Transcript({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: d, error } = useTycho(() => window.tycho.session(id), [id]);
  if (error) return <div className="empty"><b>Could not load this session</b>{error.message}</div>;
  if (d === undefined) return <p className="small">Loading…</p>;
  if (d === null) return <div className="empty"><b>Session not found</b>It may have been removed from disk.</div>;
  const s = d.session;
  const h = harness(s.harness);
  const stamp = s.costSource ? STAMP[s.costSource] : null;
  return (
    <div className="detail">
      <button className="back" onClick={onBack}>← Sessions</button>
      <h1>{s.title}</h1>
      <p className="sub">
        <span className="chip" style={{ ['--c' as string]: h.color }}>{h.label}</span> · {s.projectPath ?? 'no project'} · {span(s.startedAt, s.updatedAt)}
      </p>
      <dl className="facts">
        <div><dt>Cost</dt><dd title={costLabel(s).title}>{costLabel(s).text} {stamp && <span className={`stamp ${stamp.code}`} title={stamp.title}>{stamp.code}</span>}</dd></div>
        <div><dt>Tokens</dt><dd>{tokens(s.totalTokens)}</dd></div>
        <div><dt>Tool calls</dt><dd>{s.toolCalls}{s.toolErrors > 0 && <span className="err"> · {s.toolErrors} failed</span>}</dd></div>
        <div><dt>Model</dt><dd>{s.model ?? '—'}</dd></div>
        <div><dt>Subagents</dt><dd>{s.subagents}</dd></div>
      </dl>
      {APPROXIMATE[s.harness] && <p className="note">{APPROXIMATE[s.harness]}</p>}
      <h2>Timeline</h2>
      <div className="tape on panel"><Tape d={d} /></div>
      <h2>Transcript</h2>
      <Messages d={d} />
    </div>
  );
}

function Messages({ d }: { d: SessionDetail }) {
  if (d.messages.length === 0) return <div className="empty">No messages with text in this session.</div>;
  return (
    <ol className="transcript">
      {d.messages.map((m) => (
        <li key={m.id} className={`msg ${m.role}${m.sessionId !== d.session.id ? ' side' : ''}`}>
          <div className="msg-head">
            <b>{m.role === 'assistant' ? m.model ?? 'assistant' : m.role === 'system' ? 'summary' : 'you'}</b>
            {m.sessionId !== d.session.id && <span>subagent</span>}
            <time dateTime={m.timestamp}>{time.format(new Date(m.timestamp))}</time>
          </div>
          <p>{m.text}</p>
        </li>
      ))}
      {d.truncated && <li className="small">Showing the first {d.messages.length} messages.</li>}
    </ol>
  );
}
