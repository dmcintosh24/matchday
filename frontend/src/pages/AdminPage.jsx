import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('config');
  const [config, setConfig] = useState({});
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [edits, setEdits] = useState({});

  useEffect(() => {
    if (!user?.is_admin) return;
    api.get('/config').then(setConfig).catch(() => {});
    api.get('/admin/users').then(d => setUsers(d.users)).catch(() => {});
  }, []);

  if (!user?.is_admin) return <div><h1>Admin</h1><p style={{ color: 'var(--text-muted)' }}>Admin access required.</p></div>;

  const saveConfig = async () => {
    setMsg({ text: '', type: '' });
    const updates = Object.entries(edits).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;
    try {
      await api.put('/config', updates);
      setMsg({ text: 'Configuration saved!', type: 'success' });
      setEdits({});
      api.get('/config').then(setConfig);
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const editVal = (key, value) => setEdits(prev => ({ ...prev, [key]: value }));

  const toggleAdmin = async (uid) => {
    try {
      await api.put(`/admin/users/${uid}/toggle-admin`);
      api.get('/admin/users').then(d => setUsers(d.users));
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const toggleActive = async (uid) => {
    try {
      await api.put(`/admin/users/${uid}/toggle-active`);
      api.get('/admin/users').then(d => setUsers(d.users));
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const togglePaid = async (uid) => {
    try {
      await api.put(`/admin/users/${uid}/toggle-paid`);
      api.get('/admin/users').then(d => setUsers(d.users));
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const resetDraft = async () => {
    if (!confirm('This will delete ALL draft picks and drafted rosters. Continue?')) return;
    try {
      await api.post('/admin/draft/reset');
      setMsg({ text: 'Draft reset!', type: 'success' });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const configGroups = {
    'League Branding': ['league_name', 'league_subtitle'],
    'Salary & Roster': ['salary_cap', 'squad_size', 'max_gk', 'max_def', 'max_mid', 'max_fwd', 'max_per_club', 'min_starting_def', 'min_starting_mid', 'min_starting_fwd'],
    'Scoring – Goals': ['pts_goal_gk', 'pts_goal_def', 'pts_goal_mid', 'pts_goal_fwd'],
    'Scoring – Other': ['pts_assist', 'pts_clean_sheet_gk', 'pts_clean_sheet_def', 'pts_clean_sheet_mid', 'pts_save_per_3', 'pts_penalty_save', 'pts_defensive_contrib', 'def_contrib_threshold_def', 'def_contrib_threshold_mid_fwd'],
    'Scoring – Bonus': ['pts_bonus_1st', 'pts_bonus_2nd', 'pts_bonus_3rd'],
    'League Settings': ['season_name', 'draft_type', 'trade_review_period_hours', 'trade_protest_threshold'],
    'Free Agency': ['free_agency_enabled', 'free_agency_day_start', 'free_agency_day_end', 'free_agency_hour_start', 'free_agency_hour_end'],
    'Lineup Lock': ['lineup_lock_enabled'],
    'Payouts': ['payout_entry_fee', 'payout_weekly_prize', 'payout_1st_pct', 'payout_2nd_pct', 'payout_3rd_pct', 'payout_venmo', 'payout_paypal'],
  };

  return (
    <div>
      <h1>Admin Panel</h1>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>Rules & Config</button>
        <button className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>Users</button>
        <button className={`tab ${tab === 'draft' ? 'active' : ''}`} onClick={() => setTab('draft')}>Draft Control</button>
        <button className={`tab ${tab === 'seasons' ? 'active' : ''}`} onClick={() => setTab('seasons')}>Seasons</button>
      </div>

      {tab === 'config' && (
        <div>
          {/* Logo Upload */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>League Logo</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src="/api/config/logo" alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'contain', background: 'var(--bg-input)' }}
                onError={e => e.target.style.display = 'none'} />
              <div>
                <input type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  const token = localStorage.getItem('token');
                  try {
                    const res = await fetch('/api/admin/upload-logo', {
                      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
                    });
                    const data = await res.json();
                    setMsg({ text: data.message || 'Logo uploaded!', type: 'success' });
                  } catch (err) { setMsg({ text: 'Upload failed', type: 'error' }); }
                }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>PNG or JPG, max 5MB</p>
              </div>
            </div>
          </div>

          {Object.entries(configGroups).map(([group, keys]) => (
            <div className="card" key={group} style={{ marginBottom: '1rem' }}>
              <h3>{group}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                {keys.map(key => {
                  const cfg = config[key];
                  if (!cfg) return null;
                  return (
                    <div className="form-group" key={key} style={{ marginBottom: 0 }}>
                      <label>{cfg.description}</label>
                      <input
                        value={edits[key] ?? cfg.value}
                        onChange={e => editVal(key, e.target.value)}
                        style={{ background: edits[key] !== undefined ? 'rgba(0,255,135,0.1)' : undefined }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <button className="btn btn-primary" onClick={saveConfig} disabled={Object.keys(edits).length === 0}>
            Save Changes ({Object.keys(edits).length})
          </button>
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Username</th><th>Email</th><th>Admin</th><th>Active</th><th>Paid</th><th>Venmo</th><th>PayPal</th><th>Joined</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{u.is_admin ? '✓' : '—'}</td>
                    <td>{u.is_active ? '✓' : '✗'}</td>
                    <td style={{ color: u.has_paid ? 'var(--green)' : 'var(--red)' }}>{u.has_paid ? '✓ Paid' : '✗ Unpaid'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{u.venmo || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{u.paypal || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.created_at?.slice(0, 10)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => toggleAdmin(u.id)}>
                          {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(u.id)}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className={`btn btn-sm ${u.has_paid ? 'btn-danger' : 'btn-primary'}`} onClick={() => togglePaid(u.id)}>
                          {u.has_paid ? 'Mark Unpaid' : 'Mark Paid'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'draft' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>Draft Controls</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Start a new draft or reset an existing one. The draft order is randomized when started.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={async () => {
                try { await api.post('/draft/start'); setMsg({ text: 'Draft started!', type: 'success' }); }
                catch (err) { setMsg({ text: err.message, type: 'error' }); }
              }}>Start New Draft</button>
              <button className="btn btn-danger" onClick={resetDraft}>Reset Draft</button>
            </div>
          </div>
          <div className="card">
            <h3>Score Refresh</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Refresh scores for all completed gameweeks. This recalculates every team's weekly totals.
            </p>
            <button className="btn btn-primary" onClick={async () => {
              try {
                setMsg({ text: 'Refreshing all gameweeks...', type: 'success' });
                const res = await api.post('/admin/refresh-all-scores');
                setMsg({ text: res.message, type: 'success' });
              } catch (err) { setMsg({ text: err.message, type: 'error' }); }
            }}>Refresh All Gameweeks</button>
          </div>
        </div>
      )}

      {tab === 'seasons' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>Season Management</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              End the current season to archive all data and snapshot player records. Then start a new season for a fresh draft.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-danger" onClick={async () => {
                if (!confirm('End the current season? This will archive all data and snapshot player records. This cannot be undone.')) return;
                try {
                  const res = await api.post('/admin/seasons/end');
                  setMsg({ text: res.message, type: 'success' });
                } catch (err) { setMsg({ text: err.message, type: 'error' }); }
              }}>End Current Season</button>
              <button className="btn btn-primary" onClick={async () => {
                const name = prompt('Enter new season name (e.g. 2026/27):');
                if (!name) return;
                try {
                  const res = await api.post(`/admin/seasons/start?name=${encodeURIComponent(name)}`);
                  setMsg({ text: res.message, type: 'success' });
                } catch (err) { setMsg({ text: err.message, type: 'error' }); }
              }}>Start New Season</button>
            </div>
          </div>
          <div className="card">
            <h3>Season History</h3>
            <SeasonList />
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonList() {
  const [seasons, setSeasons] = useState([]);
  useEffect(() => { api.get('/seasons').then(d => setSeasons(d.seasons || [])).catch(() => {}); }, []);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Season</th><th>Status</th><th>Created</th><th>Ended</th></tr></thead>
        <tbody>
          {seasons.map(s => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td style={{ color: s.status === 'active' ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                {s.status}
              </td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.created_at?.slice(0, 10)}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.ended_at?.slice(0, 10) || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
