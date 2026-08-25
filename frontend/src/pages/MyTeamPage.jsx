import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFotMob } from '../api/useFotMob';

export default function MyTeamPage() {
  const [data, setData] = useState(null);
  const { PlayerLink, TeamLink } = useFotMob();
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('roster'); // roster | lineup | scores
  const [selectedGW, setSelectedGW] = useState(null);
  const [starters, setStarters] = useState(new Set());
  const [lineup, setLineup] = useState(null);
  const [gwScores, setGwScores] = useState(null);
  const [gameweeks, setGameweeks] = useState([]);
  const [savingLineup, setSavingLineup] = useState(false);
  const [carriedFrom, setCarriedFrom] = useState(null);

  const load = () => api.get('/teams/mine').then(setData).catch(() => {});

  // FPL's is_current flag stays on a GW until the next one's deadline
  // passes, not until its matches finish, so prefer an unfinished
  // is_current, then is_next, before falling back to whatever FPL marked.
  const resolveCurrentGW = (gws) => {
    const current = gws.find(g => g.is_current && !g.finished)
      || gws.find(g => g.is_next)
      || gws.find(g => g.is_current)
      || [...gws].reverse().find(g => g.finished);
    return current?.id || null;
  };

  const currentGWId = () => resolveCurrentGW(gameweeks);

  const openTab = (t) => {
    setTab(t);
    if (t === 'lineup' || t === 'scores') {
      const cur = currentGWId();
      if (cur) setSelectedGW(cur);
    }
  };

  useEffect(() => {
    load();
    api.get('/schedule').then(d => {
      const gws = d.gameweeks || [];
      setGameweeks(gws);
      const current = resolveCurrentGW(gws);
      if (current) setSelectedGW(current);
    }).catch(() => {});
  }, []);

  // Load lineup when GW changes
  useEffect(() => {
    if (!selectedGW) return;
    api.get(`/lineup/${selectedGW}`).then(l => {
      setLineup(l);
      setStarters(new Set(l.starters.map(p => p.id)));
      setCarriedFrom(l.carried_from || null);
    }).catch(() => {
      setLineup(null);
      setStarters(new Set());
      setCarriedFrom(null);
    });
    api.get(`/scores/${selectedGW}/players`).then(setGwScores).catch(() => setGwScores(null));
  }, [selectedGW]);

  const refreshScores = async () => {
    setRefreshing(true);
    try {
      const res = await api.post('/scores/refresh');
      setMsg({ text: res.message, type: 'success' });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
    setRefreshing(false);
  };

  const dropPlayer = async (playerId, name) => {
    if (!confirm(`Drop ${name}?`)) return;
    setMsg({ text: '', type: '' });
    try {
      const res = await api.post('/teams/mine/drop', { player_id: playerId });
      setMsg({ text: res.message, type: 'success' });
      // Force fresh data reload
      const fresh = await api.get(`/teams/mine?t=${Date.now()}`);
      setData(fresh);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const toggleStarter = (pid) => {
    setStarters(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else if (next.size < 11) next.add(pid);
      return next;
    });
  };

  const saveLineup = async () => {
    setSavingLineup(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await api.post('/lineup', {
        gameweek: selectedGW,
        starters: [...starters],
      });
      setMsg({ text: res.message, type: 'success' });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
    setSavingLineup(false);
  };

  const [showLogo, setShowLogo] = useState(false);

  if (!data) return <div><h1>My Team</h1><p style={{ color: 'var(--text-muted)' }}>Create a team from the Dashboard first.</p></div>;

  const cap = data.salary_cap;
  const pct = (data.salary_used / cap) * 100;
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  data.roster.forEach(p => { if (byPos[p.position]) byPos[p.position].push(p); });

  // Count starter positions
  const starterPosCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  data.roster.forEach(p => {
    if (starters.has(p.player_id)) {
      starterPosCounts[p.position] = (starterPosCounts[p.position] || 0) + 1;
    }
  });
  const formation = `${starterPosCounts.DEF}-${starterPosCounts.MID}-${starterPosCounts.FWD}`;

  // GW selector: show recent range
  const currentGWId2 = resolveCurrentGW(gameweeks);
  const currentIdx = currentGWId2 ? gameweeks.findIndex(g => g.id === currentGWId2) : 0;
  const startIdx = Math.max(0, currentIdx - 3);
  const visibleGWs = gameweeks.slice(startIdx, startIdx + 10);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative' }}>
            <img src={`/api/teams/${data.team.id}/logo`} alt=""
              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain', background: 'var(--bg-input)', cursor: 'pointer' }}
              onClick={() => setShowLogo(true)}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
            <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-input)', display: 'none',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>⚽</div>
            <label style={{
              position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%',
              background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', cursor: 'pointer', border: '2px solid var(--bg)',
            }} title="Upload team logo">
              ✎
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                const token = localStorage.getItem('token');
                try {
                  await fetch('/api/teams/mine/logo', {
                    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
                  });
                  setMsg({ text: 'Team logo updated!', type: 'success' });
                  window.location.reload();
                } catch { setMsg({ text: 'Upload failed', type: 'error' }); }
              }} />
            </label>
          </div>
          <h1 style={{ margin: 0 }}>{data.team.name}</h1>
          {!data.team.paid && (
            <span title="Has not paid league dues" style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 4,
              background: '#fde2e2', color: '#dc2626', marginLeft: '0.5rem',
            }}>UNPAID</span>
          )}
          <button className="btn btn-sm btn-secondary" onClick={async () => {
            const newName = prompt('Enter new team name:', data.team.name);
            if (!newName || newName === data.team.name) return;
            try {
              await api.put('/teams/mine/name', { name: newName });
              load();
            } catch (err) { setMsg({ text: err.message, type: 'error' }); }
          }} style={{ marginLeft: '0.5rem', padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}>✎ Rename</button>
        </div>
        <button className="btn btn-sm btn-secondary" onClick={refreshScores} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Scores'}
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Budget Used</div>
          <div className="value">£{data.salary_used.toFixed(1)}m</div>
        </div>
        <div className="stat-card">
          <div className="label">Remaining</div>
          <div className="value" style={{ color: data.salary_remaining < 5 ? 'var(--red)' : 'var(--accent)' }}>
            £{data.salary_remaining.toFixed(1)}m
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Squad</div>
          <div className="value">{data.roster.length} / 15</div>
        </div>
      </div>

      <div className="salary-bar" style={{ marginBottom: '1rem' }}>
        <div className={`salary-bar-fill ${pct > 90 ? 'danger' : pct > 75 ? 'warn' : 'ok'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {/* Club counts */}
      {(() => {
        const clubCounts = {};
        data.roster.forEach(p => {
          const club = p.club_name || p.club || 'Unknown';
          clubCounts[club] = (clubCounts[club] || 0) + 1;
        });
        const overLimit = Object.entries(clubCounts).filter(([_, c]) => c > 3);
        const atLimit = Object.entries(clubCounts).filter(([_, c]) => c === 3);
        return (overLimit.length > 0 || atLimit.length > 0) ? (
          <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {overLimit.map(([club, count]) => (
              <span key={club} style={{
                padding: '0.25rem 0.6rem', borderRadius: 'var(--radius)', fontSize: '0.8rem',
                background: 'rgba(220,38,38,0.1)', border: '1px solid var(--red)', color: 'var(--red)', fontWeight: 600,
              }}>⚠️ {club}: {count}/3 — over limit!</span>
            ))}
            {atLimit.map(([club, count]) => (
              <span key={club} style={{
                padding: '0.25rem 0.6rem', borderRadius: 'var(--radius)', fontSize: '0.8rem',
                background: 'var(--bg-input)', color: 'var(--text-muted)',
              }}>{club}: {count}/3</span>
            ))}
          </div>
        ) : null;
      })()}

      <div className="tabs">
        <button className={`tab ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}>Roster</button>
        <button className={`tab ${tab === 'lineup' ? 'active' : ''}`} onClick={() => openTab('lineup')}>Set Lineup</button>
        <button className={`tab ${tab === 'scores' ? 'active' : ''}`} onClick={() => openTab('scores')}>GW Scores</button>
      </div>

      {/* ── Roster Tab ── */}
      {tab === 'roster' && ['GK', 'DEF', 'MID', 'FWD'].map(pos => (
        <div className="card" key={pos} style={{ marginBottom: '1rem' }}>
          <div className="card-header">
            <h3 style={{ margin: 0 }}>
              <span className={`pos pos-${pos}`}>{pos}</span>{' '}
              {pos === 'GK' ? 'Goalkeepers' : pos === 'DEF' ? 'Defenders' : pos === 'MID' ? 'Midfielders' : 'Forwards'} ({byPos[pos].length})
            </h3>
          </div>
          {byPos[pos].length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No {pos}s on roster</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Player</th><th>Club</th><th>Salary</th><th>Pts</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {byPos[pos].map(p => (
                    <tr key={p.player_id}>
                      <td><PlayerLink id={p.player_id || p.id} name={p.name || `Player #${p.player_id}`} /></td>
                      <td>{p.club_name || '—'}</td>
                      <td>£{p.salary.toFixed(1)}m</td>
                      <td>{p.total_points ?? '—'}</td>
                      <td>
                        <span className={`status-${p.status}`}>{p.status === 'a' ? 'Fit' : p.status === 'i' ? 'Injured' : p.status || '—'}</span>
                        {p.injury_news && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{p.injury_news}</span>}
                      </td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => dropPlayer(p.player_id, p.name)}>Drop</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* ── Set Lineup Tab ── */}
      {tab === 'lineup' && (() => {
        const selectedGWObj = gameweeks.find(g => g.id === selectedGW);
        const deadline = selectedGWObj?.deadline;
        const deadlinePassed = deadline && new Date(deadline) < new Date();
        const deadlineStr = deadline ? new Date(deadline).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }) : null;

        return (
        <div>
          {/* GW Selector */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {visibleGWs.map(g => (
              <button key={g.id}
                className={`btn btn-sm ${g.id === selectedGW ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedGW(g.id)}
              >
                GW{g.id}
              </button>
            ))}
          </div>

          {/* Deadline info */}
          {deadlineStr && (
            <div className={`alert ${deadlinePassed ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '0.75rem' }}>
              {deadlinePassed
                ? `🔒 GW${selectedGW} deadline has passed (${deadlineStr}). Lineup is locked.`
                : `⏰ GW${selectedGW} deadline: ${deadlineStr}`}
            </div>
          )}

          <div className="card" style={{ marginBottom: '1rem' }}>
            {carriedFrom && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(37,99,235,0.08)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: 'var(--blue)' }}>
                Lineup carried forward from GW{carriedFrom}. Save to lock it in for GW{selectedGW}.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Selected: </span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1.1rem',
                  color: starters.size === 11 ? 'var(--accent)' : 'var(--text)' }}>
                  {starters.size}/11
                </span>
                {starters.size === 11 && starterPosCounts.GK === 1 && (
                  <span style={{ marginLeft: '1rem', fontSize: '0.9rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                    Formation: {formation}
                  </span>
                )}
              </div>
              <button className="btn btn-primary" onClick={saveLineup}
                disabled={starters.size !== 11 || savingLineup}>
                {savingLineup ? 'Saving...' : `Save Lineup (GW${selectedGW})`}
              </button>
            </div>
          </div>

          {['GK', 'DEF', 'MID', 'FWD'].map(pos => (
            <div className="card" key={pos} style={{ marginBottom: '0.75rem' }}>
              <h3>
                <span className={`pos pos-${pos}`}>{pos}</span>{' '}
                {pos === 'GK' ? 'Goalkeepers' : pos === 'DEF' ? 'Defenders' : pos === 'MID' ? 'Midfielders' : 'Forwards'}
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                  ({starterPosCounts[pos]} starting)
                </span>
              </h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th></th><th>Player</th><th>Club</th><th>Salary</th><th>Form</th><th>Status</th></tr></thead>
                  <tbody>
                    {byPos[pos].map(p => {
                      const isSelected = starters.has(p.player_id);
                      return (
                        <tr key={p.player_id} className="clickable" onClick={() => toggleStarter(p.player_id)}
                          style={{ background: isSelected ? 'var(--accent-light)' : undefined }}>
                          <td style={{ width: 40 }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontSize: '0.7rem', fontWeight: 700,
                            }}>
                              {isSelected && '✓'}
                            </div>
                          </td>
                          <td><PlayerLink id={p.player_id || p.id} name={p.name} /></td>
                          <td><TeamLink name={p.club_name} /></td>
                          <td>£{p.salary.toFixed(1)}m</td>
                          <td>{p.form}</td>
                          <td>
                            <span className={`status-${p.status}`}>
                              {p.status === 'a' ? 'Fit' : p.status === 'i' ? 'Injured' : p.status === 'd' ? 'Doubtful' : p.status || '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* ── GW Scores Tab ── */}
      {tab === 'scores' && (
        <div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {visibleGWs.map(g => (
              <button key={g.id}
                className={`btn btn-sm ${g.id === selectedGW ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedGW(g.id)}
              >
                GW{g.id}
              </button>
            ))}
          </div>

          {gwScores ? (
            <>
              <div className="stat-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">GW{selectedGW} Points</div>
                  <div className="value">{gwScores.total}</div>
                </div>
              </div>

              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>Pos</th>
                        <th>Player</th>
                        <th>Club</th>
                        <th style={{ textAlign: 'center' }}>Mins</th>
                        <th style={{ textAlign: 'center' }}>Goals</th>
                        <th style={{ textAlign: 'center' }}>Assists</th>
                        <th style={{ textAlign: 'center' }}>CS</th>
                        <th style={{ textAlign: 'center' }} title="Defensive Contribution (tackles, blocks, interceptions, recoveries)">DC</th>
                        <th style={{ textAlign: 'center' }} title="Goals Conceded">GC</th>
                        <th style={{ textAlign: 'center' }} title="Saves">Saves</th>
                        <th style={{ textAlign: 'center' }}>Bonus</th>
                        <th style={{ textAlign: 'center' }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gwScores.players.map((p, i) => {
                        const isBench = !p.is_starter;
                        const firstBench = i > 0 && gwScores.players[i - 1]?.is_starter && isBench;
                        return (
                          <>
                            {firstBench && (
                              <tr key="bench-divider">
                                <td colSpan={13} style={{
                                  textAlign: 'center', fontSize: '0.75rem', fontWeight: 600,
                                  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px',
                                  padding: '0.4rem', background: 'var(--bg-input)',
                                }}>Bench</td>
                              </tr>
                            )}
                            <tr key={p.id} style={{ opacity: isBench ? 0.5 : 1 }}>
                              <td>{p.is_starter ? '⚽' : ''}</td>
                              <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                              <td><PlayerLink id={p.player_id || p.id} name={p.name} /></td>
                              <td><TeamLink name={p.club_name} /></td>
                              <td style={{ textAlign: 'center' }}>{p.gw_minutes}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_goals || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_assists || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_clean_sheets || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_defensive_contribution || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_goals_conceded || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_saves || '—'}</td>
                              <td style={{ textAlign: 'center' }}>{p.gw_bonus || '—'}</td>
                              <td style={{
                                textAlign: 'center', fontWeight: 700,
                                fontFamily: 'var(--font-display)', fontSize: '1rem',
                                color: p.is_starter ? 'var(--accent)' : 'var(--text-muted)',
                              }}>
                                {p.is_starter ? p.counting_points : `(${p.gw_points})`}
                              </td>
                            </tr>
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                No scores available for GW{selectedGW}. Set a lineup and refresh scores from the Dashboard.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Logo lightbox */}
      {showLogo && (
        <div onClick={() => setShowLogo(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <img src={`/api/teams/${data.team.id}/logo?t=${Date.now()}`} alt={data.team.name}
              style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: 12, objectFit: 'contain', background: '#fff', padding: '1rem' }} />
            <button onClick={() => setShowLogo(false)} style={{
              position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%',
              background: 'var(--red)', color: '#fff', border: 'none', fontSize: '1rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
