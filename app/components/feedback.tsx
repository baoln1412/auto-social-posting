'use client';

/**
 * In-app replacements for window.alert / confirm / prompt.
 *
 * page.tsx already noted that native prompt() is blocked in embedded browsers
 * and swapped ONE call site for a Dialog. alert() and confirm() are blocked by
 * the same rule, and 18 call sites were still using them — so this is that fix
 * applied where all callers route through, instead of once per bug report.
 *
 * Module-level rather than a hook so a call site changes from
 *   `if (!confirm('...')) return;`   to   `if (!await confirmDialog({...})) return;`
 * with no per-component state wiring. Mount <FeedbackHost/> once, in layout.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Tone = 'error' | 'success' | 'info';
type Action = { label: string; run: () => void };
type Toast = { id: number; message: string; tone: Tone; action?: Action };

type ConfirmOpts = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type PromptOpts = { title: string; label?: string; defaultValue?: string; placeholder?: string };

// ── Store ──────────────────────────────────────────────────────────────────
let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let openConfirm: ((o: ConfirmOpts) => Promise<boolean>) | null = null;
let openPrompt: ((o: PromptOpts) => Promise<string | null>) | null = null;

/** Non-blocking message. Default tone is error: silent success is the rule, so
 *  reach for 'success' only when the effect isn't visible on screen.
 *  Pass an action to offer Undo — that is what replaces a confirm dialog on a
 *  reversible destructive action. */
export function toast(message: string, tone: Tone = 'error', action?: Action) {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone, action }];
  emit();
  // Long enough to read a sentence and reach for Undo; failures stay until dismissed.
  if (tone !== 'error') setTimeout(() => dismiss(id), action ? 8000 : 4000);
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (!openConfirm) return Promise.resolve(false); // host not mounted — never silently proceed
  return openConfirm(opts);
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  if (!openPrompt) return Promise.resolve(null);
  return openPrompt(opts);
}

// ── Host ───────────────────────────────────────────────────────────────────
const TONE: Record<Tone, { cls: string; Icon: typeof Info }> = {
  error: { cls: 'border-destructive/25 text-destructive', Icon: AlertTriangle },
  success: { cls: 'border-success/25 text-success', Icon: CheckCircle2 },
  info: { cls: 'border-info/25 text-info', Icon: Info },
};

export function FeedbackHost() {
  const [, force] = useState(0);
  const [confirmState, setConfirmState] = useState<
    { opts: ConfirmOpts; resolve: (v: boolean) => void } | null
  >(null);
  const [promptState, setPromptState] = useState<
    { opts: PromptOpts; resolve: (v: string | null) => void; value: string } | null
  >(null);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    openConfirm = (opts) => new Promise<boolean>((resolve) => setConfirmState({ opts, resolve }));
    openPrompt = (opts) =>
      new Promise<string | null>((resolve) =>
        setPromptState({ opts, resolve, value: opts.defaultValue ?? '' }),
      );
    return () => {
      listeners.delete(l);
      openConfirm = null;
      openPrompt = null;
    };
  }, []);

  const settleConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };
  const settlePrompt = (v: string | null) => {
    promptState?.resolve(v);
    setPromptState(null);
  };

  return (
    <>
      {/* Fixed corner stack — a new toast never moves the ones already there,
          and nothing behind it reflows. */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]">
        {toasts.map(({ id, message, tone, action }) => {
          const { cls, Icon } = TONE[tone];
          return (
            <div
              key={id}
              role="status"
              className={`flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-md ${cls}`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <p className="flex-1 text-sm text-foreground whitespace-pre-line break-words">{message}</p>
              {action && (
                <button
                  onClick={() => { action.run(); dismiss(id); }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-sm font-semibold text-primary hover:bg-primary/10"
                >
                  {action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!confirmState} onOpenChange={(o) => !o && settleConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmState?.opts.title}</DialogTitle>
          </DialogHeader>
          {confirmState?.opts.body && (
            <p className="text-sm text-muted-foreground whitespace-pre-line">{confirmState.opts.body}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => settleConfirm(false)}>
              {confirmState?.opts.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              autoFocus
              variant={confirmState?.opts.destructive ? 'destructive' : 'default'}
              onClick={() => settleConfirm(true)}
            >
              {confirmState?.opts.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!promptState} onOpenChange={(o) => !o && settlePrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promptState?.opts.title}</DialogTitle>
          </DialogHeader>
          <label className="text-sm font-normal">
            {promptState?.opts.label}
            <Input
              className="mt-1"
              autoFocus
              value={promptState?.value ?? ''}
              placeholder={promptState?.opts.placeholder}
              onChange={(e) =>
                setPromptState((s) => (s ? { ...s, value: e.target.value } : s))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && promptState?.value.trim()) settlePrompt(promptState.value.trim());
              }}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => settlePrompt(null)}>Cancel</Button>
            <Button
              disabled={!promptState?.value.trim()}
              onClick={() => settlePrompt(promptState?.value.trim() ?? null)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
