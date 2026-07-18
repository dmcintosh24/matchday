import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLeague } from './contexts/LeagueContext';
import { api } from './api/client';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import PlayersPage from './pages/PlayersPage';
import MyTeamPage from './pages/MyTeamPage';
import DraftPage from './pages/DraftPage';
import TradesPage from './pages/TradesPage';
import RostersPage from './pages/RostersPage';
import RulesPage from './pages/RulesPage';
import HowToPlayPage from './pages/HowToPlayPage';
import SchedulePage from './pages/SchedulePage';
import ScoringPage from './pages/ScoringPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const league = useLeague();
  if (loading) return <div style={{ padding: '2rem', color: '#8892ad' }}>Loading...</div>;
  if (!league.setupComplete) return <Navigate to="/setup" />;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const league = useLeague();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNav = () => setMenuOpen(false);

  return (
    <div className="app-layout">
      {/* Mobile header */}
      <header className="mobile-header">
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span /><span /><span />
        </button>
        <div className="mobile-brand">{league.name}</div>
      </header>

      {/* Overlay */}
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {league.hasLogo && (
              <img src="/api/config/logo" alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div>
              {league.name}
              <span>{league.subtitle}</span>
            </div>
          </div>
        </div>
        <nav>
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/how-to-play" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>How to Play</span>
          </NavLink>
          <NavLink to="/rules" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Rules & Scoring</span>
          </NavLink>
          <NavLink to="/team" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>My Team</span>
          </NavLink>
          <NavLink to="/schedule" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Schedule</span>
          </NavLink>
          <NavLink to="/scoring" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Scoring</span>
          </NavLink>
          <NavLink to="/players" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Players</span>
          </NavLink>
          <NavLink to="/trades" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Trades</span>
          </NavLink>
          <NavLink to="/rosters" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>All Rosters</span>
          </NavLink>
          <NavLink to="/draft" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>Draft Board</span>
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
            <span>My Profile</span>
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''} onClick={handleNav}>
              <span>Admin</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <span>{user?.username}</span>
          <br />
          <button onClick={() => { logout(); nav('/login'); }}>Sign out</button>
          <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', opacity: 0.5 }}>
            <a href={league.github || 'https://github.com/dmcintosh24/matchday'} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--sidebar-text)', textDecoration: 'none' }}>
              Powered by Matchday {league.version && `v${league.version}`}
            </a>
          </div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  const league = useLeague();

  return (
    <Routes>
      <Route path="/setup" element={league.setupComplete ? <Navigate to="/login" /> : <SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/players" element={<ProtectedRoute><AppLayout><PlayersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><AppLayout><MyTeamPage /></AppLayout></ProtectedRoute>} />
      <Route path="/draft" element={<ProtectedRoute><AppLayout><DraftPage /></AppLayout></ProtectedRoute>} />
      <Route path="/trades" element={<ProtectedRoute><AppLayout><TradesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><AppLayout><SchedulePage /></AppLayout></ProtectedRoute>} />
      <Route path="/scoring" element={<ProtectedRoute><AppLayout><ScoringPage /></AppLayout></ProtectedRoute>} />
      <Route path="/rules" element={<ProtectedRoute><AppLayout><RulesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/how-to-play" element={<ProtectedRoute><AppLayout><HowToPlayPage /></AppLayout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />
      <Route path="/rosters" element={<ProtectedRoute><AppLayout><RostersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AppLayout><AdminPage /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={league.setupComplete ? "/dashboard" : "/setup"} />} />
    </Routes>
  );
}
