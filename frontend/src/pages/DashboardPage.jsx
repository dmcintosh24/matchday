import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [teams, setTeams] = useState([]);
  const [config, setConfig] = useState({});
  const [myTeam, setMyTeam] = useState(null);
  const [standings, setStandings] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [seasonData, setSeasonData] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [refreshMsg, setRefreshMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    api.get('/teams').then(d => setTeams(d.teams)).catch(() => {});
    api.get('/config').then(setConfig).catch(() => {});
    api.get('/teams/mine').then(setMyTeam).catch(() => {});
    api.get('/standings').then(setStandings).catch(() => {});
    api.get('/announcements').then(d => setAnnouncements(d.announcements || [])).catch(() => {});
    api.get('/notifications').then(d => setNotifications(d.notifications || [])).catch(() => {});
    api.get('/scoring/season').then(setSeasonData).catch(() => {});
  }, []);

  const createTeam = async (e) => {
    e.preventDefault();
    try { await api.post('/teams', { name: teamName }); window.location.reload(); }
    catch (err) { setError(err.message); }
  };

  const refreshScores = async () => {
    setRefreshing(true); setRefreshMsg('');
    try {
      const res = await api.post('/scores/refresh');
      setRefreshMsg(res.message);
      api.get('/standings').then(setStandings);
    } catch (err) { setRefreshMsg(err.message); }
    setRefreshing(false);
  };

  const saveAnnouncement = async () => {
    try {
      if (editingId) await api.put(`/announcements/${editingId}`, { title: annTitle, body: annBody });
      else await api.post('/announcements', { title: annTitle, body: annBody });
      setAnnTitle(''); setAnnBody(''); setShowEditor(false); setEditingId(null);
      api.get('/announcements').then(d => setAnnouncements(d.announcements || []));
    } catch (err) { setError(err.message); }
  };

  const deleteAnnouncement = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    const token = localStorage.getItem('token');
    await fetch(`/api/announcements/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    api.get('/announcements').then(d => setAnnouncements(d.announcements || []));
  };

  const editAnnouncement = (ann) => {
    setAnnTitle(ann.title); setAnnBody(ann.body); setEditingId(ann.id); setShowEditor(true);
  };

  const cap = parseFloat(config.salary_cap?.value || 100);
  const currentGW = standings?.current_gameweek || 0;
  const payout = seasonData?.payout;

  const gwColumns = [];
  if (standings?.standings?.length > 0) {
    const allGWs = new Set();
    standings.standings.forEach(s => Object.keys(s.weekly_scores).forEach(g => allGWs.add(parseInt(g))));
    [...allGWs].sort((a, b) => a - b).slice(-5).forEach(g => gwColumns.push(g));
  }

  const notifColors = {
    trade_pending: 'var(--yellow)', trade_review: 'var(--blue)',
    player_i: 'var(--red)', player_d: 'var(--yellow)', player_s: 'var(--red)', player_u: 'var(--red)',
  };

  return (
    <div>
      <h1>Dashboard</h1>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {notifications.map((n, i) => (
            <div key={i} className="card" style={{
              padding: '0.6rem 1rem', cursor: n.link ? 'pointer' : 'default',
              borderLeft: `4px solid ${notifColors[n.type] || 'var(--border)'}`,
            }} onClick={() => n.link && nav(n.link)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{n.icon}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{n.title}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>{n.message}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Announcements */}
      {(announcements.length > 0 || user?.is_admin) && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2 style={{ margin: 0 }}>Announcements</h2>
            {user?.is_admin && (
              <button className="btn btn-sm btn-primary" onClick={() => { setShowEditor(!showEditor); setEditingId(null); setAnnTitle(''); setAnnBody(''); }}>
                {showEditor ? 'Cancel' : 'New Announcement'}
              </button>
            )}
          </div>
          {showEditor && (
            <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)' }}>
              <div className="form-group">
                <label>Title</label>
                <input value={annTitle} onChange={e => setAnnTitle(e.target.value)} placeholder="Announcement title" />
              </div>
              <div className="form-group">
                <label>Body</label>
                <textarea value={annBody} onChange={e => setAnnBody(e.target.value)} placeholder="Write your announcement..."
                  style={{ width: '100%', minHeight: '80px', padding: '0.6rem 0.8rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', resize: 'vertical' }} />
              </div>
              <button className="btn btn-primary" onClick={saveAnnouncement} disabled={!annTitle || !annBody}>
                {editingId ? 'Update' : 'Post'}
              </button>
            </div>
          )}
          {announcements.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No announcements yet.</p>
          ) : announcements.map(ann => (
            <div key={ann.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{ann.title}</h3>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {ann.author_name} · {new Date(ann.created_at).toLocaleDateString()}
                  </p>
                </div>
                {user?.is_admin && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => editAnnouncement(ann)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteAnnouncement(ann.id)}>✕</button>
                  </div>
                )}
              </div>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{ann.body}</p>
            </div>
          ))}
        </div>
      )}

      {!myTeam && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3>Create Your Team</h3>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={createTeam} style={{ display: 'flex', gap: '0.5rem' }}>
            <input placeholder="Team name" value={teamName} onChange={e => setTeamName(e.target.value)} required style={{ maxWidth: 300 }} />
            <button className="btn btn-primary">Create</button>
          </form>
        </div>
      )}

      {myTeam && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="label">Salary Used</div>
              <div className="value">£{myTeam.salary_used?.toFixed(1)}m</div>
            </div>
            <div className="stat-card">
              <div className="label">Remaining</div>
              <div className="value">£{myTeam.salary_remaining?.toFixed(1)}m</div>
            </div>
            <div className="stat-card">
              <div className="label">Players</div>
              <div className="value">{myTeam.roster?.length || 0} / {config.squad_size?.value || 15}</div>
            </div>
            <div className="stat-card">
              <div className="label">Gameweek</div>
              <div className="value">{currentGW || '—'}</div>
            </div>
          </div>
          <div className="salary-bar" style={{ marginBottom: '1.5rem' }}>
            <div className={`salary-bar-fill ${myTeam.salary_used / cap > 0.9 ? 'danger' : myTeam.salary_used / cap > 0.75 ? 'warn' : 'ok'}`}
              style={{ width: `${Math.min((myTeam.salary_used / cap) * 100, 100)}%` }} />
          </div>
        </>
      )}

      {/* Payout Overview */}
      {payout && payout.total_pot > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h2 style={{ margin: 0 }}>Prize Pool</h2></div>
          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="label">Total Pot</div>
              <div className="value">${payout.total_pot}</div>
            </div>
            <div className="stat-card">
              <div className="label">Weekly Prize</div>
              <div className="value">${payout.weekly_prize}/wk</div>
            </div>
            <div className="stat-card">
              <div className="label">1st Place</div>
              <div className="value">${payout.first.toFixed(0)}</div>
            </div>
            <div className="stat-card">
              <div className="label">2nd / 3rd</div>
              <div className="value">${payout.second.toFixed(0)} / ${payout.third.toFixed(0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* League Standings */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h2 style={{ margin: 0 }}>League Standings</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {refreshMsg && <span style={{ fontSize: '0.8rem', color: 'var(--green)' }}>{refreshMsg}</span>}
            <button className="btn btn-sm btn-secondary" onClick={refreshScores} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh Scores'}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Team</th><th>Manager</th>
                {gwColumns.map(gw => <th key={gw} style={{ textAlign: 'center' }}>GW{gw}</th>)}
                <th style={{ textAlign: 'center' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {standings?.standings?.length > 0 ? standings.standings.map((s, i) => (
                <tr key={s.team_id}>
                  <td style={{ fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{i + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <img src={`/api/teams/${s.team_id}/logo`} alt=""
                        style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain', background: 'var(--bg-input)' }}
                        onError={e => e.target.style.display = 'none'} />
                      <span style={{ fontWeight: 600 }}>{s.team_name}</span>
                      {!s.paid && (
                        <span title="Has not paid league dues" style={{
                          fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4,
                          background: '#fde2e2', color: '#dc2626',
                        }}>UNPAID</span>
                      )}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.manager}</td>
                  {gwColumns.map(gw => (
                    <td key={gw} style={{ textAlign: 'center' }}>{s.weekly_scores[gw] !== undefined ? s.weekly_scores[gw] : '—'}</td>
                  ))}
                  <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-display)', fontSize: '1rem' }}>{s.total_points}</td>
                </tr>
              )) : (
                <tr><td colSpan={3 + gwColumns.length + 1} style={{ color: 'var(--text-muted)' }}>No scores yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teams Overview */}
      <div className="card">
        <div className="card-header"><h2 style={{ margin: 0 }}>Teams</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Team</th><th>Manager</th><th>Players</th><th>Salary</th></tr></thead>
            <tbody>
              {teams.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td><td>{t.username}</td>
                  <td>{t.player_count}</td><td>£{parseFloat(t.total_salary).toFixed(1)}m</td>
                </tr>
              ))}
              {teams.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--text-muted)' }}>No teams yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
