import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFotMob } from '../api/useFotMob';

export default function ScoringPage() {
  const [tab, setTab] = useState('week'); // week | season
  const [gameweeks, setGameweeks] = useState([]);
  const [selectedGW, setSelectedGW] = useState(null);
  const [weekData, setWeekData] = useState(null);
  const [seasonData, setSeasonData] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { PlayerLink, TeamLink } = useFotMob();
  const [msg, setMsg] = useState({ text: '', type: '' });

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

  useEffect(() => {
    api.get('/schedule').then(d => {
      const gws = d.gameweeks || [];
      setGameweeks(gws);
      const current = resolveCurrentGW(gws);
      if (current) setSelectedGW(current);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGW || tab !== 'week') return;
    api.get(`/scoring/week/${selectedGW}`).then(setWeekData).catch(() => setWeekData(null));
  }, [selectedGW, tab]);

  useEffect(() => {
    if (tab !== 'season') return;
    api.get('/scoring/season').then(setSeasonData).catch(() => setSeasonData(null));
  }, [tab]);

  const currentGWId = resolveCurrentGW(gameweeks);
  const currentIdx = currentGWId ? gameweeks.findIndex(g => g.id === currentGWId) : 0;
  const startIdx = Math.max(0, currentIdx - 3);
  const visibleGWs = gameweeks.slice(startIdx, startIdx + 10);

  // Season view: figure out GW columns
  const seasonGWs = [];
  if (seasonData?.season?.length > 0) {
    const allGWs = new Set();
    seasonData.season.forEach(s => Object.keys(s.weekly_scores).forEach(g => allGWs.add(parseInt(g))));
    [...allGWs].sort((a, b) => a - b).forEach(g => seasonGWs.push(g));
  }

  const refreshScores = async () => {
    setRefreshing(true);
    try {
      const res = await api.post('/scores/refresh');
      setMsg({ text: res.message, type: 'success' });
      if (tab === 'week' && selectedGW) api.get(`/scoring/week/${selectedGW}`).then(setWeekData);
      if (tab === 'season') api.get('/scoring/season').then(setSeasonData);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
    setRefreshing(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Scoring</h1>
        <button className="btn btn-sm btn-secondary" onClick={refreshScores} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Scores'}
        </button>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'week' ? 'active' : ''}`} onClick={() => setTab('week')}>Week View</button>
        <button className={`tab ${tab === 'season' ? 'active' : ''}`} onClick={() => setTab('season')}>Season View</button>
      </div>

      {/* ── Week View ── */}
      {tab === 'week' && (
        <div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {visibleGWs.map(g => (
              <button key={g.id}
                className={`btn btn-sm ${g.id === selectedGW ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setSelectedGW(g.id); setExpandedTeam(null); }}>
                GW{g.id}
              </button>
            ))}
          </div>

          {weekData ? (
            <div>
              {weekData.teams.map((t, i) => (
                <div key={t.team_id} className="card" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}
                  onClick={() => setExpandedTeam(expandedTeam === t.team_id ? null : t.team_id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem',
                        background: i === 0 ? 'var(--accent)' : 'var(--bg-input)',
                        color: i === 0 ? '#fff' : 'var(--text-muted)',
                      }}>{i + 1}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <img src={`/api/teams/${t.team_id}/logo`} alt=""
                            style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain', background: 'var(--bg-input)' }}
                            onError={e => e.target.style.display = 'none'} />
                          <span style={{ fontWeight: 600 }}>{t.team_name}</span>
                          {!t.paid && (
                            <span title="Has not paid league dues" style={{
                              fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4,
                              background: 'var(--danger-bg, #fde2e2)', color: 'var(--danger, #dc2626)',
                            }}>UNPAID</span>
                          )}
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{t.manager}</span>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                      {t.weekly_points} pts
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', display: 'block' }}>£{t.total_salary?.toFixed(1)}m salary</span>
                    </div>
                  </div>

                  {expandedTeam === t.team_id && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}
                      onClick={e => e.stopPropagation()}>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th></th><th>Pos</th><th>Player</th><th>Status</th>
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
                            {t.players.map((p, pi) => {
                              const isBench = !p.is_starter;
                              const firstBench = pi > 0 && t.players[pi - 1]?.is_starter && isBench;
                              return (
                                <>{firstBench && (
                                  <tr key="bench"><td colSpan={13} style={{
                                    textAlign: 'center', fontSize: '0.7rem', fontWeight: 600,
                                    color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-input)',
                                  }}>Bench</td></tr>
                                )}
                                <tr key={p.id} style={{ opacity: isBench ? 0.5 : 1 }}>
                                  <td>{p.is_starter ? '⚽' : ''}</td>
                                  <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                                  <td>
                                    <PlayerLink id={p.player_id || p.id} name={p.name} />
                                    {p.club_name && (
                                      <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {p.club_name}
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {p.play_status === 'played' && (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--green)' }}>Played</span>
                                    )}
                                    {p.play_status === 'live' && (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--green)' }}>Live</span>
                                    )}
                                    {p.play_status === 'did_not_play' && (
                                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>Did Not Play</span>
                                    )}
                                    {p.play_status === 'not_started' && (
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Not Started</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{p.minutes}</td>
                                  <td style={{ textAlign: 'center' }}>{p.goals || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.assists || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.clean_sheets || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.defensive_contribution || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.goals_conceded || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.saves || '—'}</td>
                                  <td style={{ textAlign: 'center' }}>{p.bonus || '—'}</td>
                                  <td style={{ textAlign: 'center', fontWeight: 700, color: p.is_starter ? 'var(--accent)' : 'var(--text-muted)' }}>
                                    {p.is_starter ? p.counting_points : `(${p.gw_points})`}
                                  </td>
                                </tr></>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {weekData.teams.length === 0 && (
                <div className="card"><p style={{ color: 'var(--text-muted)' }}>No scores for this gameweek yet.</p></div>
              )}
            </div>
          ) : (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button className="btn btn-secondary" disabled={!selectedGW || selectedGW <= 1}
              onClick={() => { setSelectedGW(s => s - 1); setExpandedTeam(null); }}>← Previous</button>
            <button className="btn btn-secondary" disabled={!selectedGW || selectedGW >= gameweeks.length}
              onClick={() => { setSelectedGW(s => s + 1); setExpandedTeam(null); }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Season View ── */}
      {tab === 'season' && seasonData && (
        <div>
          {/* Payout Summary */}
          {seasonData.payout.total_pot > 0 && (
            <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="label">Total Pot</div>
                <div className="value">${seasonData.payout.total_pot}</div>
              </div>
              <div className="stat-card">
                <div className="label">Weekly Prizes</div>
                <div className="value">${seasonData.payout.weekly_prize}/wk</div>
              </div>
              <div className="stat-card">
                <div className="label">1st Place</div>
                <div className="value">${seasonData.payout.first.toFixed(0)}</div>
              </div>
              <div className="stat-card">
                <div className="label">2nd Place</div>
                <div className="value">${seasonData.payout.second.toFixed(0)}</div>
              </div>
            </div>
          )}

          {/* Season Table */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2>Season Standings</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Team</th><th>Manager</th><th>Salary</th>
                    {seasonGWs.map(gw => <th key={gw} style={{ textAlign: 'center', fontSize: '0.7rem' }}>GW{gw}</th>)}
                    <th style={{ textAlign: 'center' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonData.season.map((s, i) => (
                    <tr key={s.team_id}>
                      <td style={{ fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{s.team_name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{s.manager}</td>
                      <td style={{ fontSize: '0.8rem' }}>£{s.total_salary?.toFixed(1)}m</td>
                      {seasonGWs.map(gw => {
                        const pts = s.weekly_scores[gw];
                        const isHigh = seasonData.weekly_highs[gw]?.team_name === s.team_name;
                        return (
                          <td key={gw} style={{
                            textAlign: 'center',
                            fontWeight: isHigh ? 700 : 400,
                            color: isHigh ? 'var(--accent)' : undefined,
                            background: isHigh ? 'var(--accent-light)' : undefined,
                          }}>
                            {pts !== undefined ? pts : '—'}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                        {s.total_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weekly Wins Leaderboard */}
          {Object.keys(seasonData.weekly_highs).length > 0 && (() => {
            const winCounts = {};
            Object.values(seasonData.weekly_highs).forEach(d => {
              if (!winCounts[d.team_name]) winCounts[d.team_name] = { manager: d.manager, wins: 0, totalPts: 0 };
              winCounts[d.team_name].wins++;
              winCounts[d.team_name].totalPts += d.points;
            });
            const leaderboard = Object.entries(winCounts)
              .map(([team, data]) => ({ team, ...data, earnings: data.wins * seasonData.payout.weekly_prize }))
              .sort((a, b) => b.wins - a.wins || b.totalPts - a.totalPts);

            return (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h2>Weekly Wins Summary</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  ${seasonData.payout.weekly_prize} per weekly high score · {Object.keys(seasonData.weekly_highs).length} weeks scored
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Team</th><th>Manager</th>
                        <th style={{ textAlign: 'center' }}>Wins</th>
                        <th style={{ textAlign: 'center' }}>Avg Pts</th>
                        <th style={{ textAlign: 'center' }}>Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((l, i) => (
                        <tr key={l.team}>
                          <td style={{ fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{l.team}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{l.manager}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{l.wins}</td>
                          <td style={{ textAlign: 'center' }}>{(l.totalPts / l.wins).toFixed(0)}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>${l.earnings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Weekly High Scores Detail */}
          {Object.keys(seasonData.weekly_highs).length > 0 && (
            <div className="card">
              <h2>Weekly High Scores</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                ${seasonData.payout.weekly_prize} prize each week
              </p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Week</th><th>Winner</th><th style={{ textAlign: 'center' }}>Points</th></tr></thead>
                  <tbody>
                    {Object.entries(seasonData.weekly_highs)
                      .sort(([a], [b]) => parseInt(a) - parseInt(b))
                      .map(([gw, data]) => (
                        <tr key={gw}>
                          <td>GW{gw}</td>
                          <td style={{ fontWeight: 500 }}>{data.team_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>({data.manager})</span></td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{data.points}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
