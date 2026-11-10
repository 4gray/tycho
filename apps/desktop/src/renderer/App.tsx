import { useState } from 'react';
import { useTycho } from './useQuery';
import { HARNESS, usd } from './format';
import { Later, Overview, Sessions, Sources } from './views';

const VIEWS = ['Overview', 'Sessions', 'Tools', 'Search', 'Sources'] as const;
type View = (typeof VIEWS)[number];

export function App() {
  const [view, setView] = useState<View>('Overview');
  const { data: ov } = useTycho(() => window.tycho.overview());
  const { data: sources = [] } = useTycho(() => window.tycho.sources());
  const issues = sources.filter((s) => s.health !== 'ok').length;

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">Tycho</div>
        <div className="readout" aria-label="API-equivalent cost">
          <div><b>{usd(ov?.costToday ?? 0)}</b><span>Today</span></div>
          <div><b>{usd(ov?.cost7d ?? 0)}</b><span>7 days</span></div>
          <div><b>{usd(ov?.cost30d ?? 0)}</b><span>30 days</span></div>
          <div className="live"><b>{ov?.liveCount ?? 0}</b><span>running</span></div>
        </div>
        <div className="note">API-equivalent cost</div>
      </header>

      <nav aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v} aria-current={view === v} onClick={() => setView(v)}>
            {v}
            {v === 'Sessions' && ov ? <small>{ov.sessionCount.toLocaleString()}</small> : null}
            {v === 'Sources' && issues > 0 ? <small className="err">{issues} issue{issues > 1 ? 's' : ''}</small> : null}
          </button>
        ))}
        <hr />
        <div className="legend">
          {Object.values(HARNESS).map((h) => (
            <span key={h.label}><i style={{ background: h.color }} />{h.label}</span>
          ))}
          <span style={{ marginTop: 8 }}><b>R</b> reported · <b>C</b> computed · <b>E</b> estimated</span>
        </div>
      </nav>

      <main>
        <section className="view on">
          {view === 'Overview' && <Overview />}
          {view === 'Sessions' && <Sessions />}
          {view === 'Sources' && <Sources />}
          {view === 'Tools' && <Later title="Tools" what="What agents reached for, and how often it failed." milestone="M3" />}
          {view === 'Search' && <Later title="Search" what="Full-text across every harness." milestone="M3" />}
        </section>
      </main>
    </div>
  );
}
