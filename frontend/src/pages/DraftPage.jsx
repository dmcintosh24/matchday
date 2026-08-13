import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useFotMob } from '../api/useFotMob';

export default function DraftPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState(null);
  const [players, setPlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]); // Unfiltered for queue names
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [showWishlist, setShowWishlist] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [teams, setTeams] = useState([]);
  const [myRoster, setMyRoster] = useState([]);
  const [queue, setQueue] = useState([]);
  const [autoDraft, setAutoDraft] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [tab, setTab] = useState('players');
  const [scorecard, setScorecard] = useState(null);
  const { PlayerLink } = useFotMob();
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [sortCol, setSortCol] = useState('total_points');
  const [sortDir, setSortDir] = useState('desc');
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);

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
    api.get('/draft').then(d => {
      setDraft(d);
      setAutoDraft(d.auto_draft || false);
      if (d.time_remaining_seconds != null) setTimeRemaining(Math.floor(d.time_remaining_seconds));
      if (d.status === 'completed' && !scorecard) {
        api.get('/draft/scorecard').then(s => setScorecard(s)).catch(() => {});
      }
    }).catch(() => {});
    api.get('/teams').then(d => setTeams(d.teams)).catch(() => {});
    api.get('/teams/mine').then(d => setMyRoster(d.roster || [])).catch(() => {});
  };
  const loadQueue = () => api.get('/draft/queue').then(d => setQueue(d.queue || [])).catch(() => {});
  const loadWishlist = () => api.get('/wishlist').then(d => setWishlistIds(new Set(d.player_ids || []))).catch(() => {});

  const fetchPlayers = () => {
    const params = new URLSearchParams();
    if (posFilter) params.set('position', posFilter);
    if (search) params.set('search', search);
    api.get(`/players?${params}`).then(d => setPlayers(d.players || [])).catch(() => {});
  };
  const fetchAllPlayers = () => {
    api.get('/players').then(d => setAllPlayers(d.players || [])).catch(() => {});
  };

  useEffect(() => { load(); fetchPlayers(); fetchAllPlayers(); loadWishlist(); loadQueue(); }, []);
  useEffect(() => { fetchPlayers(); }, [posFilter]);

  useEffect(() => {
    if (draft?.status === 'active') {
      pollRef.current = setInterval(() => {
        api.get('/draft').then(d => {
          setDraft(d);
          if (d.time_remaining_seconds != null) setTimeRemaining(Math.floor(d.time_remaining_seconds));
        }).catch(() => {});
      }, 5000);
      return () => clearInterval(pollRef.current);
    }
  }, [draft?.status]);

  useEffect(() => {
    if (timeRemaining != null && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => prev != null && prev > 0 ? prev - 1 : 0);
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [timeRemaining != null]);

  const pickPlayer = async (playerId) => {
    setMsg({ text: '', type: '' });
    try {
      const data = await api.post('/draft/pick', { player_id: playerId });
      setMsg({ text: data.message, type: 'success' });
      load(); fetchPlayers(); fetchAllPlayers(); loadQueue();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const toggleAutoDraft = async () => {
    try {
      const res = await api.put('/draft/auto-draft');
      setAutoDraft(res.auto_draft);
      setMsg({ text: res.message, type: 'success' });
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const addToQueue = async (playerId) => {
    try { await api.post('/draft/queue/add', { player_id: playerId }); loadQueue(); }
    catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const removeFromQueue = async (playerId) => {
    try { await api.del(`/draft/queue/${playerId}`); loadQueue(); } catch {}
  };

  const moveInQueue = async (fromIdx, toIdx) => {
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIdx, 1);
    newQueue.splice(toIdx, 0, moved);
    setQueue(newQueue);
    try { await api.put('/draft/queue', { player_ids: newQueue.map(q => q.player_id) }); } catch {}
  };

  const pickedIds = new Set(draft?.picked_player_ids || []);
  let available = players.filter(p => !pickedIds.has(p.id) && p.status !== 'u');
  if (showWishlist) available = available.filter(p => wishlistIds.has(p.id));

  available.sort((a, b) => {
    let aVal = a[sortCol], bVal = b[sortCol];
    if (aVal == null) aVal = ''; if (bVal == null) bVal = '';
    if (typeof aVal === 'number' || (typeof aVal === 'string' && !isNaN(aVal) && aVal !== '')) {
      aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0;
    }
    if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Use allPlayers for queue name lookup (fix for filter bug)
  const allPlayerMap = {};
  allPlayers.forEach(p => allPlayerMap[p.id] = p);

  // Club counts
  const clubCounts = {};
  myRoster.forEach(p => { const club = p.club || p.club_name || ''; clubCounts[club] = (clubCounts[club] || 0) + 1; });
  const maxPerClub = 3;
  const maxedClubs = new Set(Object.entries(clubCounts).filter(([_, c]) => c >= maxPerClub).map(([k]) => k));

  // Position counts
  const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const posMax = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  myRoster.forEach(p => { if (posCounts[p.position] !== undefined) posCounts[p.position]++; });
  const salaryUsed = myRoster.reduce((s, p) => s + (p.salary || 0), 0);
  const salaryCap = 100;
  const salaryPct = (salaryUsed / salaryCap) * 100;

  const teamMap = {};
  teams.forEach(t => teamMap[t.id] = t.name);
  const draftOrder = draft?.draft_order || [];
  const numTeams = draftOrder.length;
  const currentPick = draft?.current_pick || 0;
  const currentRound = numTeams > 0 ? Math.floor(currentPick / numTeams) + 1 : 1;

  let currentTeamId = null;
  if (draft?.status === 'active' && numTeams > 0) {
    const round = Math.floor(currentPick / numTeams);
    const idx = round % 2 === 1 ? numTeams - 1 - (currentPick % numTeams) : currentPick % numTeams;
    currentTeamId = draftOrder[idx];
  }

  const myTeamId = teams.find(t => t.username === user?.username)?.id;
  const isMyPick = currentTeamId === myTeamId;
  const formatTime = (secs) => { if (secs == null) return ''; const m = Math.floor(secs / 60); const s = secs % 60; return `${m}:${s.toString().padStart(2, '0')}`; };

  const gradeColor = (g) => ({ A: '#16a34a', 'B+': '#2563eb', B: '#2563eb', 'C+': '#ca8a04', C: '#ca8a04', D: '#dc2626', F: '#dc2626' }[g] || '#888');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Draft Board</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className={`btn btn-sm ${autoDraft ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleAutoDraft}>
            {autoDraft ? '🤖 Auto-Draft ON' : 'Auto-Draft OFF'}
          </button>
        </div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Timer + round bar */}
      {draft?.status === 'active' && (
        <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Round {currentRound} · </span>
              <span style={{ fontWeight: 600 }}>Pick #{currentPick + 1}</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 0.5rem' }}>—</span>
              <span style={{ fontWeight: 700, color: isMyPick ? 'var(--accent)' : 'var(--text)' }}>
                {isMyPick ? "YOUR PICK!" : teamMap[currentTeamId] || 'Unknown'}
              </span>
            </div>
            {timeRemaining != null && (
              <div style={{
                fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace',
                color: timeRemaining < 120 ? 'var(--red)' : timeRemaining < 300 ? 'var(--yellow)' : 'var(--green)',
              }}>
                {formatTime(timeRemaining)}
              </div>
            )}
          </div>
          {timeRemaining != null && (
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 1s linear',
                width: `${Math.max(0, (timeRemaining / ((draft?.pick_timeout_minutes || 5) * 60)) * 100)}%`,
                background: timeRemaining < 120 ? 'var(--red)' : timeRemaining < 300 ? 'var(--yellow)' : 'var(--green)',
              }} />
            </div>
          )}
          {/* Roster composition bar */}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {['GK', 'DEF', 'MID', 'FWD'].map(pos => (
                  <span key={pos} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <span className={`pos pos-${pos}`}>{pos}</span>
                    <span style={{ fontWeight: 600, color: posCounts[pos] >= posMax[pos] ? 'var(--red)' : 'var(--text)' }}>
                      {posCounts[pos]}/{posMax[pos]}
                    </span>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Budget: </span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>£{salaryUsed.toFixed(1)}m</span>
                <span style={{ color: 'var(--text-muted)' }}> / £{salaryCap}m</span>
                <span style={{ fontWeight: 600, color: (salaryCap - salaryUsed) < 10 ? 'var(--red)' : 'var(--green)', marginLeft: '0.5rem' }}>
                  £{(salaryCap - salaryUsed).toFixed(1)}m left
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {(!draft || draft.status === 'none') && (
        <div className="card"><p style={{ color: 'var(--text-muted)' }}>No draft in progress. Set up your queue while you wait!</p></div>
      )}

      {draft?.status === 'completed' && !scorecard && (
        <div className="card"><p style={{ color: 'var(--green)', fontWeight: 600 }}>Draft Complete!</p></div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button className={`tab ${tab === 'players' ? 'active' : ''}`} onClick={() => setTab('players')}>Available Players</button>
        <button className={`tab ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>My Queue ({queue.length})</button>
        {draft?.status === 'completed' && (
          <button className={`tab ${tab === 'scorecard' ? 'active' : ''}`} onClick={() => {
            setTab('scorecard');
            if (!scorecard) api.get('/draft/scorecard').then(s => setScorecard(s)).catch(() => {});
          }}>Draft Grades</button>
        )}
      </div>

      {/* Available Players Tab */}
      {tab === 'players' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem' }} className="draft-board">
          <div className="card">
            <div className="search-bar">
              <form onSubmit={e => { e.preventDefault(); fetchPlayers(); }} style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                <input placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="btn btn-secondary">Search</button>
              </form>
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)}>
                <option value="">All</option>
                <option value="GK">GK</option><option value="DEF">DEF</option>
                <option value="MID">MID</option><option value="FWD">FWD</option>
              </select>
              <button className={`btn btn-sm ${showWishlist ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowWishlist(!showWishlist)}>{'⭐'} {showWishlist ? 'All' : 'Wishlist'}</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table>
                <thead><tr>
                  <th style={{ width: 36 }}></th>
                  <SortHeader col="position" label="Pos" />
                  <SortHeader col="name" label="Player" />
                  <SortHeader col="club_name" label="Club" />
                  <SortHeader col="salary" label="Salary" />
                  <SortHeader col="total_points" label="Pts" />
                  <SortHeader col="form" label="Form" />
                  <th></th>
                </tr></thead>
                <tbody>
                  {available.slice(0, 80).map(p => {
                    const clubMaxed = maxedClubs.has(p.club) || maxedClubs.has(p.club_name);
                    const clubCount = clubCounts[p.club] || clubCounts[p.club_name] || 0;
                    const inQueue = queue.some(q => q.player_id === p.id);
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
                        {clubCount > 0 && <span style={{ fontSize: '0.7rem', marginLeft: '0.4rem', color: clubMaxed ? 'var(--red)' : 'var(--text-muted)', fontWeight: 600 }}>({clubCount}/{maxPerClub})</span>}
                      </td>
                      <td>£{p.salary.toFixed(1)}m</td>
                      <td>{p.total_points}</td>
                      <td>{p.form}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {clubMaxed ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--red)', fontWeight: 600 }}>Club Full</span>
                          ) : draft?.status === 'active' && isMyPick ? (
                            <button className="btn btn-sm btn-primary" onClick={() => pickPlayer(p.id)}>Draft</button>
                          ) : null}
                          {!inQueue && !clubMaxed && (
                            <button className="btn btn-sm btn-secondary" onClick={() => addToQueue(p.id)} title="Add to queue">+Q</button>
                          )}
                          {inQueue && <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 600, alignSelf: 'center' }}>In Queue</span>}
                        </div>
                      </td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3>Draft Order</h3>
              {draftOrder.map((tid, i) => {
                const isCurrentPicker = tid === currentTeamId;
                return (
                  <div key={tid} style={{
                    fontSize: '0.8rem', padding: '0.35rem 0.25rem', borderBottom: '1px solid var(--border)',
                    fontWeight: isCurrentPicker ? 700 : 400, background: isCurrentPicker ? 'var(--accent-light)' : undefined,
                    borderRadius: isCurrentPicker ? 4 : 0, display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span><span style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>{i + 1}.</span>{teamMap[tid] || 'Team'}</span>
                    {isCurrentPicker && <span style={{ color: 'var(--accent)', fontSize: '0.7rem' }}>PICKING</span>}
                  </div>
                );
              })}
            </div>
            <div className="card">
              <h3>Pick History ({(draft?.picks || []).length})</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {(draft?.picks || []).slice().reverse().map(p => (
                  <div key={p.pick_number} style={{ fontSize: '0.8rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>#{p.pick_number + 1}</span>{' '}
                        <span style={{ fontWeight: 500 }}>{p.player?.name || p.player?.web_name}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>£{p.salary?.toFixed(1)}m</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      {teamMap[p.team_id] || 'Team'} {p.player?.position && <span> · <span className={`pos pos-${p.player.position}`}>{p.player.position}</span></span>}
                    </div>
                  </div>
                ))}
              </div>
              {(!draft?.picks || draft.picks.length === 0) && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No picks yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Queue Tab */}
      {tab === 'queue' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>My Draft Queue</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Drag or use arrows to reorder. Top player gets picked first.</span>
          </div>
          {queue.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No players queued. Go to the Available Players tab and click "+Q" to add players.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th style={{ width: 40 }}>#</th><th style={{ width: 60 }}></th><th>Player</th><th>Club</th><th>Pos</th><th>Salary</th><th>Pts</th><th></th></tr></thead>
                <tbody>
                  {queue.map((q, i) => {
                    const p = allPlayerMap[q.player_id] || {};
                    const unavail = pickedIds.has(q.player_id) || p.status === 'u';
                    return (
                      <tr key={q.player_id} draggable
                        onDragStart={() => setDragIdx(i)} onDragOver={e => e.preventDefault()}
                        onDrop={() => { if (dragIdx !== null && dragIdx !== i) moveInQueue(dragIdx, i); setDragIdx(null); }}
                        style={{ opacity: unavail ? 0.4 : 1, cursor: 'grab', background: dragIdx === i ? 'var(--accent-light)' : undefined }}>
                        <td style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.15rem' }}>
                            <button onClick={() => i > 0 && moveInQueue(i, i - 1)} disabled={i === 0}
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: i === 0 ? 'default' : 'pointer', padding: '0.1rem 0.35rem', fontSize: '0.75rem', color: i === 0 ? 'var(--border)' : 'var(--text)' }}>▲</button>
                            <button onClick={() => i < queue.length - 1 && moveInQueue(i, i + 1)} disabled={i === queue.length - 1}
                              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: i === queue.length - 1 ? 'default' : 'pointer', padding: '0.1rem 0.35rem', fontSize: '0.75rem', color: i === queue.length - 1 ? 'var(--border)' : 'var(--text)' }}>▼</button>
                          </div>
                        </td>
                        <td style={{ fontWeight: 500, textDecoration: unavail ? 'line-through' : 'none' }}>
                          {p.name || `Player #${q.player_id}`}
                          {pickedIds.has(q.player_id) && <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginLeft: '0.5rem' }}>Taken</span>}
                          {p.status === 'u' && <span style={{ fontSize: '0.7rem', color: 'var(--red)', marginLeft: '0.5rem' }}>Unavailable</span>}
                        </td>
                        <td>{p.club_name || ''}</td>
                        <td><span className={`pos pos-${p.position || '?'}`}>{p.position || '?'}</span></td>
                        <td>{p.salary ? `£${p.salary.toFixed(1)}m` : ''}</td>
                        <td>{p.total_points || ''}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            {draft?.status === 'active' && isMyPick && !unavail && (
                              <button className="btn btn-sm btn-primary" onClick={() => pickPlayer(q.player_id)}>Draft</button>
                            )}
                            <button className="btn btn-sm btn-danger" onClick={() => removeFromQueue(q.player_id)} style={{ padding: '0.2rem 0.5rem' }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scorecard Tab */}
      {tab === 'scorecard' && scorecard && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Draft Report Card</h2>
          </div>
          {scorecard.scorecard.map((t, i) => (
            <div key={t.team_id} className="card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>#{i + 1} </span>
                  <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{t.team_name}</span>
                </div>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: gradeColor(t.grade), padding: '0 0.5rem' }}>{t.grade}</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <span>Total: <strong style={{ color: 'var(--text)' }}>{t.total_points} pts</strong></span>
                <span>Avg: <strong style={{ color: 'var(--text)' }}>{t.avg_per_player}/player</strong></span>
                <span>Value: <strong style={{ color: 'var(--text)' }}>{t.pts_per_million} pts/£m</strong></span>
                <span>Spent: <strong style={{ color: 'var(--text)' }}>£{t.total_salary}m</strong></span>
                {t.zeros > 0 && <span style={{ color: 'var(--red)' }}>Zeros: {t.zeros}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
                {['GK','DEF','MID','FWD'].map(pos => (
                  <span key={pos} className={`pos pos-${pos}`} style={{ fontSize: '0.7rem' }}>{pos} {t.position_counts[pos] || 0}</span>
                ))}
              </div>
              <div style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', background: 'var(--bg-input)', borderRadius: 'var(--radius)' }}>
                <span style={{ color: 'var(--green)', fontWeight: 500 }}>Best:</span> {t.best_pick.player_name} ({t.best_pick.total_points}pts, £{t.best_pick.salary}m)
                {' · '}
                <span style={{ color: 'var(--green)', fontWeight: 500 }}>Value:</span> {t.best_value.player_name} ({(t.best_value.total_points / t.best_value.salary).toFixed(1)} pts/£m)
                {' · '}
                <span style={{ color: 'var(--red)', fontWeight: 500 }}>Worst:</span> {t.worst_pick.player_name} ({t.worst_pick.total_points}pts)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
