import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFotMob } from '../api/useFotMob';
import { useAuth } from '../contexts/AuthContext';

export default function DraftPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState(null);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [showWishlist, setShowWishlist] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [teams, setTeams] = useState([]);
  const [myRoster, setMyRoster] = useState([]);
  const { PlayerLink, TeamLink } = useFotMob();
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [sortCol, setSortCol] = useState('total_points');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };
  const SortHeader = ({ col, label, style }) => (
    <th style={{ cursor: 'pointer', userSelect: 'none', ...style }} onClick={() => handleSort(col)}>
      {label} {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

  const load = () => {
    api.get('/draft').then(setDraft).catch(() => {});
    api.get('/teams').then(d => setTeams(d.teams)).catch(() => {});
    api.get('/teams/mine').then(d => setMyRoster(d.roster || [])).catch(() => {});
  };
  const loadWishlist = () => api.get('/wishlist').then(d => setWishlistIds(new Set(d.player_ids || []))).catch(() => {});
  useEffect(() => { load(); fetchPlayers(); loadWishlist(); }, []);

  const fetchPlayers = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (posFilter) params.set('position', posFilter);
    api.get(`/players?${params}`).then(d => setPlayers(d.players)).catch(() => {});
  };
  useEffect(() => { fetchPlayers(); }, [posFilter]);

  const pickPlayer = async (playerId) => {
    setMsg({ text: '', type: '' });
    try {
      const res = await api.post('/draft/pick', { player_id: playerId });
      setMsg({ text: res.message, type: 'success' });
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const startDraft = async () => {
    try {
      await api.post('/draft/start');
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const pickedIds = new Set(draft?.picked_player_ids || []);
  let available = players.filter(p => !pickedIds.has(p.id));
  if (showWishlist) available = available.filter(p => wishlistIds.has(p.id));

  // Sort available players
  available.sort((a, b) => {
    let aVal = a[sortCol], bVal = b[sortCol];
    if (aVal == null) aVal = ''; if (bVal == null) bVal = '';
    if (typeof aVal === 'number' || (typeof aVal === 'string' && !isNaN(aVal) && aVal !== '')) {
      aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0;
    }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Count clubs on my roster
  const clubCounts = {};
  myRoster.forEach(p => {
    const club = p.club || p.club_name || '';
    clubCounts[club] = (clubCounts[club] || 0) + 1;
  });
  const maxPerClub = 3;
  const maxedClubs = new Set(Object.entries(clubCounts).filter(([_, c]) => c >= maxPerClub).map(([k]) => k));

  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t.name; });

  const draftOrder = draft?.draft_order || [];
  const numTeams = draftOrder.length;
  const currentPick = draft?.current_pick || 0;

  let currentTeamId = null;
  if (draft?.status === 'active' && numTeams > 0) {
    const round = Math.floor(currentPick / numTeams);
    const idx = draft?.draft_order ? (
      round % 2 === 1 ? numTeams - 1 - (currentPick % numTeams) : currentPick % numTeams
    ) : 0;
    currentTeamId = draftOrder[idx];
  }

  return (
    <div>
      <h1>Draft Board</h1>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {(!draft || draft.status === 'none') && (
        <div className="card">
          <p style={{ marginBottom: '1rem' }}>No draft has been started yet.</p>
          {user?.is_admin && <button className="btn btn-primary" onClick={startDraft}>Start Draft</button>}
        </div>
      )}

      {draft?.status === 'completed' && (
        <div className="alert alert-success">Draft complete!</div>
      )}

      {draft?.status === 'active' && (
        <div className="draft-board">
          <div>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3>Pick #{currentPick + 1}</h3>
              <p style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {teamMap[currentTeamId] || 'Unknown'}'s turn
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Round {Math.floor(currentPick / numTeams) + 1}
              </p>
            </div>
            <div className="card">
              <h3>Draft Order</h3>
              <div style={{ fontSize: '0.85rem' }}>
                {draftOrder.map((tid, i) => (
                  <div key={tid} style={{
                    padding: '0.4rem 0.6rem',
                    borderLeft: `3px solid ${tid === currentTeamId ? 'var(--accent)' : 'transparent'}`,
                    color: tid === currentTeamId ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: tid === currentTeamId ? 600 : 400,
                  }}>
                    {i + 1}. {teamMap[tid] || `Team ${tid}`}
                  </div>
                ))}
              </div>
            </div>
            {draft.picks?.length > 0 && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <h3>Recent Picks</h3>
                <div className="draft-picks">
                  {[...draft.picks].reverse().slice(0, 20).map(p => (
                    <div className="pick-entry" key={p.id}>
                      <span className="pick-num">#{p.pick_number + 1}</span>
                      <span className={`pos pos-${p.player?.position}`}>{p.player?.position}</span>
                      <span style={{ fontWeight: 500 }}>{p.player?.name || p.player?.web_name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '0.8rem' }}>
                        {p.team_name} · £{p.salary.toFixed(1)}m
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="search-bar">
              <form onSubmit={e => { e.preventDefault(); fetchPlayers(); }} style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                <input placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="btn btn-secondary">Search</button>
              </form>
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
                <option value="">All</option>
                <option value="GK">GK</option>
                <option value="DEF">DEF</option>
                <option value="MID">MID</option>
                <option value="FWD">FWD</option>
              </select>
              <button className={`btn btn-sm ${showWishlist ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowWishlist(!showWishlist)}>
                ⭐ {showWishlist ? 'All' : 'Wishlist'}
              </button>
            </div>
            <div className="table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table>
                <thead><tr><th style={{ width: 36 }}></th><SortHeader col="position" label="Pos" /><SortHeader col="name" label="Player" /><SortHeader col="club_name" label="Club" /><SortHeader col="salary" label="Salary" /><SortHeader col="total_points" label="Pts" /><SortHeader col="form" label="Form" /><th></th></tr></thead>
                <tbody>
                  {available.slice(0, 80).map(p => {
                    const clubMaxed = maxedClubs.has(p.club) || maxedClubs.has(p.club_name);
                    const clubCount = clubCounts[p.club] || clubCounts[p.club_name] || 0;
                    return (
                    <tr key={p.id} style={{
                      background: wishlistIds.has(p.id) ? 'var(--accent-light)' : clubMaxed ? 'rgba(220,38,38,0.05)' : undefined,
                      opacity: clubMaxed ? 0.6 : 1,
                    }}>
                      <td>{wishlistIds.has(p.id) ? '⭐' : ''}</td>
                      <td><span className={`pos pos-${p.position}`}>{p.position}</span></td>
                      <td><PlayerLink id={p.player_id || p.id} name={p.name} /></td>
                      <td>
                        {p.club_name}
                        {clubCount > 0 && (
                          <span style={{
                            fontSize: '0.7rem', marginLeft: '0.4rem',
                            color: clubMaxed ? 'var(--red)' : 'var(--text-muted)',
                            fontWeight: 600,
                          }}>
                            ({clubCount}/{maxPerClub})
                          </span>
                        )}
                      </td>
                      <td>£{p.salary.toFixed(1)}m</td>
                      <td>{p.total_points}</td>
                      <td>{p.form}</td>
                      <td>
                        {clubMaxed ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600 }}>Club Full</span>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => pickPlayer(p.id)}>Draft</button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
