import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFotMob } from '../api/useFotMob';


export default function RostersPage() {
  const [data, setData] = useState([]);
  const [missingTeams, setMissingTeams] = useState([]);
  const { PlayerLink, TeamLink } = useFotMob();
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState(null);

  useEffect(() => {
    api.get('/teams/all-rosters').then(d => {
      setData(d.teams || []);
      setMissingTeams(d.missing_teams || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div><h1>Team Rosters</h1><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>;

  return (
    <div>
      <h1>Team Rosters</h1>

      {data.length === 0 ? (
        <div className="card"><p style={{ color: 'var(--text-muted)' }}>No teams yet.</p></div>
      ) : data.map(({ team, roster }) => {
        const isExpanded = expandedTeam === team.id;
        const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
        roster.forEach(p => { if (posCounts[p.position] !== undefined) posCounts[p.position]++; });
        const clubCounts = {};
        roster.forEach(p => {
          const club = p.club_name || p.club || '?';
          clubCounts[club] = (clubCounts[club] || 0) + 1;
        });
        const overLimit = Object.entries(clubCounts).filter(([_, c]) => c > 3);

        return (
          <div key={team.id} className="card" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setExpandedTeam(isExpanded ? null : team.id)}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <img src={`/api/teams/${team.id}/logo`} alt=""
                    style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: 'var(--bg-input)' }}
                    onError={e => e.target.style.display = 'none'} />
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{team.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.75rem' }}>{team.username}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['GK', 'DEF', 'MID', 'FWD'].map(pos => (
                    <span key={pos} style={{ fontSize: '0.75rem' }}>
                      <span className={`pos pos-${pos}`}>{pos}</span> {posCounts[pos]}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>£{parseFloat(team.total_salary).toFixed(1)}m</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{isExpanded ? '▼' : '▶'}</span>
              </div>
            </div>

            {overLimit.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {overLimit.map(([club, count]) => (
                  <span key={club} style={{
                    padding: '0.2rem 0.5rem', borderRadius: 'var(--radius)', fontSize: '0.75rem',
                    background: 'rgba(220,38,38,0.1)', color: 'var(--red)', fontWeight: 600,
                  }}>⚠️ {club}: {count}/3</span>
                ))}
              </div>
            )}

            {isExpanded && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Player</th>
                        <th>Club</th>
                        <th>Salary</th>
                        <th style={{ textAlign: 'center' }}>Pts</th>
                        <th>Form</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(p => (
                        <tr key={p.player_id}>
                          <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                          <td>
                            <PlayerLink id={p.player_id || p.id} name={p.name} />
                          </td>
                          <td>
                            <TeamLink name={p.club_name} style={{ fontSize: "0.85rem" }} />
                          </td>
                          <td>£{p.salary?.toFixed(1)}m</td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.total_points ?? '—'}</td>
                          <td>{p.form || '—'}</td>
                          <td>
                            <span className={`status-${p.status}`}>
                              {p.status === 'a' ? 'Fit' : p.status === 'i' ? 'Injured' : p.status === 'd' ? 'Doubtful' : p.status || '—'}
                            </span>
                            {p.injury_news && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{p.injury_news}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {missingTeams.length > 0 && (
        <div className="card" style={{ marginTop: '1rem', borderLeft: '3px solid var(--yellow)' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>⚠️ Managers Without Teams</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            These managers are registered but haven't created a team yet.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {missingTeams.map(m => (
              <span key={m.id} style={{
                padding: '0.35rem 0.75rem', borderRadius: 'var(--radius)',
                background: 'var(--bg-input)', fontSize: '0.85rem', fontWeight: 500,
              }}>
                {m.username}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
