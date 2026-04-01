'use client';
import { useState } from 'react';

interface BulkDeleteModalProps {
  pageId: string;
  onClose: () => void;
  onDeleted: (count: number) => void;
}

export default function BulkDeleteModal({ pageId, onClose, onDeleted }: BulkDeleteModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!from || !to) { setError('Please select both dates.'); return; }
    if (from > to) { setError('"From" date must be before "To" date.'); return; }
    if (!confirm(`⚠️ This will permanently delete ALL posts published between ${from} and ${to}.\n\nAre you sure?`)) return;

    setDeleting(true);
    setError('');
    try {
      const params = new URLSearchParams({ pageId, from, to });
      const res = await fetch(`/api/posts/bulk?${params}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      onDeleted(data.deletedCount ?? 0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#0d1117', border: '1px solid #7f1d1d', borderRadius: '16px',
        width: '100%', maxWidth: '440px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #7f1d1d', backgroundColor: '#1a0a0a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5', margin: 0 }}>🗑️ Bulk Delete Posts</p>
            <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', margin: '2px 0 0' }}>
              ⚠️ This action is permanent and cannot be undone
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#64748b', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
            Delete all posts whose article date falls within the selected range.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                From Date
              </label>
              <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)}
                style={{ width: '100%', backgroundColor: '#1a1f2e', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                To Date
              </label>
              <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)}
                style={{ width: '100%', backgroundColor: '#1a1f2e', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          {error && (
            <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '12px', padding: '8px 12px', backgroundColor: '#1a0a0a', borderRadius: '6px', border: '1px solid #7f1d1d' }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting || !from || !to}
            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: deleting ? '#7f1d1d' : '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: deleting ? 'wait' : 'pointer', opacity: (!from || !to) ? 0.5 : 1 }}>
            {deleting ? '⏳ Deleting...' : '🗑️ Delete Posts'}
          </button>
        </div>
      </div>
    </div>
  );
}
