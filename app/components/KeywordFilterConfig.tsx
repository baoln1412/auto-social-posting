'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { KeywordConfig } from '../types';

interface KeywordFilterConfigProps {
  config: KeywordConfig;
  onSave: (config: KeywordConfig) => Promise<void>;
}

// ── Sports page templates ────────────────────────────────────────────
const DEFAULT_TIER1_TEMPLATE = `Premier League, Champions League, Manchester United, Real Madrid, Barcelona, Arsenal, Chelsea, Liverpool, Bayern Munich, PSG, Juventus, AC Milan, Inter Milan, World Cup, Euro, Ballon d'Or, Messi, Ronaldo, Mbappe, Haaland, Bellingham, Vinicius, goal, match, final, tournament, injury, transfer, signing, contract, manager, coach, sack, trophy, champion`;

const DEFAULT_TIER2_TEMPLATE = `stadium, fans, crowd, referee, VAR, offside, penalty, red card, yellow card, free kick, corner, hat trick, clean sheet, substitution, extra time, penalties, shootout, friendly, pre-season, relegation, promotion, derby, El Clasico, starting lineup, bench, tactics, formation, press conference`;

function parseKeywords(text: string): string[] {
  return text
    .split(',')
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0);
}

function formatKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

function KeywordBadge({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
      {count} {label}
    </span>
  );
}

export default function KeywordFilterConfig({ config, onSave }: KeywordFilterConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tier1Text, setTier1Text] = useState(formatKeywords(config.tier1));
  const [tier2Text, setTier2Text] = useState(formatKeywords(config.tier2));
  const [minScore, setMinScore] = useState(config.minScore);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        tier1: parseKeywords(tier1Text),
        tier2: parseKeywords(tier2Text),
        minScore,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadTemplate = (tier: 'tier1' | 'tier2') => {
    if (tier === 'tier1') setTier1Text(DEFAULT_TIER1_TEMPLATE);
    else if (tier === 'tier2') setTier2Text(DEFAULT_TIER2_TEMPLATE);
  };

  const handleAiSuggest = useCallback(async () => {
    setAiSuggesting(true);
    try {
      const res = await fetch('/api/ai/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: `Current Tier 1 keywords: ${tier1Text}\n\nCurrent Tier 2 keywords: ${tier2Text}`,
          instruction: 'Suggest 20-30 additional Sports/Football related keywords that would be useful for filtering sports news. Return ONLY a comma-separated list of new keywords NOT already in the lists above. No explanations.',
        }),
      });
      const data = await res.json();
      if (data.success && data.refined) {
        const newKeywords = data.refined.trim();
        setTier2Text((prev) => (prev ? `${prev}, ${newKeywords}` : newKeywords));
      }
    } catch (err) {
      console.error('AI suggestion failed:', err);
    } finally {
      setAiSuggesting(false);
    }
  }, [tier1Text, tier2Text]);

  const tier1Count = parseKeywords(tier1Text).length;
  const tier2Count = parseKeywords(tier2Text).length;
  const totalKeywords = tier1Count + tier2Count;

  return (
    <Card className="card-warm">
      {/* ── Header / toggle ─────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>🔑 Keyword Content Filter</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {totalKeywords} keywords
          </span>
          <span className="text-muted-foreground text-xs">
            {isOpen ? '▲ Collapse' : '▼ Expand'}
          </span>
        </div>
      </button>

      {/* ── Collapsed summary ───────────────────────────────────────── */}
      {!isOpen && totalKeywords > 0 && (
        <div className="px-5 pb-4 flex flex-wrap gap-2">
          {tier1Count > 0 && <KeywordBadge count={tier1Count} label="Tier 1 (required)" />}
          {tier2Count > 0 && <KeywordBadge count={tier2Count} label="Tier 2 (broad)" />}
          <span className="text-xs text-muted-foreground italic">
            Min score: {minScore} pt{minScore !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {isOpen && (
        <CardContent className="pt-0 space-y-5">
          <p className="text-xs text-muted-foreground">
            Articles are scored by keyword matches. <strong className="text-primary">Tier 1</strong> keywords give <strong>+3 points</strong>,{' '}
            <strong className="text-muted-foreground">Tier 2</strong> give <strong>+1 point</strong>. Articles need ≥ {minScore} point(s) to pass the pipeline filter.
          </p>

          {/* ── Tier 1 ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                🏆 Tier 1 — High Weight (+3 pts) · {tier1Count} keywords
              </label>
              <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => handleLoadTemplate('tier1')}>
                📋 Load Sports Template
              </Button>
            </div>
            <Textarea
              value={tier1Text}
              onChange={(e) => setTier1Text(e.target.value)}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-y bg-muted/30 border-border"
              placeholder="Enter keywords separated by commas: Premier League, Goal, ..."
            />
          </div>

          {/* ── Tier 2 ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                📌 Tier 2 — Broad Terms (+1 pt) · {tier2Count} keywords
              </label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => handleLoadTemplate('tier2')}>
                  📋 Load Sports Template
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={handleAiSuggest} disabled={aiSuggesting}>
                  {aiSuggesting ? '⏳...' : '🤖 AI Suggest'}
                </Button>
              </div>
            </div>
            <Textarea
              value={tier2Text}
              onChange={(e) => setTier2Text(e.target.value)}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-y bg-muted/30 border-border"
              placeholder="Enter keywords separated by commas: Stadium, VAR, Offside, ..."
            />
          </div>

          {/* ── Min score ──────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-foreground whitespace-nowrap">
              Min Score to Pass Pipeline:
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold text-primary w-8 text-center">{minScore}</span>
          </div>

          {/* ── Save actions ──────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Keywords'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
