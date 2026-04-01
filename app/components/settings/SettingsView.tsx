'use client';

import SystemPromptConfig from '../SystemPromptConfig';
import KeywordFilterConfig from '../KeywordFilterConfig';
import ChannelManager from '../ChannelManager';
import SourceManager from '../SourceManager';
import BackfillButton from '../BackfillButton';
import { KeywordConfig } from '../../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SettingsViewProps {
  pageId: string;
  pageName: string;
  systemPrompt: string;
  userPrompt: string;
  platformPrompts: Record<string, string>;
  keywordConfig: KeywordConfig;
  onSavePrompt: (prompt: string, userPrompt: string, platformPrompts: Record<string, string>) => Promise<void>;
  onSaveKeywordConfig: (config: KeywordConfig) => Promise<void>;
  onDeletePage: () => void;
  onRenamePage: () => void;
}

export default function SettingsView({
  pageId,
  pageName,
  systemPrompt,
  userPrompt,
  platformPrompts,
  keywordConfig,
  onSavePrompt,
  onSaveKeywordConfig,
  onDeletePage,
  onRenamePage,
}: SettingsViewProps) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-xl font-bold text-foreground">⚙️ Settings</h2>

      {/* Page info */}
      <Card className="card-warm">
        <CardHeader>
          <CardTitle className="text-base">📄 Page Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Page Name</p>
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

      {/* System Prompt (with platform tabs) */}
      <SystemPromptConfig
        prompt={systemPrompt}
        userPrompt={userPrompt}
        platformPrompts={platformPrompts}
        onSave={onSavePrompt}
      />

      {/* Keyword Filter Config */}
      <KeywordFilterConfig
        config={keywordConfig}
        onSave={onSaveKeywordConfig}
      />

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

      {/* Channel Manager */}
      <ChannelManager
        pageId={pageId}
        defaultSystemPrompt={systemPrompt}
        defaultUserPrompt={userPrompt}
        defaultKeywordConfig={keywordConfig}
      />


      {/* Feed Sources */}
      <SourceManager pageId={pageId} />
    </div>
  );
}
