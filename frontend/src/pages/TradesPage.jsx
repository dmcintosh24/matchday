import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function TradesPage() {
  const [trades, setTrades] = useState([]);
  const [myTeamId, setMyTeamId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [myRoster, setMyRoster] = useState([]);
  const [targetRoster, setTargetRoster] = useState([]);
  const [targetTeamId, setTargetTeamId] = useState('');
  const [offering, setOffering] = useState([]);
  const [requesting, setRequesting] = useState([]);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [tab, setTab] = useState('propose'); // propose | active | history

  const load = () => {
    api.get('/trades').then(d => { setTrades(d.trades); setMyTeamId(d.my_team_id); }).catch(() => {});
    api.get('/teams').then(d => setTeams(d.teams)).catch(() => {});
    api.get('/teams/mine').then(d => setMyRoster(d.roster || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  // Load target roster when team selected
  useEffect(() => {
    if (!targetTeamId) { setTargetRoster([]); return; }
    api.get(`/teams/${targetTeamId}/roster`).then(d => setTargetRoster(d.roster || [])).catch(() => setTargetRoster([]));
    setRequesting([]);
  }, [targetTeamId]);

  const proposeTrade = async (e) => {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    try {
      await api.post('/trades', {
        to_team_id: parseInt(targetTeamId),
        offering_player_ids: offering,
        requesting_player_ids: requesting,
      });
      setMsg({ text: 'Trade proposed!', type: 'success' });
      setOffering([]); setRequesting([]); setTargetTeamId('');
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const acceptTrade = async (id) => {
    try {
      const res = await api.post(`/trades/${id}/accept`);
      setMsg({ text: res.message, type: 'success' });
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const rejectTrade = async (id) => {
    try {
      await api.post(`/trades/${id}/reject`);
      setMsg({ text: 'Trade rejected.', type: 'success' });
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const protestTrade = async (id) => {
    try {
      const res = await api.post(`/trades/${id}/protest`);
      setMsg({ text: res.message, type: res.vetoed ? 'error' : 'success' });
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const toggleOffer = (pid) => setOffering(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]);
  const toggleRequest = (pid) => setRequesting(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid]);

  const statusColor = (s) => ({
    pending: 'var(--yellow)', in_review: 'var(--blue)', completed: 'var(--green)',
    rejected: 'var(--red)', vetoed: 'var(--red)', failed: 'var(--red)',
  }[s] || 'var(--text-muted)');

  const statusLabel = (s) => ({
    pending: 'Pending Acceptance', in_review: 'In League Review', completed: 'Completed',
    rejected: 'Rejected', vetoed: 'Vetoed by League', failed: 'Failed — Rule Violation',
  }[s] || s);

  const activeTrades = trades.filter(t => t.status === 'pending' || t.status === 'in_review');
  const historyTrades = trades.filter(t => !['pending', 'in_review'].includes(t.status));

  const renderTradeCard = (t) => {
    const fromPlayers = t.players.filter(p => p.from_team_id === t.from_team_id);
    const toPlayers = t.players.filter(p => p.from_team_id === t.to_team_id);
    const canAccept = t.status === 'pending' && t.to_team_id === myTeamId;
    const canReject = (t.status === 'pending' || t.status === 'in_review') &&
      (t.from_team_id === myTeamId || t.to_team_id === myTeamId);
    const canProtest = t.status === 'in_review' && myTeamId &&
      t.from_team_id !== myTeamId && t.to_team_id !== myTeamId &&
      !t.protest_team_ids.includes(myTeamId);
    const hasProtested = t.protest_team_ids?.includes(myTeamId);

    const renderPlayerRow = (p) => (
      <div key={p.player_id} style={{
        fontSize: '0.85rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
      }}>
        <div>
          <span className={`pos pos-${p.position}`}>{p.position}</span>{' '}
          <span style={{ fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.4rem' }}>{p.club_name}</span>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontWeight: 600 }}>£{p.salary?.toFixed(1)}m</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>{p.total_points} pts</span>
          {p.status !== 'a' && p.injury_news && (
            <span style={{ fontSize: '0.7rem', color: 'var(--red)', display: 'block' }}>{p.injury_news}</span>
          )}
        </div>
      </div>
    );

    const renderTeamSalary = (side) => {
      const used = t[`${side}_salary_used`];
      const remaining = t[`${side}_salary_remaining`];
      const cap = t[`${side}_salary_cap`];
      const count = t[`${side}_player_count`];
      if (used === undefined) return null;
      const pct = (used / cap) * 100;
      return (
        <div style={{ marginTop: '0.5rem', padding: '0.4rem 0.6rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Salary: <strong style={{ color: 'var(--text)' }}>£{used?.toFixed(1)}m</strong> / £{cap}m</span>
            <span style={{ color: remaining < 5 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>£{remaining?.toFixed(1)}m left</span>
          </div>
          <div className="salary-bar" style={{ height: 4 }}>
            <div className={`salary-bar-fill ${pct > 90 ? 'danger' : pct > 75 ? 'warn' : 'ok'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>{count} players</div>
        </div>
      );
    };

    return (
      <div key={t.id} className="card" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem' }}>
            <strong>{t.from_team_name}</strong>
            <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>⇄</span>
            <strong>{t.to_team_name}</strong>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor(t.status), textTransform: 'uppercase' }}>
            {statusLabel(t.status)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem', fontWeight: 600 }}>
              {t.from_team_name} sends
            </p>
            {fromPlayers.map(renderPlayerRow)}
            {renderTeamSalary('from_team')}
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem', fontWeight: 600 }}>
              {t.to_team_name} sends
            </p>
            {toPlayers.map(renderPlayerRow)}
            {renderTeamSalary('to_team')}
          </div>
        </div>

        {t.status === 'in_review' && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)' }}>
            Protests: {t.protest_count} / {t.protests_needed} needed to veto
            {t.review_expires_at && (
              <span> · Review ends {new Date(t.review_expires_at).toLocaleString()}</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {canAccept && <button className="btn btn-sm btn-primary" onClick={() => acceptTrade(t.id)}>Accept</button>}
          {canReject && <button className="btn btn-sm btn-danger" onClick={() => rejectTrade(t.id)}>
            {t.status === 'pending' ? 'Reject' : 'Cancel'}
          </button>}
          {canProtest && <button className="btn btn-sm btn-secondary" onClick={() => protestTrade(t.id)}>Protest Trade</button>}
          {hasProtested && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>You protested</span>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1>Trades</h1>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'propose' ? 'active' : ''}`} onClick={() => setTab('propose')}>Propose</button>
        <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Active {activeTrades.length > 0 && `(${activeTrades.length})`}
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'propose' && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3>Propose a Trade</h3>
            <div className="form-group">
              <label>Trade With</label>
              <select value={targetTeamId} onChange={e => setTargetTeamId(e.target.value)}>
                <option value="">Select team...</option>
                {teams.filter(t => t.id !== myTeamId).map(t =>
                  <option key={t.id} value={t.id}>{t.name} ({t.username})</option>
                )}
              </select>
            </div>
          </div>

          {targetTeamId && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Your players */}
              <div className="card">
                <h3>Your Players — Select to Offer</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th></th><th>Player</th><th>Club</th><th>Pos</th><th>Salary</th></tr></thead>
                    <tbody>
                      {myRoster.map(p => {
                        const sel = offering.includes(p.player_id);
                        return (
                          <tr key={p.player_id} className="clickable" onClick={() => toggleOffer(p.player_id)}
                            style={{ background: sel ? 'var(--accent-light)' : undefined }}>
                            <td style={{ width: 30 }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                                background: sel ? 'var(--accent)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                              }}>{sel && '✓'}</div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.club_name || ''}</td>
                            <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                            <td>£{p.salary.toFixed(1)}m</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Their players */}
              <div className="card">
                <h3>Their Players — Select to Request</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th></th><th>Player</th><th>Club</th><th>Pos</th><th>Salary</th></tr></thead>
                    <tbody>
                      {targetRoster.map(p => {
                        const sel = requesting.includes(p.player_id);
                        return (
                          <tr key={p.player_id} className="clickable" onClick={() => toggleRequest(p.player_id)}
                            style={{ background: sel ? 'var(--accent-light)' : undefined }}>
                            <td style={{ width: 30 }}>
                              <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                                background: sel ? 'var(--accent)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                              }}>{sel && '✓'}</div>
                            </td>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.club_name || ''}</td>
                            <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                            <td>£{p.salary.toFixed(1)}m</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {targetTeamId && (offering.length > 0 || requesting.length > 0) && (
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button className="btn btn-primary" onClick={proposeTrade}
                disabled={offering.length === 0 || requesting.length === 0}>
                Propose Trade ({offering.length} ⇄ {requesting.length})
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'active' && (
        <div>
          {activeTrades.length === 0 ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>No active trades</p></div>
          ) : activeTrades.map(renderTradeCard)}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {historyTrades.length === 0 ? (
            <div className="card"><p style={{ color: 'var(--text-muted)' }}>No trade history</p></div>
          ) : historyTrades.map(renderTradeCard)}
        </div>
      )}
    </div>
  );
}
