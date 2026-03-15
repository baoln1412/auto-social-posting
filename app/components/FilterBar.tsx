'use client';

import DateRangePicker from './DateRangePicker';

interface FilterBarProps {
  states: string[];
  sources: string[];
  selectedState: string;
  selectedSource: string;
  fromDate: string;
  toDate: string;
  onStateChange: (s: string) => void;
  onSourceChange: (s: string) => void;
  onDateRangeChange: (from: string, to: string) => void;
  totalCount: number;
}

export default function FilterBar({
  states,
  sources,
  selectedState,
  selectedSource,
  fromDate,
  toDate,
  onStateChange,
  onSourceChange,
  onDateRangeChange,
  totalCount,
}: FilterBarProps) {
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
      {/* State Filter */}
      <div>
        <label style={labelStyle}>📍 State</label>
        <select
          value={selectedState}
          onChange={(e) => onStateChange(e.target.value)}
          style={selectStyle}
        >
          <option value="All">All States</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

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

      {/* Count badge */}
      <div
        style={{
          marginLeft: 'auto',
          fontSize: '13px',
          color: '#64748b',
          fontWeight: 500,
          alignSelf: 'flex-end',
          padding: '8px 0',
        }}
      >
        {totalCount} post{totalCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
