import { createContext, useContext, useState, useEffect } from 'react';

const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const [league, setLeague] = useState({
    name: 'Matchday',
    subtitle: 'Fantasy Football League',
    version: '',
    github: '',
    setupComplete: true,
    hasLogo: false,
  });

  useEffect(() => {
    // Fetch public config (no auth needed)
    Promise.all([
      fetch('/api/config').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/api/version').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      fetch('/api/setup/status').then(r => r.ok ? r.json() : {}).catch(() => ({ setup_complete: true })),
      fetch('/api/config/logo').then(r => ({ hasLogo: r.ok })).catch(() => ({ hasLogo: false })),
    ]).then(([config, version, setup, logo]) => {
      setLeague({
        name: config.league_name?.value || 'Matchday',
        subtitle: config.league_subtitle?.value || 'Fantasy Football League',
        version: version.version || '',
        github: version.github || '',
        setupComplete: setup.setup_complete !== false,
        hasLogo: logo.hasLogo,
      });
    });
  }, []);

  const refresh = () => {
    fetch('/api/config').then(r => r.ok ? r.json() : {}).then(config => {
      setLeague(prev => ({
        ...prev,
        name: config.league_name?.value || prev.name,
        subtitle: config.league_subtitle?.value || prev.subtitle,
      }));
    }).catch(() => {});
  };

  return (
    <LeagueContext.Provider value={{ ...league, refresh }}>
      {children}
    </LeagueContext.Provider>
  );
}

export const useLeague = () => useContext(LeagueContext);
