import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useFotMob } from '../api/useFotMob';

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [gwFilter, setGwFilter] = useState('');
  const [showWishlist, setShowWishlist] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [sortCol, setSortCol] = useState('total_points');
  const [sortDir, setSortDir] = useState('desc');
  const [gameweeks, setGameweeks] = useState([]);
  const [page, setPage] = useState(1);
  const [myTeam, setMyTeam] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [faStatus, setFaStatus] = useState(null);
  const perPage = 50;
  const { PlayerLink, TeamLink } = useFotMob();

  const fetchPlayers = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (posFilter) params.set('position', posFilter);
    if (gwFilter) params.set('gameweek', gwFilter);
    if (clubFilter) params.set('club', clubFilter);
    api.get(`/players?${params}`).then(d => { setPlayers(d.players); setLoading(false); setPage(1); }).catch(() => setLoading(false));
  };

  const loadMyTeam = () => api.get('/teams/mine').then(setMyTeam).catch(() => {});
  const loadWishlist = () => api.get('/wishlist').then(d => setWishlistIds(new Set(d.player_ids || []))).catch(() => {});

  useEffect(() => {
    fetchPlayers();
    api.get('/schedule').then(d => setGameweeks(d.gameweeks || [])).catch(() => {});
    api.get('/clubs').then(d => setClubs(d.clubs || [])).catch(() => {});
    api.get('/free-agency/status').then(setFaStatus).catch(() => {});
    loadMyTeam();
    loadWishlist();
  }, []);
  useEffect(() => { fetchPlayers(); }, [posFilter, gwFilter, clubFilter]);

  const addPlayer = async (player) => {
    setMsg({ text: '', type: '' });
    try {
      const data = await api.post('/teams/mine/add', { player_id: player.id });
      setMsg({ text: data.message, type: 'success' });
      fetchPlayers(); loadMyTeam();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const toggleWishlist = async (playerId) => {
    try {
      if (wishlistIds.has(playerId)) {
        await api.del(`/wishlist/${playerId}`);
        setWishlistIds(prev => { const n = new Set(prev); n.delete(playerId); return n; });
      } else {
        await api.post('/wishlist', { player_id: playerId });
        setWishlistIds(prev => new Set(prev).add(playerId));
      }
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const refreshScores = async () => {
    setRefreshing(true);
    try {
      const res = await api.post('/scores/refresh');
      setMsg({ text: res.message, type: 'success' });
      fetchPlayers();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
    setRefreshing(false);
  };

  const statusLabel = (s) => ({ a: 'Fit', d: 'Doubtful', i: 'Injured', s: 'Suspended', u: 'Unavail' }[s] || s);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let list = [...players];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s) || p.web_name.toLowerCase().includes(s));
    }
    if (showWishlist) {
      list = list.filter(p => wishlistIds.has(p.id));
    }
    list.sort((a, b) => {
      let aVal = a[sortCol], bVal = b[sortCol];
      if (aVal == null) aVal = ''; if (bVal == null) bVal = '';
      if (typeof aVal === 'number' || (typeof aVal === 'string' && !isNaN(aVal) && aVal !== '')) {
        aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0;
      }
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return list;
  }, [players, search, sortCol, sortDir, showWishlist, wishlistIds]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const SortHeader = ({ col, label, style }) => (
    <th style={{ cursor: 'pointer', userSelect: 'none', ...style }} onClick={() => handleSort(col)}>
      {label} {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );
  const showGW = !!gwFilter;
  const cap = myTeam?.salary_cap || 100;
  const used = myTeam?.salary_used || 0;
  const remaining = myTeam?.salary_remaining || 0;
  const pct = (used / cap) * 100;

  const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const posMax = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  if (myTeam?.roster) myTeam.roster.forEach(p => { if (posCounts[p.position] !== undefined) posCounts[p.position]++; });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Players</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn btn-sm ${showWishlist ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setShowWishlist(!showWishlist); setPage(1); }}>
            ⭐ Wishlist {wishlistIds.size > 0 && `(${wishlistIds.size})`}
          </button>
          <button className="btn btn-sm btn-secondary" onClick={refreshScores} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Scores'}
          </button>
        </div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {faStatus?.enabled && (
        <div className={`alert ${faStatus.open ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '1rem' }}>
          {faStatus.open ? '🟢 ' : '🔴 '}{faStatus.message}
          {!faStatus.open && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.25rem' }}>Window: {faStatus.window}</span>}
        </div>
      )}

      {myTeam && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem' }}>
              <strong style={{ color: 'var(--accent)' }}>£{used.toFixed(1)}m</strong>
              <span style={{ color: 'var(--text-muted)' }}> used of £{cap}m</span>
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: remaining < 5 ? 'var(--red)' : 'var(--green)' }}>
              £{remaining.toFixed(1)}m remaining
            </span>
          </div>
          <div className="salary-bar" style={{ marginBottom: '0.5rem' }}>
            <div className={`salary-bar-fill ${pct > 90 ? 'danger' : pct > 75 ? 'warn' : 'ok'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {['GK', 'DEF', 'MID', 'FWD'].map(pos => (
              <span key={pos} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className={`pos pos-${pos}`}>{pos}</span>
                <span style={{ fontWeight: 600, color: posCounts[pos] >= posMax[pos] ? 'var(--red)' : 'var(--text)' }}>
                  {posCounts[pos]}/{posMax[pos]}
                </span>
              </span>
            ))}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Squad: {myTeam.roster?.length || 0}/15
            </span>
          </div>
        </div>
      )}

      <div className="search-bar">
        <input placeholder="Search by name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ flex: 1 }} />
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
          <option value="">All Positions</option>
          <option value="GK">GK</option><option value="DEF">DEF</option>
          <option value="MID">MID</option><option value="FWD">FWD</option>
        </select>
        <select value={clubFilter} onChange={e => setClubFilter(e.target.value)}>
          <option value="">All Clubs</option>
          {clubs.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
            <option key={c.id} value={c.short_name}>{c.name}</option>
          ))}
        </select>
        <select value={gwFilter} onChange={e => setGwFilter(e.target.value)}>
          <option value="">Season Totals</option>
          {gameweeks.filter(g => g.finished || g.is_current).map(g => (
            <option key={g.id} value={g.id}>GW{g.id}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <SortHeader col="position" label="Pos" />
                <SortHeader col="name" label="Player" />
                <SortHeader col="club_name" label="Club" />
                <SortHeader col="owner" label="Owner" />
                <SortHeader col="salary" label="Salary" />
                {showGW ? (
                  <>
                    <SortHeader col="gw_points" label="GW Pts" style={{ textAlign: 'center' }} />
                    <SortHeader col="gw_minutes" label="Mins" style={{ textAlign: 'center' }} />
                    <SortHeader col="gw_goals" label="Goals" style={{ textAlign: 'center' }} />
                    <SortHeader col="gw_assists" label="Assists" style={{ textAlign: 'center' }} />
                    <SortHeader col="gw_clean_sheets" label="CS" style={{ textAlign: 'center' }} />
                    <SortHeader col="gw_bonus" label="Bonus" style={{ textAlign: 'center' }} />
                  </>
                ) : (
                  <>
                    <SortHeader col="total_points" label="Pts" style={{ textAlign: 'center' }} />
                    <SortHeader col="form" label="Form" style={{ textAlign: 'center' }} />
                  </>
                )}
                <SortHeader col="status" label="Status" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={showGW ? 13 : 10} style={{ color: 'var(--text-muted)' }}>Loading players...</td></tr>
              ) : paged.map(p => (
                <tr key={p.id}>
                  <td>
                    <button className="star-btn" onClick={() => toggleWishlist(p.id)}
                      title={wishlistIds.has(p.id) ? 'Remove from wishlist' : 'Add to wishlist'}>
                      {wishlistIds.has(p.id) ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                  <td>
                    <PlayerLink id={p.id} name={p.name} />
                  </td>
                  <td>
                    <TeamLink name={p.club_name} />
                  </td>
                  <td style={{ color: p.owner ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.85rem' }}>{p.owner || 'Free Agent'}</td>
                  <td>£{p.salary.toFixed(1)}m</td>
                  {showGW ? (
                    <>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.gw_points}</td>
                      <td style={{ textAlign: 'center' }}>{p.gw_minutes}</td>
                      <td style={{ textAlign: 'center' }}>{p.gw_goals || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{p.gw_assists || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{p.gw_clean_sheets || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{p.gw_bonus || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.total_points}</td>
                      <td style={{ textAlign: 'center' }}>{p.form}</td>
                    </>
                  )}
                  <td>
                    <span className={`status-${p.status}`}>{statusLabel(p.status)}</span>
                    {p.injury_news && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{p.injury_news}</span>}
                  </td>
                  <td>{!p.owner && <button className="btn btn-sm btn-primary" onClick={() => addPlayer(p)}>Add</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Page {page} of {totalPages} · {filtered.length} players{gwFilter && ` · GW${gwFilter}`}{showWishlist && ' · Wishlist'}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
              <button className="btn btn-sm btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p;
                if (totalPages <= 7) p = i + 1;
                else if (page <= 4) p = i + 1;
                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                else p = page - 3 + i;
                return <button key={p} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>;
              })}
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="btn btn-sm btn-secondary" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
