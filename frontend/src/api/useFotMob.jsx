import { useState, useCallback } from 'react';
import { api } from '../api/client';

// Cache FotMob URLs in memory across components
const fotmobCache = {};

// Safari and installed home-screen apps block window.open() when it runs after
// an await (the click's user-gesture window has expired). Open the tab
// synchronously on click, then point it at the real URL once it's known.
function openTab(resolveUrl, fallbackUrl) {
  const tab = window.open('about:blank', '_blank');
  const go = (url) => {
    if (tab) tab.location.href = url;
    else window.location.href = url;
  };
  return Promise.resolve()
    .then(resolveUrl)
    .then(go)
    .catch(() => go(fallbackUrl));
}

export function useFotMob() {
  const [loading, setLoading] = useState({});

  const openPlayer = useCallback(async (fplPlayerId, playerName, e) => {
    if (e) e.preventDefault();
    const key = `player_${fplPlayerId}`;
    setLoading(prev => ({ ...prev, [fplPlayerId]: true }));
    await openTab(async () => {
      if (!fotmobCache[key]) {
        const data = await api.get(`/fotmob/player/${fplPlayerId}`);
        fotmobCache[key] = data.url;
      }
      return fotmobCache[key];
    }, `https://www.google.com/search?q=fotmob+${encodeURIComponent(playerName)}`);
    setLoading(prev => ({ ...prev, [fplPlayerId]: false }));
  }, []);

  const openTeam = useCallback(async (clubName, e) => {
    if (e) e.preventDefault();
    const key = `team_${clubName}`;
    await openTab(async () => {
      if (!fotmobCache[key]) {
        const data = await api.get(`/fotmob/team/${encodeURIComponent(clubName)}`);
        fotmobCache[key] = data.url;
      }
      return fotmobCache[key];
    }, `https://www.google.com/search?q=fotmob+${encodeURIComponent(clubName)}`);
  }, []);

  const PlayerLink = useCallback(({ id, name, children, style }) => (
    <a href="#" onClick={(e) => openPlayer(id, name, e)}
      style={{ fontWeight: 500, color: 'var(--text)', textDecoration: 'none', cursor: 'pointer', ...style }}
      onMouseEnter={e => e.target.style.color = 'var(--accent)'}
      onMouseLeave={e => e.target.style.color = style?.color || 'var(--text)'}>
      {children || name}
      {loading[id] && <span style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }}>{'↗'}</span>}
    </a>
  ), [loading, openPlayer]);

  const TeamLink = useCallback(({ name, children, style }) => (
    <a href="#" onClick={(e) => openTeam(name, e)}
      style={{ color: 'var(--text-muted)', textDecoration: 'none', cursor: 'pointer', ...style }}
      onMouseEnter={e => e.target.style.color = 'var(--accent)'}
      onMouseLeave={e => e.target.style.color = style?.color || 'var(--text-muted)'}>
      {children || name}
    </a>
  ), [openTeam]);

  return { openPlayer, openTeam, PlayerLink, TeamLink };
}
