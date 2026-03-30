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

// ── Australian page templates ────────────────────────────────────────────
const DEFAULT_TIER1_TEMPLATE = `Australia, Australian, Aussie, Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra, Gold Coast, Hobart, Darwin, Newcastle, Wollongong, Geelong, Townsville, Cairns, Toowoomba, Ballarat, Bendigo, Albury, Wodonga, Launceston, Sunshine Coast, Central Coast, NSW, New South Wales, VIC, Victoria, QLD, Queensland, WA, Western Australia, SA, South Australia, TAS, Tasmania, ACT, Australian Capital Territory, NT, Northern Territory, Parramatta, Blacktown, Strathfield, Bankstown, Marrickville, Cabramatta, Footscray, Sunshine, Springvale, Clayton, St Albans, Richmond, Box Hill, Glen Waverley, Carlton, Brunswick, Bundoora, Randwick, Kensington, Zetland, Mascot, Chatswood, Burwood, Southbank, Docklands, Ultimo, Haymarket, Darling Harbour, North Adelaide, Mawson Lakes, Joondalup, Curtin, Griffith, Broadbeach, Surfers Paradise, Burleigh Heads, Moreton Bay, Logan, Ipswich, Byron Bay, Port Macquarie, Coffs Harbour, Wagga Wagga, Mildura, Shepparton, Gippsland, Mornington Peninsula, Fremantle, Mandurah, Bunbury, Kalgoorlie, Palmerston, Alice Springs, Greater Sydney, Greater Melbourne, South East Queensland, SEQ, Regional NSW, Regional Victoria, Regional WA, Regional QLD, Regional SA, Regional Tasmania, Subclass 500, Subclass 485, Subclass 189, Subclass 190, Subclass 491, Subclass 482, Subclass 186, Subclass 191, Subclass 600, Genuine Student Test, GST visa, Migration Strategy 2026, Visa Cap, National Planning Level, NPL, Visa hopping, Section 48 bar, Ministerial Direction 111, Ministerial Direction 115, SkillSelect, VETASSESS, TRA assessment, AACA, ACS Australia, NAATI, CCL exam, PYP, Professional Year, CRICOS, PR pathway, Permanent Residency Australia, Visa processing times, Home Affairs, Bridging Visa A, Bridging Visa B, BVA, BVB`;

const DEFAULT_TIER2_TEMPLATE = `No further stay condition, 8503 condition, 8580 condition, Cost of living Australia, RBA interest rate, HECS-HELP, Indexation, TFN, Tax File Number, ABN, Australian Business Number, Superannuation, Super guarantee, ATO, Australian Taxation Office, Tax Return Australia, Medicare Levy, OSHC, Overseas Student Health Cover, Allianz Care, Bupa Global, Medibank, Rent bidding, Bond refund, NCAT, VCAT, QCAT, Centrelink, Youth Allowance, Rent Assistance, MyGov, Opal card, Myki, Translink, SmartRider, Student discount Australia, Coles vs Woolworths, Grocery price inquiry, Fair Work Ombudsman, Fair Work Commission, National Minimum Wage, Casual loading, Casual conversion, Work rights 24 hours, Fortnightly work limit, TSMIT, Skilled Occupation List, SOL, Jobs and Skills Australia, Aged Care Labor Agreement, Healthcare shortage Australia, Graduate Program 2026, Internship Australia, Work from home Australia, WFH, Salary packaging, Pay slip requirements Australia, Unfair dismissal, Workplace bullying Australia, Puffing Billy, Vivid Sydney, Moomba, O-Week, Orientation Week, Rental inspection, Sharehouse, Flatmates.com.au, Gumtree, Facebook Marketplace scam, Scams Australia, 18+ Card, Proof of Age card, Digital ID Australia, 000 emergency, Lifeline Australia, Beyond Blue, Headspace, Bulk billing, Scarcity of rentals, Ghosting recruiters, Australian slang, Tall poppy syndrome, Work-life balance Australia`;

