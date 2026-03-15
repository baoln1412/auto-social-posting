'use client';

import { useState, useRef, useEffect } from 'react';

interface DateRangePickerProps {
  fromDate: string; // ISO date string YYYY-MM-DD
  toDate: string;
  onChange: (from: string, to: string) => void;
}

const PRESETS = [
  { label: 'Today', getDates: () => {
    const t = fmt(new Date());
    return [t, t];
  }},
  { label: 'Yesterday', getDates: () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const t = fmt(d);
    return [t, t];
  }},
  { label: 'Last 7 days', getDates: () => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 7);
    return [fmt(from), fmt(to)];
  }},
  { label: 'Last 7 days & today', getDates: () => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 6);
    return [fmt(from), fmt(to)];
  }},
  { label: 'Last week', getDates: () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - dayOfWeek);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    return [fmt(startOfLastWeek), fmt(endOfLastWeek)];
  }},
  { label: 'Last 30 days', getDates: () => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - 30);
    return [fmt(from), fmt(to)];
  }},
  { label: 'This month', getDates: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return [fmt(from), fmt(now)];
  }},
  { label: 'Last month', getDates: () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return [fmt(from), fmt(to)];
  }},
];

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(s: string): string {
  if (!s) return '';
  const d = parseDate(s);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

// ── Calendar Month Grid ──────────────────────────────────────────────────
function CalendarMonth({
  year,
  month,
  fromDate,
  toDate,
  hoverDate,
  onDateClick,
  onDateHover,
}: {
  year: number;
  month: number; // 0-indexed
  fromDate: string;
  toDate: string;
  hoverDate: string | null;
  onDateClick: (d: string) => void;
  onDateHover: (d: string | null) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0

  const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const today = fmt(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const effectiveTo = toDate || hoverDate || fromDate;

  return (
    <div style={{ minWidth: '240px' }}>
      <div style={{ textAlign: 'center', fontWeight: 600, fontSize: '14px', color: '#e2e8f0', marginBottom: '8px' }}>
        {monthName}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {dayHeaders.map((h, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', padding: '4px 0', fontWeight: 600 }}>
            {h}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isFrom = dateStr === fromDate;
          const isTo = dateStr === effectiveTo;
          const isInRange = fromDate && effectiveTo && dateStr >= fromDate && dateStr <= effectiveTo;
          const isToday = dateStr === today;
          const isPast = dateStr > today;

          let bg = 'transparent';
          let color = isPast ? '#475569' : '#e2e8f0';
          let borderRadius = '4px';
          let border = 'none';

          if (isFrom || isTo) {
            bg = '#6366f1';
            color = '#ffffff';
            borderRadius = '50%';
          } else if (isInRange) {
            bg = 'rgba(99, 102, 241, 0.2)';
            color = '#c7d2fe';
          }

          if (isToday && !isFrom && !isTo) {
            border = '1px solid #6366f1';
            borderRadius = '50%';
          }

          return (
            <div
              key={dateStr}
              onClick={() => !isPast && onDateClick(dateStr)}
              onMouseEnter={() => !isPast && onDateHover(dateStr)}
              onMouseLeave={() => onDateHover(null)}
              style={{
                textAlign: 'center',
                fontSize: '13px',
                padding: '6px 2px',
                cursor: isPast ? 'default' : 'pointer',
                backgroundColor: bg,
                color,
                borderRadius,
                border,
                transition: 'background-color 0.15s',
                userSelect: 'none' as const,
              }}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main DateRangePicker ─────────────────────────────────────────────────
export default function DateRangePicker({ fromDate, toDate, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(fromDate);
  const [tempTo, setTempTo] = useState(toDate);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>('Last 7 days');
  const ref = useRef<HTMLDivElement>(null);

  // Calendar months to display
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  // Second month (next month from viewMonth)
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleDateClick(d: string) {
    if (!selectingEnd || d < tempFrom) {
      setTempFrom(d);
      setTempTo('');
      setSelectingEnd(true);
      setActivePreset(null);
    } else {
      setTempTo(d);
      setSelectingEnd(false);
      setActivePreset(null);
    }
  }

  function handlePreset(preset: typeof PRESETS[0]) {
    const [f, t] = preset.getDates();
    setTempFrom(f);
    setTempTo(t);
    setSelectingEnd(false);
    setActivePreset(preset.label);
  }

  function handleApply() {
    const finalTo = tempTo || tempFrom;
    onChange(tempFrom, finalTo);
    setIsOpen(false);
  }

  function handleCancel() {
    setTempFrom(fromDate);
    setTempTo(toDate);
    setIsOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }

  function nextMonthNav() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  // Display label
  const displayLabel = fromDate && toDate
    ? `${formatDisplay(fromDate)} – ${formatDisplay(toDate)}`
    : 'Select date range';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block' }}>
        📅 Date Range
      </label>
      <button
        onClick={() => { setTempFrom(fromDate); setTempTo(toDate); setIsOpen(!isOpen); }}
        style={{
          backgroundColor: '#1a1f2e',
          color: '#e2e8f0',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          minWidth: '200px',
          textAlign: 'left',
        }}
      >
        {displayLabel}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            zIndex: 50,
            backgroundColor: '#111827',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* Preset sidebar */}
          <div style={{ borderRight: '1px solid #1e293b', padding: '8px 0', minWidth: '150px' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 16px',
                  fontSize: '13px',
                  color: activePreset === p.label ? '#818cf8' : '#94a3b8',
                  backgroundColor: activePreset === p.label ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  borderLeft: activePreset === p.label ? '3px solid #6366f1' : '3px solid transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: activePreset === p.label ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar area */}
          <div style={{ padding: '16px' }}>
            {/* From / To inputs */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>From</label>
                <input
                  type="text"
                  readOnly
                  value={formatDisplay(tempFrom)}
                  style={{
                    backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
                    borderRadius: '6px', padding: '6px 10px', fontSize: '13px', width: '130px',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>To</label>
                <input
                  type="text"
                  readOnly
                  value={formatDisplay(tempTo || tempFrom)}
                  style={{
                    backgroundColor: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
                    borderRadius: '6px', padding: '6px 10px', fontSize: '13px', width: '130px',
                  }}
                />
              </div>
            </div>

            {/* Navigation + calendars */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '4px' }}>
                  <button onClick={prevMonth} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', padding: '4px 8px' }}>‹</button>
                </div>
                <CalendarMonth
                  year={viewYear} month={viewMonth}
                  fromDate={tempFrom} toDate={tempTo}
                  hoverDate={selectingEnd ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                  <button onClick={nextMonthNav} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px', padding: '4px 8px' }}>›</button>
                </div>
                <CalendarMonth
                  year={nextYear} month={nextMonth}
                  fromDate={tempFrom} toDate={tempTo}
                  hoverDate={selectingEnd ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                />
              </div>
            </div>

            {/* Cancel / Apply */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={handleCancel}
                style={{
                  padding: '6px 16px', fontSize: '13px', borderRadius: '6px',
                  backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                style={{
                  padding: '6px 16px', fontSize: '13px', borderRadius: '6px',
                  backgroundColor: '#6366f1', color: '#ffffff', border: 'none',
                  cursor: 'pointer', fontWeight: 600,
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
