import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const loadMessages = async () => {
    try {
      const data = await api.get('/chat?limit=100');
      setMessages((data.messages || []).reverse());
      setLoading(false);
    } catch { setLoading(false); }
  };

  const loadNewer = async () => {
    if (messages.length === 0) return;
    const latestId = messages[messages.length - 1]?.id;
    try {
      const data = await api.get('/chat?limit=50');
      const all = (data.messages || []).reverse();
      const newOnes = all.filter(m => m.id > latestId);
      if (newOnes.length > 0) {
        setMessages(prev => [...prev, ...newOnes]);
      }
    } catch {}
  };

  const loadOlder = async () => {
    if (messages.length === 0 || !hasMore) return;
    const oldestId = messages[0]?.id;
    try {
      const data = await api.get(`/chat?before_id=${oldestId}&limit=50`);
      const older = (data.messages || []).reverse();
      if (older.length === 0) setHasMore(false);
      else setMessages(prev => [...older, ...prev]);
    } catch {}
  };

  useEffect(() => {
    loadMessages();
    pollRef.current = setInterval(loadNewer, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  const send = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || sending) return;
    setSending(true);
    try {
      const msg = await api.post('/chat', { message: newMsg.trim() });
      setMessages(prev => [...prev, msg]);
      setNewMsg('');
    } catch {}
    setSending(false);
  };

  const deleteMsg = async (id) => {
    try {
      await api.del(`/chat/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  const formatTime = (ts) => {
    const d = new Date(ts + 'Z');
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const isMe = (msg) => msg.user_id === user?.id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', maxHeight: 'calc(100vh - 80px)' }}>
      <h1 style={{ margin: '0 0 0.75rem' }}>League Chat</h1>

      <div className="card" style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        padding: 0, marginBottom: '0.75rem',
      }}>
        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.5rem',
        }}>
          {hasMore && messages.length > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={loadOlder}
              style={{ alignSelf: 'center', marginBottom: '0.5rem' }}>
              Load older messages
            </button>
          )}

          {loading ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading...</p>
          ) : messages.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No messages yet. Be the first to say something!
            </p>
          ) : messages.map(m => (
            <div key={m.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe(m) ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              alignSelf: isMe(m) ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                marginBottom: '0.15rem',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isMe(m) ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {m.username}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {formatTime(m.created_at)}
                </span>
              </div>
              <div style={{
                padding: '0.5rem 0.8rem',
                borderRadius: isMe(m) ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: isMe(m) ? 'var(--accent)' : 'var(--bg-input)',
                color: isMe(m) ? '#fff' : 'var(--text)',
                fontSize: '0.9rem',
                lineHeight: 1.5,
                wordBreak: 'break-word',
                position: 'relative',
              }}>
                {m.message}
                {(isMe(m) || user?.is_admin) && (
                  <button onClick={() => deleteMsg(m.id)}
                    style={{
                      position: 'absolute', top: -6, right: isMe(m) ? -6 : 'auto', left: isMe(m) ? 'auto' : -6,
                      background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '50%',
                      width: 16, height: 16, fontSize: '0.55rem', cursor: 'pointer',
                      display: 'none', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                    }}
                    className="chat-delete-btn"
                    title="Delete message">✕</button>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <form onSubmit={send} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          placeholder="Type a message..."
          maxLength={2000}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={!newMsg.trim() || sending}>
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
