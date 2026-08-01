'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface MarketContext {
  language: string;
  glossary: Record<string, string>;
  wordingRules: string;
  writingStyle: string;
}

interface MarketContextConfigProps {
  context: MarketContext;
  onSave: (context: MarketContext) => Promise<void>;
}

type GlossaryRow = { term: string; preferred: string };

function toRows(glossary: Record<string, string>): GlossaryRow[] {
  const rows = Object.entries(glossary ?? {}).map(([term, preferred]) => ({ term, preferred }));
  return rows.length ? rows : [{ term: '', preferred: '' }];
}

function toGlossary(rows: GlossaryRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const t = r.term.trim();
    if (t) out[t] = r.preferred.trim();
  }
  return out;
}

/**
 * Per-market generation context: the language, a glossary of preferred term
 * mappings, wording rules, and writing-style guidance. This is what the
 * content-generation step (post-writer skill) consumes to localise output.
 */
export default function MarketContextConfig({ context, onSave }: MarketContextConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState(context.language || 'vi');
  const [rows, setRows] = useState<GlossaryRow[]>(toRows(context.glossary));
  const [wordingRules, setWordingRules] = useState(context.wordingRules || '');
  const [writingStyle, setWritingStyle] = useState(context.writingStyle || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLanguage(context.language || 'en'); }, [context.language]);
  useEffect(() => { setRows(toRows(context.glossary)); }, [context.glossary]);
  useEffect(() => { setWordingRules(context.wordingRules || ''); }, [context.wordingRules]);
  useEffect(() => { setWritingStyle(context.writingStyle || ''); }, [context.writingStyle]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ language: language.trim() || 'vi', glossary: toGlossary(rows), wordingRules, writingStyle });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-warm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>🌐 Market Content Context</span>
        <span className="text-muted-foreground text-xs">{isOpen ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {isOpen && (
        <CardContent className="pt-0 space-y-5">
          {/* Language */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output Language</label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, vi, es"
              className="w-32 text-sm px-3 py-2 rounded-lg border border-border bg-card text-foreground"
            />
            <p className="text-[11px] text-muted-foreground">Language code generated content should be written in.</p>
          </div>

          {/* Glossary */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Glossary (term → preferred wording)</label>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={row.term}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, term: e.target.value } : r)))}
                    placeholder="source term"
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-foreground"
                  />
                  <span className="text-muted-foreground">→</span>
                  <input
                    type="text"
                    value={row.preferred}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, preferred: e.target.value } : r)))}
                    placeholder="preferred term"
                    className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-card text-foreground"
                  />
                  <button
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-red-600 px-1"
                    title="Remove"
                  >✕</button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setRows((prev) => [...prev, { term: '', preferred: '' }])}
              className="text-xs text-primary underline hover:no-underline"
            >+ Add term</button>
          </div>

          {/* Wording rules */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wording Rules</label>
            <Textarea
              value={wordingRules}
              onChange={(e) => setWordingRules(e.target.value)}
              className="min-h-[100px] text-sm resize-y bg-muted/30 border-border"
              placeholder="e.g. Use formal register. Avoid slang. Always spell out visa subclass numbers."
            />
          </div>

          {/* Writing style */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Writing Style</label>
            <Textarea
              value={writingStyle}
              onChange={(e) => setWritingStyle(e.target.value)}
              className="min-h-[100px] text-sm resize-y bg-muted/30 border-border"
              placeholder="e.g. Empathetic, clear, news-explainer tone. Short paragraphs. Lead with the practical impact for immigrants."
            />
          </div>

          <Button onClick={handleSave} disabled={saving} size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Market Context'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
