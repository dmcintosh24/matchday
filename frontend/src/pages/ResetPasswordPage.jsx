import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

export default function ResetPasswordPage() {
  const [step, setStep] = useState('request'); // request | confirm
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestReset = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const data = await api.post('/auth/request-reset', { email });
      setMessage(data.message);
      if (data.reset_token) {
        setToken(data.reset_token);
        setMessage(`Reset token: ${data.reset_token}`);
      }
      setStep('confirm');
    } catch (err) { setError(err.message); }
  };

  const confirmReset = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      const data = await api.post('/auth/reset-password', { token, new_password: newPassword });
      setMessage(data.message + ' You can now sign in.');
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="auth-container">
      <div className="auth-card card">
        <h1>Reset Password</h1>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        {step === 'request' ? (
          <form onSubmit={requestReset}>
            <p>Enter your email to get a reset token</p>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Get Reset Token</button>
          </form>
        ) : (
          <form onSubmit={confirmReset}>
            <p>Enter the reset token and your new password</p>
            <div className="form-group">
              <label>Reset Token</label>
              <input value={token} onChange={e => setToken(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Reset Password</button>
          </form>
        )}
        <div className="footer">
          <Link to="/login" className="link">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
