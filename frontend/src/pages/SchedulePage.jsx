import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function SchedulePage() {
  const [gameweeks, setGameweeks] = useState([]);
  const [activeGW, setActiveGW] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/schedule').then(d => {
      const gws = d.gameweeks || [];
      setGameweeks(gws);
      // FPL's is_current flag stays on a GW until the next one's deadline
      // passes, not until its matches finish, so prefer an unfinished
      // is_current, then is_next, before falling back to whatever FPL marked.
      const current = gws.find(gw => gw.is_current && !gw.finished)
        || gws.find(gw => gw.is_next)
        || gws.find(gw => gw.is_current);
      setActiveGW(current?.id || 1);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const gw = gameweeks.find(g => g.id === activeGW);

  const formatDate = (iso) => {
    if (!iso) return 'TBD';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDeadline = (iso) => {
    if (!iso) return 'TBD';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  // Group fixtures by date
  const groupByDate = (fixtures) => {
    const groups = {};
    fixtures.forEach(f => {
      const date = f.kickoff ? formatDate(f.kickoff) : 'TBD';
      if (!groups[date]) groups[date] = [];
      groups[date].push(f);
    });
    return groups;
  };

  if (loading) return <div><h1>Schedule</h1><p style={{ color: 'var(--text-muted)' }}>Loading fixtures...</p></div>;

  // Find ranges for quick nav
  const currentIdx = gameweeks.findIndex(g => g.is_current || g.is_next);
  const startIdx = Math.max(0, (currentIdx > -1 ? currentIdx : 0) - 3);
  const visibleGWs = gameweeks.slice(startIdx, startIdx + 10);

  return (
    <div>
      <h1>Match Schedule</h1>

      {/* Gameweek selector */}
      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {startIdx > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => setActiveGW(1)}>« GW1</button>
        )}
        {visibleGWs.map(g => (
          <button
            key={g.id}
            className={`btn btn-sm ${g.id === activeGW ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveGW(g.id)}
            style={{ position: 'relative' }}
          >
            {g.id}
            {(g.is_current || g.is_next) && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 8, height: 8, borderRadius: '50%',
                background: g.is_current ? 'var(--green)' : 'var(--blue)',
              }} />
            )}
          </button>
        ))}
        {startIdx + 10 < gameweeks.length && (
          <button className="btn btn-sm btn-secondary" onClick={() => setActiveGW(gameweeks[gameweeks.length - 1].id)}>GW{gameweeks.length} »</button>
        )}
      </div>

      {gw && (
        <>
          {/* Gameweek header */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>{gw.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Deadline: {formatDeadline(gw.deadline)}
                </p>
              </div>
              <div>
                {gw.is_current && <span style={{
                  padding: '0.3rem 0.75rem', background: 'rgba(22,163,74,0.1)', color: 'var(--green)',
                  borderRadius: 'var(--radius)', fontSize: '0.8rem', fontWeight: 600,
                }}>Live</span>}
                {gw.is_next && <span style={{
                  padding: '0.3rem 0.75rem', background: 'rgba(37,99,235,0.1)', color: 'var(--blue)',
                  borderRadius: 'var(--radius)', fontSize: '0.8rem', fontWeight: 600,
                }}>Upcoming</span>}
                {gw.finished && <span style={{
                  padding: '0.3rem 0.75rem', background: 'var(--bg-input)',
                  borderRadius: 'var(--radius)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)',
                }}>Completed</span>}
              </div>
            </div>
          </div>

          {/* Fixtures grouped by date */}
          {gw.fixtures.length === 0 ? (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                Fixtures not yet scheduled for this gameweek.
              </p>
            </div>
          ) : (
            Object.entries(groupByDate(gw.fixtures)).map(([date, fixtures]) => (
              <div className="card" key={date} style={{ marginBottom: '0.75rem' }}>
                <p style={{
                  fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem',
                }}>{date}</p>
                {fixtures.map(f => (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', padding: '0.6rem 0',
                    borderBottom: '1px solid var(--border)',
                    gap: '0.5rem',
                  }}>
                    {/* Home team */}
                    <div style={{ flex: 1, textAlign: 'right', fontWeight: 500, fontSize: '0.9rem' }}>
                      {f.home_team}
                      <span style={{
                        marginLeft: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
                        color: 'var(--text-muted)', background: 'var(--bg-input)',
                        padding: '1px 6px', borderRadius: '3px',
                      }}>{f.home_short}</span>
                    </div>

                    {/* Score or Time */}
                    <div style={{
                      width: '100px', textAlign: 'center', fontFamily: 'var(--font-display)',
                      fontWeight: 700, fontSize: f.finished || f.started ? '1.1rem' : '0.85rem',
                      flexShrink: 0,
                    }}>
                      {f.finished || f.started ? (
                        <span>
                          {f.home_score ?? '—'} - {f.away_score ?? '—'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                          {formatTime(f.kickoff) || 'TBD'}
                        </span>
                      )}
                      {f.started && !f.finished && (
                        <span style={{
                          display: 'block', fontSize: '0.65rem', color: 'var(--green)', fontWeight: 600,
                        }}>LIVE {f.minutes}'</span>
                      )}
                    </div>

                    {/* Away team */}
                    <div style={{ flex: 1, textAlign: 'left', fontWeight: 500, fontSize: '0.9rem' }}>
                      <span style={{
                        marginRight: '0.5rem', fontSize: '0.75rem', fontWeight: 700,
                        color: 'var(--text-muted)', background: 'var(--bg-input)',
                        padding: '1px 6px', borderRadius: '3px',
                      }}>{f.away_short}</span>
                      {f.away_team}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          {/* Gameweek quick nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button
              className="btn btn-secondary"
              disabled={activeGW <= 1}
              onClick={() => setActiveGW(activeGW - 1)}
            >
              ← Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={activeGW >= gameweeks.length}
              onClick={() => setActiveGW(activeGW + 1)}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
