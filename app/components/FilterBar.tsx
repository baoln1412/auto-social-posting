'use client';
import React, { useState } from 'react';

import DateRangePicker from './DateRangePicker';

interface FilterBarProps {
  sources: string[];
  selectedSource: string;
  fromDate: string;
  toDate: string;
  doneFilter: string;
  onSourceChange: (s: string) => void;
  onDateRangeChange: (from: string, to: string) => void;
  onDoneFilterChange: (d: string) => void;
  totalCount: number;
  pageId: string;
  onPostsDeleted?: () => void;
}

// ── Bulk Delete Modal ─────────────────────────────────────────────────────────
function BulkDeleteModal({
  pageId,
  onClose,
  onDeleted,
}: {
  pageId: string;
  onClose: () => void;
  onDeleted: (count: number) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!from || !to) { setError('Please select both dates.'); return; }
    if (from > to) { setError('"From" date must be before "To" date.'); return; }
    if (!confirm(`⚠️ This will permanently delete ALL posts published between ${from} and ${to} for this page.\n\nAre you sure?`)) return;

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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        backgroundColor: '#0d1117', border: '1px solid #7f1d1d',
        borderRadius: '16px', width: '100%', maxWidth: '440px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #7f1d1d',
          backgroundColor: '#1a0a0a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>🗑️ Bulk Delete Posts</p>
            <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px' }}>⚠️ This action is permanent and cannot be undone</p>
          </div>
          <button onClick={onClose} style={{ color: '#64748b', fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
            Select a date range to delete all posts within that period. Posts are matched by their <strong>published/article date</strong>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                From Date
              </label>
              <input
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
                style={{
                  width: '100%', backgroundColor: '#1a1f2e', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                To Date
              </label>
              <input
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
                style={{
                  width: '100%', backgroundColor: '#1a1f2e', color: '#e2e8f0',
                  border: '1px solid #334155', borderRadius: '8px', padding: '8px 12px',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
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
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: '1px solid #334155',
              backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || !from || !to}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              backgroundColor: deleting ? '#7f1d1d' : '#dc2626',
              color: '#fff', fontSize: '13px', fontWeight: 600, cursor: deleting ? 'wait' : 'pointer',
              opacity: (!from || !to) ? 0.5 : 1,
            }}
          >
            {deleting ? '⏳ Deleting...' : '🗑️ Delete Posts'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────
export default function FilterBar({
  sources,
  selectedSource,
  fromDate,
  toDate,
  doneFilter,
  onSourceChange,
  onDateRangeChange,
  onDoneFilterChange,
  totalCount,
  pageId,
  onPostsDeleted,
}: FilterBarProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const selectStyle: React.CSSProperties = {
    backgroundColor: '#1a1f2e',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '140px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '16px',
          flexWrap: 'wrap',
          padding: '12px 16px',
          backgroundColor: '#0d1117',
          borderRadius: '10px',
          border: '1px solid #1e293b',
        }}
      >
        {/* Source Filter */}
        <div>
          <label style={labelStyle}>📰 Source</label>
          <select
            value={selectedSource}
            onChange={(e) => onSourceChange(e.target.value)}
            style={selectStyle}
          >
            <option value="All">All Sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Picker */}
        <DateRangePicker
          fromDate={fromDate}
          toDate={toDate}
          onChange={onDateRangeChange}
        />

        {/* Status Filter */}
        <div>
          <label style={labelStyle}>✅ Status</label>
          <select
            value={doneFilter}
            onChange={(e) => onDoneFilterChange(e.target.value)}
            style={selectStyle}
          >
            <option value="All">All</option>
            <option value="Not Done">Not Done</option>
            <option value="Done">Done</option>
          </select>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Count badge + Delete button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
            {totalCount} post{totalCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setShowDeleteModal(true)}
            title="Bulk delete posts by date range"
            style={{
              padding: '6px 12px', borderRadius: '8px',
              border: '1px solid #7f1d1d', backgroundColor: '#1a0a0a',
              color: '#ef4444', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#7f1d1d'; (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1a0a0a'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          >
            🗑️ Delete by Date
          </button>
        </div>
      </div>

      {/* Bulk Delete Modal */}
      {showDeleteModal && (
        <BulkDeleteModal
          pageId={pageId}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={(count) => {
            onPostsDeleted?.();
            alert(`✅ Deleted ${count} post${count !== 1 ? 's' : ''} successfully.`);
          }}
        />
      )}
    </>
  );
}
