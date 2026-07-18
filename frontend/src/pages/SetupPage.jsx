import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [leagueName, setLeagueName] = useState('');
  const [leagueSubtitle, setLeagueSubtitle] = useState('Fantasy Football League');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logo, setLogo] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const handleFinish = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // 1. Register admin account
      const data = await register(email, username, password);

      // 2. Set league name
      await api.put('/config', [
        { key: 'league_name', value: leagueName },
        { key: 'league_subtitle', value: leagueSubtitle },
      ]);

      // 3. Upload logo if provided
      if (logo) {
        const formData = new FormData();
        formData.append('file', logo);
        const token = localStorage.getItem('token');
        await fetch('/api/admin/upload-logo', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
      }

      nav('/dashboard');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '3rem' }}>⚽</span>
          <h1 style={{ color: 'var(--accent)', margin: '0.5rem 0 0.25rem' }}>Welcome to Matchday</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Let's set up your fantasy league</p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: s <= step ? 'var(--accent)' : 'var(--border)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 1 && (
          <div>
            <h2>Name Your League</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              This is what your managers will see when they log in.
            </p>
            <div className="form-group">
              <label>League Name</label>
              <input value={leagueName} onChange={e => setLeagueName(e.target.value)}
                placeholder="e.g., Matchday Yanks" required />
            </div>
            <div className="form-group">
              <label>Subtitle</label>
              <input value={leagueSubtitle} onChange={e => setLeagueSubtitle(e.target.value)}
                placeholder="e.g., Fantasy Football League" />
            </div>
            <div className="form-group">
              <label>League Logo (optional)</label>
              <input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])}
                style={{ padding: '0.5rem' }} />
              {logo && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{logo.name}</p>}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}
              onClick={() => setStep(2)} disabled={!leagueName}>
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2>Create Admin Account</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              This will be the league commissioner account with full admin access.
            </p>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Manager Name</label>
              <input value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={() => setStep(3)} disabled={!email || !username || !password}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2>Review & Launch</h2>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>League:</span>
                <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{leagueName}</span>
                {leagueSubtitle && <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>— {leagueSubtitle}</span>}
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Admin:</span>
                <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{username}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>({email})</span>
              </div>
              {logo && (
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Logo:</span>
                  <span style={{ marginLeft: '0.5rem' }}>{logo.name}</span>
                </div>
              )}
            </div>
            <form onSubmit={handleFinish}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                  {saving ? 'Setting up...' : 'Launch League ⚽'}
                </button>
              </div>
            </form>
          </div>
        )}

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1.5rem' }}>
          Powered by <a href="https://github.com/dmcintosh24/matchday" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>Matchday</a> v{window.__MATCHDAY_VERSION || '1.1.0'}
        </p>
      </div>
    </div>
  );
}