// ── Crime page templates (from the pasted code) ──────────────────────────
const CRIME_KEYWORDS_TEMPLATE = `murder, kill, killed, killing, dead, death, homicide, manslaughter, arrest, arrested, charged, suspect, shooting, shot, gunfire, stabbing, stabbed, assault, robbery, kidnap, kidnapped, abduct, missing, court, trial, verdict, sentenced, convicted, indicted, arson, fentanyl, overdose, carjacking, burglary, rape, crime, criminal, felony, felon, weapon, firearm, victim, prosecutor, detective, investigation, body found, crime scene, police, fatal`;

const EXCLUDE_KEYWORDS_TEMPLATE = `ukraine, russia, gaza, israel, hamas, palestine, nato, syria, iran, iraq, afghanistan, china, north korea, taiwan, myanmar, yemen, sudan, congo, ethiopia, brexit, european union, g7, g20, united nations, missile strike, airstrike, ceasefire, invasion, troops deployed`;

const POLITICAL_KEYWORDS_TEMPLATE = `election, elections, ballot, polling, voters, voting rights, democrat, republican, gop, liberal, conservative, congress, senate, senator, congressman, congresswoman, house of representatives, speaker of the house, white house, oval office, executive order, president biden, president trump, vice president, cabinet, secretary of state, attorney general, legislation, bill passes, bill signed, filibuster, immigration policy, border policy, immigration reform, supreme court ruling, constitutional, amendment, political, bipartisan, partisan, campaign, gubernatorial, governor signs, governor vetoes, lobby, lobbyist, pac, super pac, political action, impeach, impeachment, censure, state of the union, inaugural, inauguration, tariff, trade war, sanctions, federal budget, debt ceiling, government shutdown`;

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

  const [useCrimeFilter, setUseCrimeFilter] = useState(config.useCrimeFilter ?? false);
  const [crimeText, setCrimeText] = useState(formatKeywords(config.crimeKeywords ?? []));
  const [excludeText, setExcludeText] = useState(formatKeywords(config.excludeKeywords ?? []));
  const [politicalText, setPoliticalText] = useState(formatKeywords(config.politicalKeywords ?? []));

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
        useCrimeFilter,
        crimeKeywords: parseKeywords(crimeText),
        excludeKeywords: parseKeywords(excludeText),
        politicalKeywords: parseKeywords(politicalText),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadTemplate = (tier: 'tier1' | 'tier2' | 'crime' | 'exclude' | 'political') => {
    if (tier === 'tier1') setTier1Text(DEFAULT_TIER1_TEMPLATE);
    else if (tier === 'tier2') setTier2Text(DEFAULT_TIER2_TEMPLATE);
    else if (tier === 'crime') setCrimeText(CRIME_KEYWORDS_TEMPLATE);
    else if (tier === 'exclude') setExcludeText(EXCLUDE_KEYWORDS_TEMPLATE);
    else if (tier === 'political') setPoliticalText(POLITICAL_KEYWORDS_TEMPLATE);
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
  const crimeCount = parseKeywords(crimeText).length;
  const excludeCount = parseKeywords(excludeText).length;
  const politicalCount = parseKeywords(politicalText).length;
  const totalKeywords = tier1Count + tier2Count + (useCrimeFilter ? crimeCount + excludeCount + politicalCount : 0);

  return (
    <Card className="card-warm">
      {/* ── Header / toggle ─────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>🔑 Keyword Content Filter</span>
        <div className="flex items-center gap-3">
          {useCrimeFilter && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              🚨 Crime Filter ON
            </span>
          )}
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
          {useCrimeFilter && crimeCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-mono">
              {crimeCount} crime
            </span>
          )}
          {useCrimeFilter && excludeCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-mono">
              {excludeCount} exclude
            </span>
          )}
          {useCrimeFilter && politicalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-mono">
              {politicalCount} political ban
            </span>
          )}
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
            {useCrimeFilter && (
              <> The <strong className="text-red-600">Crime Filter</strong> runs earlier at the <em>fetch stage</em> — articles must match crime keywords (or come from a crime-specific feed) and must not match exclude/political lists.</>
            )}
          </p>

          {/* ── Crime pre-filter toggle ──────────────────────────────── */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <input
              id="useCrimeFilter"
              type="checkbox"
              checked={useCrimeFilter}
              onChange={(e) => setUseCrimeFilter(e.target.checked)}
              className="h-4 w-4 accent-red-600 cursor-pointer"
            />
            <label htmlFor="useCrimeFilter" className="text-sm font-semibold cursor-pointer select-none">
              🚨 Enable Crime Pre-Filter
            </label>
            <span className="text-xs text-muted-foreground">
              (hard-filters articles at RSS fetch time — before the pipeline keyword scorer)
            </span>
          </div>

          {/* ── Tier 1 ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary uppercase tracking-wider">
                🏆 Tier 1 — High Weight (+3 pts) · {tier1Count} keywords
              </label>
              <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => handleLoadTemplate('tier1')}>
                📋 Load AU Template
              </Button>
            </div>
            <Textarea
              value={tier1Text}
              onChange={(e) => setTier1Text(e.target.value)}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-y bg-muted/30 border-border"
              placeholder="Enter keywords separated by commas: Sydney, Melbourne, Subclass 500, ..."
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
                  📋 Load AU Template
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
              placeholder="Enter keywords separated by commas: Cost of living, OSHC, Centrelink, ..."
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

          {/* ── Crime keywords (only when crime filter is on) ───────── */}
          {useCrimeFilter && (
            <>
              <div className="border-t border-dashed border-red-200 pt-4 space-y-4">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                  🚨 Crime Pre-Filter Keywords (applied at RSS fetch stage)
                </p>

                {/* Crime must-include */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                      ✅ Crime Must-Match · {crimeCount} keywords
                    </label>
                    <Button variant="outline" size="sm" className="text-xs h-6 border-red-200 text-red-600" onClick={() => handleLoadTemplate('crime')}>
                      📋 Load Crime Template
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Article must contain at least one of these to pass (unless the feed is marked crime-specific).
                  </p>
                  <Textarea
                    value={crimeText}
                    onChange={(e) => setCrimeText(e.target.value)}
                    className="min-h-[100px] max-h-[160px] font-mono text-xs resize-y bg-red-50/30 border-red-200"
                    placeholder="murder, arrest, shooting, homicide, ..."
                  />
                </div>

                {/* Exclude (international) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                      🚫 Exclude (International) · {excludeCount} keywords
                    </label>
                    <Button variant="outline" size="sm" className="text-xs h-6 border-orange-200 text-orange-600" onClick={() => handleLoadTemplate('exclude')}>
                      📋 Load Exclude Template
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Articles matching ANY of these are removed. Good for filtering out non-US international news.
                  </p>
                  <Textarea
                    value={excludeText}
                    onChange={(e) => setExcludeText(e.target.value)}
                    className="min-h-[80px] max-h-[140px] font-mono text-xs resize-y bg-orange-50/30 border-orange-200"
                    placeholder="ukraine, russia, gaza, nato, ..."
                  />
                </div>

                {/* Political exclusion */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-yellow-700 uppercase tracking-wider">
                      🏛️ Exclude (Political) · {politicalCount} keywords
                    </label>
                    <Button variant="outline" size="sm" className="text-xs h-6 border-yellow-200 text-yellow-700" onClick={() => handleLoadTemplate('political')}>
                      📋 Load Political Template
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Articles matching ANY of these are removed. Prevents political/election news from appearing.
                  </p>
                  <Textarea
                    value={politicalText}
                    onChange={(e) => setPoliticalText(e.target.value)}
                    className="min-h-[80px] max-h-[140px] font-mono text-xs resize-y bg-yellow-50/30 border-yellow-200"
                    placeholder="election, ballot, senator, white house, ..."
                  />
                </div>
              </div>
            </>
          )}

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
