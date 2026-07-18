import { useState, useCallback } from 'react';
import { api } from '../api/client';

// Cache FotMob URLs in memory across components
const fotmobCache = {};

export function useFotMob() {
  const [loading, setLoading] = useState({});

  const openPlayer = useCallback(async (fplPlayerId, playerName, e) => {
    if (e) e.preventDefault();

    // Check memory cache
    if (fotmobCache[`player_${fplPlayerId}`]) {
      window.open(fotmobCache[`player_${fplPlayerId}`], '_blank');
      return;
    }

    setLoading(prev => ({ ...prev, [fplPlayerId]: true }));
    try {
      const data = await api.get(`/fotmob/player/${fplPlayerId}`);
      fotmobCache[`player_${fplPlayerId}`] = data.url;
      window.open(data.url, '_blank');
    } catch {
      // Fallback to Google
      window.open(`https://www.google.com/search?q=fotmob+${encodeURIComponent(playerName)}`, '_blank');
    }
    setLoading(prev => ({ ...prev, [fplPlayerId]: false }));
  }, []);

  const openTeam = useCallback(async (clubName, e) => {
    if (e) e.preventDefault();

    if (fotmobCache[`team_${clubName}`]) {
      window.open(fotmobCache[`team_${clubName}`], '_blank');
      return;
    }

    try {
      const data = await api.get(`/fotmob/team/${encodeURIComponent(clubName)}`);
      fotmobCache[`team_${clubName}`] = data.url;
      window.open(data.url, '_blank');
    } catch {
      window.open(`https://www.google.com/search?q=fotmob+${encodeURIComponent(clubName)}`, '_blank');
    }
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
