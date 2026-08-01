'use client';

import { useState } from 'react';
import SystemPromptConfig from '../SystemPromptConfig';
import MarketContextConfig, { MarketContext } from '../MarketContextConfig';
import SourceManager from '../SourceManager';
import BackfillButton from '../BackfillButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TOPICS } from '../../lib/topics';

/** Per-market checkbox grid choosing which of the 12 topics this market generates. */
function TopicSelector({
  enabledTopics,
  onSave,
}: {
  enabledTopics: string[];
  onSave: (topics: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(enabledTopics);
  const [saving, setSaving] = useState(false);
  const dirty =
    selected.length !== enabledTopics.length ||
    selected.some((t) => !enabledTopics.includes(t));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Card className="card-warm">
      <CardHeader>
        <CardTitle className="text-base">🏷️ Topics for this market</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Only these topics are classified and generated for this market. Turning one off
          stops new posts of that topic here (existing posts are unaffected).
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TOPICS.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={() => toggle(t.id)}
              />
              <span>{t.vi}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!dirty || saving || selected.length === 0}
            onClick={async () => { setSaving(true); try { await onSave(selected); } finally { setSaving(false); } }}>
            {saving ? 'Saving…' : 'Save topics'}
          </Button>
          <button type="button" className="text-xs text-muted-foreground underline"
            onClick={() => setSelected(TOPICS.map((t) => t.id))}>
            Select all
          </button>
          {selected.length === 0 && (
            <span className="text-xs text-red-600">Pick at least one topic.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SettingsViewProps {
  pageId: string;
  pageName: string;
  countryCode: string;
  countryName: string;
  systemPrompt: string;
  userPrompt: string;
  platformPrompts: Record<string, string>;
  marketContext: MarketContext;
  enabledTopics: string[];
  onSavePrompt: (prompt: string, userPrompt: string, platformPrompts: Record<string, string>) => Promise<void>;
  onSaveContext: (context: MarketContext) => Promise<void>;
  onSaveTopics: (topics: string[]) => Promise<void>;
  onDeletePage: () => void;
  onRenamePage: () => void;
}

export default function SettingsView({
  pageId,
  pageName,
  countryCode,
  countryName,
  systemPrompt,
  userPrompt,
  platformPrompts,
  marketContext,
  enabledTopics,
  onSavePrompt,
  onSaveContext,
  onSaveTopics,
  onDeletePage,
  onRenamePage,
}: SettingsViewProps) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-xl font-bold text-foreground">⚙️ Market Settings</h2>

      {/* Market info */}
      <Card className="card-warm">
        <CardHeader>
          <CardTitle className="text-base">🌍 Market</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {countryCode ? `${countryCode} · ` : ''}{countryName || 'No country set'}
              </p>
              <p className="text-lg font-semibold text-foreground">{pageName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRenamePage}>
                ✏️ Rename
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200" onClick={onDeletePage}>
                🗑️ Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-market topic selection */}
      <TopicSelector enabledTopics={enabledTopics} onSave={onSaveTopics} />

      {/* Market content context (glossary / wording / style / language) */}
      <MarketContextConfig context={marketContext} onSave={onSaveContext} />

      {/* System Prompt (with platform tabs) */}
      <SystemPromptConfig
        prompt={systemPrompt}
        userPrompt={userPrompt}
        platformPrompts={platformPrompts}
        onSave={onSavePrompt}
      />

      {/* Immigration filtering + dedup are done by the LLM at the silver stage —
          no keyword config here. */}

      {/* ── Maintenance ────────────────────────────────────────── */}
      <Card className="card-warm">
        <CardHeader>
          <CardTitle className="text-base">🔧 Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-0.5">Backfill enrichment data</p>
            <p className="text-xs text-muted-foreground mb-3">
              Re-process existing posts to fill in fields that were added or changed
              after the posts were first generated. Safe to run at any time.
            </p>
            <BackfillButton pageId={pageId} />
          </div>
        </CardContent>
      </Card>

      {/* Feed Sources */}
      <SourceManager pageId={pageId} />
    </div>
  );
}
