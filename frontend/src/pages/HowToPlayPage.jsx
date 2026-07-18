import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function HowToPlayPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(null); // section id or 'new'
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const load = () => api.get('/how-to-play').then(d => setSections(d.sections || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const startEdit = (section) => {
    setEditing(section.id);
    setEditTitle(section.title);
    setEditBody(section.body);
    setEditOrder(section.section_order);
  };

  const startNew = () => {
    setEditing('new');
    setEditTitle('');
    setEditBody('');
    setEditOrder(sections.length > 0 ? Math.max(...sections.map(s => s.section_order)) + 1 : 1);
  };

  const cancel = () => { setEditing(null); setMsg({ text: '', type: '' }); };

  const save = async () => {
    setMsg({ text: '', type: '' });
    try {
      if (editing === 'new') {
        await api.post('/how-to-play', { title: editTitle, body: editBody, section_order: editOrder });
      } else {
        await api.put(`/how-to-play/${editing}`, { title: editTitle, body: editBody, section_order: editOrder });
      }
      setEditing(null);
      setMsg({ text: 'Saved!', type: 'success' });
      load();
    } catch (err) { setMsg({ text: err.message, type: 'error' }); }
  };

  const deleteSection = async (id) => {
    if (!confirm('Delete this section?')) return;
    const token = localStorage.getItem('token');
    await fetch(`/api/how-to-play/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>How to Play</h1>
        {user?.is_admin && editing === null && (
          <button className="btn btn-sm btn-primary" onClick={startNew}>Add Section</button>
        )}
      </div>
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {sections.map((s, i) => (
        <div key={s.id} className="card" style={{ marginBottom: '1rem' }}>
          {editing === s.id ? (
            <div>
              <div className="form-group">
                <label>Section Title</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Order</label>
                <input type="number" value={editOrder} onChange={e => setEditOrder(parseInt(e.target.value) || 0)} style={{ maxWidth: 80 }} />
              </div>
              <div className="form-group">
                <label>Content</label>
                <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
                  style={{
                    width: '100%', minHeight: '150px', padding: '0.6rem 0.8rem',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', color: 'var(--text)',
                    fontFamily: 'var(--font-body)', fontSize: '0.9rem', resize: 'vertical',
                  }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={save} disabled={!editTitle || !editBody}>Save</button>
                <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>{s.title}</h2>
                {user?.is_admin && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteSection(s.id)}>✕</button>
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.body}</div>
            </div>
          )}
        </div>
      ))}

      {editing === 'new' && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>New Section</h3>
          <div className="form-group">
            <label>Section Title</label>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Order</label>
            <input type="number" value={editOrder} onChange={e => setEditOrder(parseInt(e.target.value) || 0)} style={{ maxWidth: 80 }} />
          </div>
          <div className="form-group">
            <label>Content</label>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
              style={{
                width: '100%', minHeight: '150px', padding: '0.6rem 0.8rem',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--text)',
                fontFamily: 'var(--font-body)', fontSize: '0.9rem', resize: 'vertical',
              }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={save} disabled={!editTitle || !editBody}>Save</button>
            <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {sections.length === 0 && editing === null && (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            No content yet. {user?.is_admin ? 'Click "Add Section" to get started.' : 'Check back soon!'}
          </p>
        </div>
      )}
    </div>
  );
}
