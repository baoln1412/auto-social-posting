'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface SystemPromptConfigProps {
  prompt: string;
  userPrompt: string;
  platformPrompts: Record<string, string>;
  onSave: (prompt: string, userPrompt: string, platformPrompts: Record<string, string>) => Promise<void>;
}

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', icon: '📘', description: 'Default platform — main content generation prompt' },
  { key: 'instagram', label: 'Instagram', icon: '📸', description: 'Instagram-specific content style' },
  { key: 'threads', label: 'Threads', icon: '🧵', description: 'Threads-specific content style' },
  { key: 'tiktok', label: 'TikTok', icon: '🎵', description: 'TikTok-specific content style' },
];

type ActiveSection = 'system' | 'user' | 'platform';

export default function SystemPromptConfig({ prompt, userPrompt, platformPrompts, onSave }: SystemPromptConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>('system');
  const [activeTab, setActiveTab] = useState('facebook');
  const [systemPromptVal, setSystemPromptVal] = useState(prompt);
  const [userPromptVal, setUserPromptVal] = useState(userPrompt);
  const [otherPrompts, setOtherPrompts] = useState<Record<string, string>>({
    instagram: platformPrompts.instagram ?? '',
    threads: platformPrompts.threads ?? '',
    tiktok: platformPrompts.tiktok ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Always sync internal state when parent props change (e.g. page switch)
  useEffect(() => {
    setSystemPromptVal(prompt);
  }, [prompt]);

  useEffect(() => {
    setUserPromptVal(userPrompt);
  }, [userPrompt]);

  useEffect(() => {
    setOtherPrompts({
      instagram: platformPrompts.instagram ?? '',
      threads: platformPrompts.threads ?? '',
      tiktok: platformPrompts.tiktok ?? '',
    });
  }, [platformPrompts]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const filteredPrompts: Record<string, string> = {};
      for (const [key, val] of Object.entries(otherPrompts)) {
        if (val.trim()) filteredPrompts[key] = val.trim();
      }
      await onSave(systemPromptVal, userPromptVal, filteredPrompts);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    systemPromptVal !== prompt ||
    userPromptVal !== userPrompt ||
    JSON.stringify(otherPrompts) !==
      JSON.stringify({
        instagram: platformPrompts.instagram ?? '',
        threads: platformPrompts.threads ?? '',
        tiktok: platformPrompts.tiktok ?? '',
      });

  const activePlatform = PLATFORMS.find((p) => p.key === activeTab);

  return (
    <Card className="card-warm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors rounded-t-xl"
      >
        <span>⚙️ Content Generation Prompts</span>
        <span className="text-muted-foreground text-xs">
          {isOpen ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>

      {isOpen && (
        <CardContent className="pt-0 space-y-3">
          {/* Section tabs: System Prompt | User Prompt | Platform Prompts */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
            {([
              { key: 'system', label: '🧠 System Prompt', hint: 'AI persona, tone, brand rules' },
              { key: 'user', label: '📝 User Prompt', hint: 'Output format, examples, article injection' },
              { key: 'platform', label: '📱 Platform Prompts', hint: 'Platform-specific overrides' },
            ] as const).map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center
                  ${activeSection === section.key
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <span>{section.label}</span>
              </button>
            ))}
          </div>

          {/* System Prompt Section */}
          {activeSection === 'system' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">
                <strong>System Prompt</strong> — Sets the AI&apos;s persona, brand voice, tone, target audience, and content structure rules.
                This is sent as the <code className="bg-muted px-1 rounded">systemInstruction</code> to Gemini (highest priority).
              </p>
              <Textarea
                value={systemPromptVal}
                onChange={(e) => setSystemPromptVal(e.target.value)}
                className="min-h-[250px] max-h-[500px] font-mono text-sm resize-y bg-muted/30 border-border"
                placeholder="Enter your system prompt — AI persona, brand voice, tone, content structure rules..."
              />
            </div>
          )}

          {/* User Prompt Section */}
          {activeSection === 'user' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">
                <strong>User Prompt</strong> — Defines the output format (JSON schema), example outputs, and article injection point.
                Use <code className="bg-muted px-1 rounded">{'{articles}'}</code> as a placeholder — it will be replaced with the actual article data at runtime.
              </p>
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                  ⚠️ Must contain {'{articles}'} placeholder
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                  💡 Keep examples minimal — system prompt controls tone
                </span>
              </div>
              <Textarea
                value={userPromptVal}
                onChange={(e) => setUserPromptVal(e.target.value)}
                className="min-h-[250px] max-h-[500px] font-mono text-sm resize-y bg-muted/30 border-border"
                placeholder={'For each article, create a JSON object with:\n- emojiTitle: ...\n- facebookText: ...\n- summary: ...\n- imagePrompt: ...\n\nReturn ONLY a valid JSON array.\n\nARTICLES TO PROCESS:\n{articles}'}
              />
            </div>
          )}

          {/* Platform Prompts Section */}
          {activeSection === 'platform' && (
            <div className="space-y-3">
              <div className="flex gap-1 p-1 rounded-lg bg-muted/30">
                {PLATFORMS.map((platform) => {
                  const isActive = activeTab === platform.key;
                  const hasContent =
                    platform.key === 'facebook'
                      ? true
                      : !!(otherPrompts[platform.key] ?? '').trim();
                  return (
                    <button
                      key={platform.key}
                      onClick={() => setActiveTab(platform.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center
                        ${isActive
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <span>{platform.icon}</span>
                      <span>{platform.label}</span>
                      {hasContent && platform.key !== 'facebook' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground px-1">
                {activePlatform?.description}
                {activeTab === 'facebook' && (
                  <span className="text-primary/80"> — Uses the System Prompt above (not editable here)</span>
                )}
                {activeTab !== 'facebook' && (
                  <span className="text-primary/80"> — Leave empty to skip generating drafts for this platform</span>
                )}
              </p>

              {activeTab === 'facebook' ? (
                <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-border text-xs text-muted-foreground text-center">
                  Facebook uses the System Prompt and User Prompt defined above. Switch tabs for platform-specific overrides.
                </div>
              ) : (
                <Textarea
                  value={otherPrompts[activeTab] ?? ''}
                  onChange={(e) => setOtherPrompts((prev) => ({ ...prev, [activeTab]: e.target.value }))}
                  className="min-h-[200px] max-h-[500px] font-mono text-sm resize-y bg-muted/30 border-border"
                  placeholder={`Enter ${activePlatform?.label}-specific system prompt (optional)...`}
                />
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              size="sm"
              className={hasChanges ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
              variant={hasChanges ? 'default' : 'secondary'}
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save All Prompts'}
            </Button>
            {hasChanges && (
              <span className="text-xs text-primary font-medium">
                Unsaved changes
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
