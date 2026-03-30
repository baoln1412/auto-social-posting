'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Task = 'location';

interface Props {
  pageId: string;
}

type Status = 'idle' | 'running' | 'done' | 'error';

interface TaskResult {
  task: string;
  scanned: number;
  updated: number;
  errors: number;
}

export default function BackfillButton({ pageId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [force, setForce] = useState(false);
  const [results, setResults] = useState<TaskResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function runBackfill(tasks: Task[]) {
    setStatus('running');
    setResults(null);
    setErrorMsg('');

    try {
      const res = await fetch('/api/posts/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, tasks, force }),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setResults(json.results ?? []);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const isRunning = status === 'running';

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={isRunning}
          onClick={() => runBackfill(['location'])}
          className="gap-2"
        >
          {isRunning ? (
            <span className="animate-spin">⚙️</span>
          ) : (
            '📍'
          )}
          {isRunning ? 'Running…' : 'Backfill Location'}
        </Button>

        {/* Force toggle */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          Re-detect all (including already set)
        </label>
      </div>

      {/* Result pills */}
      {status === 'done' && results && (
        <div className="flex flex-wrap gap-2">
          {results.map((r) => (
            <div key={r.task} className="flex items-center gap-1.5 text-xs">
              <Badge variant="secondary" className="text-green-700 bg-green-100">
                ✅ {r.task}
              </Badge>
              <span className="text-muted-foreground">
                Scanned <strong>{r.scanned}</strong> · Updated{' '}
                <strong className="text-green-700">{r.updated}</strong>
                {r.errors > 0 && (
                  <span className="text-red-500"> · {r.errors} errors</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <p className="text-xs text-red-500">⚠️ {errorMsg}</p>
      )}
    </div>
  );
}
