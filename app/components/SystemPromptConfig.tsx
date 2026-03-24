'use client';

import { useState } from 'react';

interface SystemPromptConfigProps {
  prompt: string;
  onSave: (prompt: string) => Promise<void>;
}

export default function SystemPromptConfig({ prompt, onSave }: SystemPromptConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState(prompt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync when prompt changes externally (e.g. tab switch)
  if (!isOpen && value !== prompt) {
    setValue(prompt);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = value !== prompt;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: '#0d1117', border: '1px solid #1e293b' }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
        style={{ color: '#e2e8f0' }}
      >
        <span>⚙️ Content Generation Prompt</span>
        <span style={{ color: '#64748b', fontSize: '12px' }}>
          {isOpen ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg px-3 py-3 text-sm font-mono resize-y"
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              minHeight: '200px',
              maxHeight: '500px',
            }}
            placeholder="Enter your system prompt for AI content generation..."
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="px-4 py-2 rounded-lg text-xs font-bold transition-opacity"
              style={{
                backgroundColor: hasChanges ? '#238636' : '#21262d',
                color: hasChanges ? '#fff' : '#8b949e',
                opacity: saving ? 0.6 : 1,
                cursor: saving || !hasChanges ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Prompt'}
            </button>
            {hasChanges && (
              <span style={{ color: '#f0e523', fontSize: '12px' }}>
                Unsaved changes
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
