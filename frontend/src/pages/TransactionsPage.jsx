import { useState, useEffect } from 'react';
import { api } from '../api/client';

const actionConfig = {
  add: { icon: '➕', label: 'Added', color: '#16a34a' },
  drop: { icon: '➖', label: 'Dropped', color: '#dc2626' },
  draft: { icon: '🏈', label: 'Drafted', color: '#2563eb' },
  trade: { icon: '⇄', label: 'Traded', color: '#ca8a04' },
  waiver: { icon: '📋', label: 'Waiver', color: '#7c3aed' },
  admin_remove: { icon: '🔧', label: 'Admin Remove', color: '#dc2626' },
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const perPage = 50;

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (teamFilter) params.set('team_id', teamFilter);
    if (actionFilter) params.set('action', actionFilter);
    params.set('limit', perPage);
    params.set('offset', page * perPage);
    api.get(`/transactions/league?${params}`).then(d => {
      setTransactions(d.transactions || []);
      setTotal(d.total || 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { api.get('/teams').then(d => setTeams(d.teams || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [teamFilter, actionFilter, page]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div>
      <h1>Transaction History</h1>

      <div className="search-bar" style={{ marginBottom: '1rem' }}>
        <select value={teamFilter} onChange={e => { setTeamFilter(e.target.value); setPage(0); }}>
          <option value="">All Teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}>
          <option value="">All Actions</option>
          <option value="add">Added</option>
          <option value="drop">Dropped</option>
          <option value="draft">Drafted</option>
          <option value="trade">Traded</option>
          <option value="waiver">Waiver</option>
          <option value="admin_remove">Admin Remove</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading...</p>
        ) : transactions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No transactions found.</p>
        ) : (
          <div>
            {transactions.map(tx => {
              const cfg = actionConfig[tx.action] || { icon: '•', label: tx.action, color: '#888' };
              return (
                <div key={tx.id} style={{
                  padding: '0.75rem 0', borderBottom: '1px solid var(--border)',
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                    flexShrink: 0,
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <img src={`/api/teams/${tx.team_id}/logo`} alt=""
                          style={{ width: 18, height: 18, borderRadius: 3, objectFit: 'contain', verticalAlign: 'middle', marginRight: '0.4rem' }}
                          onError={e => e.target.style.display = 'none'} />
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tx.team_name}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(tx.created_at)}</span>
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      <span style={{ color: cfg.color, fontWeight: 600, marginRight: '0.4rem' }}>{cfg.label}</span>
                      <span style={{ fontWeight: 500 }}>{tx.player_name}</span>
                      {tx.player_position && (
                        <span style={{ marginLeft: '0.4rem' }}>
                          <span className={`pos pos-${tx.player_position}`}>{tx.player_position}</span>
                        </span>
                      )}
                      {tx.player_club && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>{tx.player_club}</span>
                      )}
                      {tx.player_salary > 0 && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem', fontSize: '0.8rem' }}>£{tx.player_salary.toFixed(1)}m</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Page {page + 1} of {totalPages} · {total} transactions
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn btn-sm btn-secondary" disabled={page <= 0} onClick={() => setPage(0)}>«</button>
              <button className="btn btn-sm btn-secondary" disabled={page <= 0} onClick={() => setPage(p => p - 1)}>‹</button>
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
