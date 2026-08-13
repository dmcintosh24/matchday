import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { usePushNotifications } from '../api/usePush';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [venmo, setVenmo] = useState('');
  const [paypal, setPaypal] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/auth/me').then(u => {
      setProfile(u);
      setEmail(u.email || '');
      setUsername(u.username || '');
      setVenmo(u.venmo || '');
      setPaypal(u.paypal || '');
    }).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });
    const updates = {};
    if (email !== profile.email) updates.email = email;
    if (username !== profile.username) updates.username = username;
    if (password) updates.password = password;
    if (venmo !== (profile.venmo || '')) updates.venmo = venmo;
    if (paypal !== (profile.paypal || '')) updates.paypal = paypal;

    if (Object.keys(updates).length === 0) {
      setMsg({ text: 'No changes to save', type: 'error' });
      setSaving(false);
      return;
    }

    try {
      const res = await api.put('/auth/profile', updates);
      setMsg({ text: res.message, type: 'success' });
      setPassword('');
      api.get('/auth/me').then(setProfile);
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    }
    setSaving(false);
  };

  if (!profile) return <div><h1>Profile</h1><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>;

  return (
    <div>
      <h1>Profile Settings</h1>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="card" style={{ maxWidth: 500 }}>
        <form onSubmit={save}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Manager Name</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>New Password <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(leave blank to keep current)</span></label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} placeholder="••••••" />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <h3>Payment Info</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Add your Venmo or PayPal so the commissioner can send payouts.
            </p>
            <div className="form-group">
              <label>Venmo Handle</label>
              <input value={venmo} onChange={e => setVenmo(e.target.value)} placeholder="@your-venmo" />
            </div>
            <div className="form-group">
              <label>PayPal Handle</label>
              <input value={paypal} onChange={e => setPaypal(e.target.value)} placeholder="@your-paypal" />
            </div>
          </div>

          <button className="btn btn-primary" disabled={saving} style={{ marginTop: '0.5rem' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <PushSettings />
    </div>
  );
}

function PushSettings() {
  const { supported, permission, subscribed, subscribe, unsubscribe, testPush } = usePushNotifications();
  const [msg, setMsg] = useState('');

  if (!supported) return (
    <div className="card" style={{ maxWidth: 500, marginTop: '1rem' }}>
      <h3>Push Notifications</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Push notifications aren't supported in this browser. Try Chrome, Edge, or Firefox, or add the app to your home screen on mobile.
      </p>
    </div>
  );

  return (
    <div className="card" style={{ maxWidth: 500, marginTop: '1rem' }}>
      <h3>Push Notifications</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Get notified when it's your turn to draft, someone proposes a trade, or it's time to set your lineup.
      </p>
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {permission === 'denied' ? (
        <p style={{ color: 'var(--red)', fontSize: '0.85rem' }}>
          Notifications are blocked. Enable them in your browser settings for this site.
        </p>
      ) : subscribed ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.85rem', alignSelf: 'center' }}>
            ✓ Notifications enabled
          </span>
          <button className="btn btn-sm btn-secondary" onClick={async () => {
            await testPush();
            setMsg('Test notification sent!');
            setTimeout(() => setMsg(''), 3000);
          }}>Send Test</button>
          <button className="btn btn-sm btn-danger" onClick={unsubscribe}>Disable</button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={async () => {
          const ok = await subscribe();
          if (ok) setMsg('Notifications enabled!');
          else setMsg('Could not enable notifications');
          setTimeout(() => setMsg(''), 3000);
        }}>Enable Notifications</button>
      )}
    </div>
  );
}
