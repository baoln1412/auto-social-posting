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

const DEFAULT_TIER1_TEMPLATE = `Australia, Australian, Aussie, Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra, Gold Coast, Hobart, Darwin, Newcastle, Wollongong, Geelong, Townsville, Cairns, Toowoomba, Ballarat, Bendigo, Albury, Wodonga, Launceston, Sunshine Coast, Central Coast, NSW, New South Wales, VIC, Victoria, QLD, Queensland, WA, Western Australia, SA, South Australia, TAS, Tasmania, ACT, Australian Capital Territory, NT, Northern Territory, Parramatta, Blacktown, Strathfield, Bankstown, Marrickville, Cabramatta, Footscray, Sunshine, Springvale, Clayton, St Albans, Richmond, Box Hill, Glen Waverley, Carlton, Brunswick, Bundoora, Randwick, Kensington, Zetland, Mascot, Chatswood, Burwood, Southbank, Docklands, Ultimo, Haymarket, Darling Harbour, North Adelaide, Mawson Lakes, Joondalup, Curtin, Griffith, Broadbeach, Surfers Paradise, Burleigh Heads, Moreton Bay, Logan, Ipswich, Byron Bay, Port Macquarie, Coffs Harbour, Wagga Wagga, Mildura, Shepparton, Gippsland, Mornington Peninsula, Fremantle, Mandurah, Bunbury, Kalgoorlie, Palmerston, Alice Springs, Greater Sydney, Greater Melbourne, South East Queensland, SEQ, Regional NSW, Regional Victoria, Regional WA, Regional QLD, Regional SA, Regional Tasmania, Subclass 500, Subclass 485, Subclass 189, Subclass 190, Subclass 491, Subclass 482, Subclass 186, Subclass 191, Subclass 600, Genuine Student Test, GST visa, Migration Strategy 2026, Visa Cap, National Planning Level, NPL, Visa hopping, Section 48 bar, Ministerial Direction 111, Ministerial Direction 115, SkillSelect, VETASSESS, TRA assessment, AACA, ACS Australia, NAATI, CCL exam, PYP, Professional Year, CRICOS, PR pathway, Permanent Residency Australia, Visa processing times, Home Affairs, Bridging Visa A, Bridging Visa B, BVA, BVB`;

const DEFAULT_TIER2_TEMPLATE = `No further stay condition, 8503 condition, 8580 condition, Cost of living Australia, RBA interest rate, HECS-HELP, Indexation, TFN, Tax File Number, ABN, Australian Business Number, Superannuation, Super guarantee, ATO, Australian Taxation Office, Tax Return Australia, Medicare Levy, OSHC, Overseas Student Health Cover, Allianz Care, Bupa Global, Medibank, Rent bidding, Bond refund, NCAT, VCAT, QCAT, Centrelink, Youth Allowance, Rent Assistance, MyGov, Opal card, Myki, Translink, SmartRider, Student discount Australia, Coles vs Woolworths, Grocery price inquiry, Fair Work Ombudsman, Fair Work Commission, National Minimum Wage, Casual loading, Casual conversion, Work rights 24 hours, Fortnightly work limit, TSMIT, Skilled Occupation List, SOL, Jobs and Skills Australia, Aged Care Labor Agreement, Healthcare shortage Australia, Graduate Program 2026, Internship Australia, Work from home Australia, WFH, Salary packaging, Pay slip requirements Australia, Unfair dismissal, Workplace bullying Australia, Puffing Billy, Vivid Sydney, Moomba, O-Week, Orientation Week, Rental inspection, Sharehouse, Flatmates.com.au, Gumtree, Facebook Marketplace scam, Scams Australia, 18+ Card, Proof of Age card, Digital ID Australia, 000 emergency, Lifeline Australia, Beyond Blue, Headspace, Bulk billing, Scarcity of rentals, Ghosting recruiters, Australian slang, Tall poppy syndrome, Work-life balance Australia`;

function parseKeywords(text: string): string[] {
  return text
    .split(',')
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0);
}

function formatKeywords(keywords: string[]): string {
  return keywords.join(', ');
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
    else setTier2Text(DEFAULT_TIER2_TEMPLATE);
  };

  const handleAiSuggest = useCallback(async () => {
    setAiSuggesting(true);
    try {
      const res = await fetch('/api/ai/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: `Current Tier 1 keywords: ${tier1Text}\n\nCurrent Tier 2 keywords: ${tier2Text}`,
          instruction: 'Suggest 20-30 additional Australian-related keywords that would be useful for filtering Australian news for Vietnamese students and migrants. Include: new visa subclasses, popular suburbs, university names, government programs, cultural events, and trending topics. Return ONLY a comma-separated list of new keywords NOT already in the lists above. No explanations.',
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

  return (
    <Card className="card-warm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>🔑 Keyword Content Filter</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            {tier1Count + tier2Count} keywords
          </span>
          <span className="text-muted-foreground text-xs">
            {isOpen ? '▲ Collapse' : '▼ Expand'}
          </span>
        </div>
      </button>

      {isOpen && (
        <CardContent className="pt-0 space-y-4">
          <p className="text-xs text-muted-foreground">
            Articles are scored by keyword matches. <strong className="text-primary">Tier 1</strong> keywords (cities, visa types) give <strong>+3 points</strong>, <strong className="text-muted-foreground">Tier 2</strong> keywords (broad terms) give <strong>+1 point</strong>. Articles need ≥ {minScore} point(s) to pass.
          </p>

          {/* Tier 1 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                🏆 Tier 1 — High Weight (+3 pts) · {tier1Count} keywords
              </label>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6"
                onClick={() => handleLoadTemplate('tier1')}
              >
                📋 Load Template
              </Button>
            </div>
            <Textarea
              value={tier1Text}
              onChange={(e) => setTier1Text(e.target.value)}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-y bg-muted/30 border-border"
              placeholder="Enter keywords separated by commas: Sydney, Melbourne, Subclass 500, ..."
            />
          </div>

          {/* Tier 2 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                📌 Tier 2 — Broad Terms (+1 pt) · {tier2Count} keywords
              </label>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-6"
                onClick={() => handleLoadTemplate('tier2')}
              >
                📋 Load Template
              </Button>
            </div>
            <Textarea
              value={tier2Text}
              onChange={(e) => setTier2Text(e.target.value)}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-y bg-muted/30 border-border"
              placeholder="Enter keywords separated by commas: Cost of living, OSHC, Centrelink, ..."
            />
          </div>

          {/* Min score */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-foreground whitespace-nowrap">
              Min Score to Pass:
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

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Keywords'}
            </Button>
            <Button
              onClick={handleAiSuggest}
              disabled={aiSuggesting}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              {aiSuggesting ? '⏳ Suggesting...' : '🤖 AI Suggest More Keywords'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
