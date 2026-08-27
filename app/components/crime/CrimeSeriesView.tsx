'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '../feedback';

interface Part {
  id: string;
  articleUrl?: string;
  partNo: number;
  emojiTitle: string;
  bodyText: string;
  hashtags?: string;
  comment1?: string;
  comment2?: string;
  comment3?: string;
  imagePrompt?: string;
  status?: string;
  words: number;
}
interface Series {
  seriesId: string;
  seriesTitle: string;
  generatedAt: string;
  victimName?: string;
  suspectName?: string;
  stateName?: string;
  parts: Part[];
}

const KY = ['🥀 KỲ I', '🔍 KỲ II', '⚖️ KỲ III'];

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Copy size={12} />
      {done ? 'Đã chép' : label}
    </Button>
  );
}

// `done` is read from the part rather than held here: the series checkbox marks every part
// at once, and local state would leave each kỳ still showing "Nháp" until a full reload.
function PartCard({ part, total, onToggle }: { part: Part; total: number; onToggle: (next: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const done = part.status === 'published';
  // ≥3,000 words is the SOP floor for a kỳ; surface it rather than making the
  // editor count, since under-length is the failure this format actually has.
  const short = part.words < 3000;
  const comments = [part.comment1, part.comment2, part.comment3].filter((c) => c?.trim());

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/20 border-b border-border">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-3 flex-1 text-left min-w-0">
          {open ? <ChevronDown size={15} className="shrink-0" /> : <ChevronRight size={15} className="shrink-0" />}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary shrink-0">
            Bài {part.partNo}/{total}
          </span>
          <span className="flex-1 text-sm font-semibold text-foreground truncate">{part.emojiTitle}</span>
        </button>
        <span className={`text-xs tabular-nums shrink-0 ${short ? 'text-warning' : 'text-muted-foreground'}`}>
          {part.words.toLocaleString()} từ
        </span>
        <button
          disabled={!part.articleUrl}
          onClick={() => onToggle(!done)}
          className={`shrink-0 text-xs px-2 py-1 rounded-md border transition-colors ${
            done ? 'bg-success/10 text-success border-success/25' : 'text-muted-foreground border-border hover:bg-accent'
          }`}
        >
          {done ? 'Đã đăng' : 'Nháp'}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {short && (
            <p className="text-xs text-warning">
              Dưới 3.000 từ — SOP §9 yêu cầu viết dài hơn, hoặc cắt bớt số kỳ nếu tư liệu không đủ.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <CopyBtn
              text={part.bodyText + (part.hashtags ? `\n\n${part.hashtags}` : '')}
              label="Chép cả bài đăng"
            />
            <CopyBtn text={part.bodyText} label="Chép thân bài" />
            {part.hashtags && <CopyBtn text={part.hashtags} label="Chép hashtag" />}
            {part.imagePrompt && <CopyBtn text={part.imagePrompt} label="Chép prompt ảnh" />}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-md bg-muted/20 p-3">
            <p className="text-sm text-foreground whitespace-pre-wrap" style={{ lineHeight: 1.7 }}>
              {part.bodyText}
            </p>
          </div>

          {part.hashtags && <p className="text-xs text-info">{part.hashtags}</p>}

          {comments.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="px-3 py-1.5 border-b border-border">
                <span className="text-xs font-semibold text-warning uppercase tracking-wider">
                  Bình luận của bài {part.partNo}
                </span>
              </div>
              {comments.map((c, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-b-0">
                  <span className="text-xs font-semibold text-muted-foreground mt-0.5 shrink-0">#{i + 1}</span>
                  <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{c}</p>
                  <CopyBtn text={c!} label="Chép" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface CaseRow { id: string; title: string; source_url?: string; notes?: string; status: string }

const CASE_TONE: Record<string, string> = {
  queued: 'text-info border-info/25 bg-info/10',
  researching: 'text-warning border-warning/25 bg-warning/10',
  written: 'text-success border-success/25 bg-success/10',
  rejected: 'text-muted-foreground border-border bg-muted',
};

function CaseQueue({ pageId }: { pageId: string }) {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crime/cases?marketId=${pageId}`);
      setCases((await r.json()).cases ?? []);
    } catch { /* the queue is a helper; a failure here must not blank the series list */ }
  }, [pageId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!title.trim() && !url.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/crime/cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId: pageId, title, sourceUrl: url }),
      });
      if (!r.ok) throw new Error();
      setTitle(''); setUrl(''); await load();
    } catch { toast('Không thêm được vụ án vào hàng đợi.'); }
    finally { setSaving(false); }
  };

  const queued = cases.filter((c) => c.status === 'queued').length;

  return (
    <Card className="card-warm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">Hàng đợi vụ án</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {queued} đang chờ / {cases.length} tổng
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Kỳ án không đến từ RSS. Lịch chạy tự động lấy vụ án từ hàng đợi này; hết hàng đợi
          thì lần chạy đó bỏ qua, không tự bịa vụ án cho đủ lịch.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Tên vụ án" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Link hồ sơ / thông cáo (tuỳ chọn)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button onClick={add} disabled={saving || (!title.trim() && !url.trim())} className="gap-2 whitespace-nowrap">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Thêm
          </Button>
        </div>
        {cases.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {cases.map((c) => (
              <div key={c.id} className="flex items-start gap-2 text-sm border border-border rounded-md px-3 py-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${CASE_TONE[c.status] ?? CASE_TONE.rejected}`}>
                  {c.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-foreground truncate">{c.title}</span>
                    {c.source_url && (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        bản án
                      </a>
                    )}
                  </div>
                  {/* Without this the whole queue reads "People v. Nguyen" and cannot be triaged. */}
                  {c.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.notes}</p>
                  )}
                </div>
                <button
                  aria-label="Xoá"
                  onClick={async () => {
                    await fetch(`/api/crime/cases?id=${c.id}`, { method: 'DELETE' });
                    load();
                  }}
                  className="shrink-0 text-muted-foreground hover:text-destructive p-1"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrimeSeriesView({ pageId }: { pageId: string }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'series' | 'queue'>('series');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [states, setStates] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState('');

  // Filtering and paging happen in SQL, not here: a series carries three bodies of 3,000+
  // words, and at eight a day fetching the whole market to show the newest few reaches tens
  // of megabytes within a month.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ marketId: pageId, page: String(page) });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (state) qs.set('state', state);
      const res = await fetch(`/api/crime/series?${qs}`);
      const d = await res.json();
      setSeries(d.series ?? []);
      setPages(d.pages ?? 1);
      setTotal(d.total ?? 0);
      setStates(d.states ?? []);
    } catch {
      toast('Không tải được danh sách kỳ án.');
    } finally {
      setLoading(false);
    }
  }, [pageId, page, from, to, state]);

  useEffect(() => { load(); }, [load]);

  // Changing a filter while on page 5 would otherwise ask for a page the new result set may
  // not have, and the list would come back empty for no visible reason.
  const filterBy = (fn: () => void) => { fn(); setPage(1); };
  const filtered = Boolean(from || to || state);

  /**
   * Mark parts published or back to draft. The rows are updated here first so the checkbox
   * and every kỳ move together, then reverted as a set if the server disagrees — a partial
   * failure that left three rows disagreeing with one checkbox would be worse than none.
   *
   * A part with no articleUrl is skipped: setGoldStatus updates WHERE article_url = ?, so a
   * blank key would flip every sibling in the market.
   */
  const setParts = useCallback(async (seriesId: string, partIds: string[], next: boolean) => {
    const status = next ? 'published' : 'draft';
    const targets = series
      .find((s) => s.seriesId === seriesId)?.parts
      .filter((p) => partIds.includes(p.id) && p.articleUrl) ?? [];
    if (targets.length === 0) return;

    const apply = (st: string) => setSeries((prev) => prev.map((s) => s.seriesId !== seriesId ? s : {
      ...s,
      parts: s.parts.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, status: st } : p)),
    }));
    const before = targets.map((t) => t.status ?? 'draft');
    apply(status);

    try {
      const res = await Promise.all(targets.map((p) => fetch('/api/posts/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl: p.articleUrl, status }),
      })));
      if (res.some((r) => !r.ok)) throw new Error();
    } catch {
      setSeries((prev) => prev.map((s) => s.seriesId !== seriesId ? s : {
        ...s,
        parts: s.parts.map((p) => {
          const i = targets.findIndex((t) => t.id === p.id);
          return i === -1 ? p : { ...p, status: before[i] };
        }),
      }));
      toast('Không đổi được trạng thái, đã hoàn tác.');
    }
  }, [series]);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <h2 className="text-display text-foreground">Kỳ án hình sự</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Phóng sự tư liệu 3 kỳ. Mỗi vụ án được nghiên cứu từ hồ sơ tòa án và báo chí, không
          lấy từ RSS — chạy skill <code className="text-xs">crime-series</code> với link hoặc
          tóm tắt vụ án để tạo một bộ mới.
        </p>
      </div>

      {/* Deliberately not components/ui/tabs.tsx: that file is written in Tailwind v4 variant
          syntax (data-horizontal:, group-data-horizontal/tabs:) while this project is on v3,
          so its classes do not exist and the strip renders unstyled and side-on. Nothing else
          imports it. Two tabs do not justify porting a primitive. */}
      <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-[3px]">
        {([['series', 'Kỳ án'], ['queue', 'Hàng đợi vụ án']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === id ? 'bg-background text-foreground shadow-sm' : 'text-foreground/60 hover:text-foreground'
            }`}
          >
            {label}
            {id === 'series' && total > 0 && <span className="ml-1.5 tabular-nums opacity-60">{total}</span>}
          </button>
        ))}
      </div>

      {tab === 'queue' ? (
        <CaseQueue pageId={pageId} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Từ ngày</span>
              <Input type="date" value={from} max={to || undefined} className="h-9 w-40"
                onChange={(e) => filterBy(() => setFrom(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Đến ngày</span>
              <Input type="date" value={to} min={from || undefined} className="h-9 w-40"
                onChange={(e) => filterBy(() => setTo(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Bang</span>
              {/* Options come from the whole market, not the current page — otherwise picking
                  one state would hide every other option. */}
              <select
                value={state}
                onChange={(e) => filterBy(() => setState(e.target.value))}
                className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Tất cả</option>
                {states.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>
            {filtered && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs"
                onClick={() => filterBy(() => { setFrom(''); setTo(''); setState(''); })}>
                <X size={13} />Xoá lọc
              </Button>
            )}
          </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />Đang tải…
        </div>
      ) : series.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-card">
          <FileText size={22} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-lg font-normal text-foreground mb-1">
            {filtered ? 'Không có kỳ án nào khớp bộ lọc' : 'Chưa có kỳ án nào'}
          </p>
          <p className="text-sm text-muted-foreground">
            {filtered
              ? 'Thử nới rộng khoảng ngày hoặc bỏ lọc bang.'
              : <>Chạy skill <code className="text-xs">crime-series</code> kèm link vụ án để tạo bộ đầu tiên.</>}
          </p>
        </div>
      ) : (
        series.map((s) => {
          const meta = [
            ['Nạn nhân', s.victimName],
            ['Nghi phạm', s.suspectName],
            ['Bang', s.stateName],
          ].filter(([, v]) => v?.trim()) as [string, string][];
          const allDone = s.parts.length > 0 && s.parts.every((p) => p.status === 'published');
          return (
          <Card key={s.seriesId} className="card-warm">
            <CardContent className="p-4 space-y-3">
              {/* Above the headline: a shelf of "🩸 XẢ SÚNG QUÁN CÀ PHÊ…" titles is hard to
                  tell apart, and the names are what an editor scans for. */}
              {meta.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {meta.map(([label, value]) => (
                    <span key={label} className="text-xs">
                      <span className="uppercase tracking-wider text-muted-foreground">{label} </span>
                      <span className="font-medium text-foreground">{value}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground flex-1">{s.seriesTitle}</h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {s.parts.length}/3 kỳ
                </span>
                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allDone}
                    onChange={(e) => setParts(s.seriesId, s.parts.map((p) => p.id), e.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--success))] cursor-pointer"
                  />
                  <span className={`text-xs ${allDone ? 'text-success' : 'text-muted-foreground'}`}>Xong</span>
                </label>
              </div>
              <div className="flex flex-col gap-2">
                {s.parts.map((p) => (
                  <PartCard
                    key={p.id}
                    part={p}
                    total={Math.max(s.parts.length, 3)}
                    onToggle={(next) => setParts(s.seriesId, [p.id], next)}
                  />
                ))}
                {s.parts.length < 3 && (
                  <p className="text-xs text-muted-foreground">
                    Thiếu {KY.slice(s.parts.length, 3).join(', ')} — bộ chưa hoàn chỉnh.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          );
        })
      )}

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-muted-foreground tabular-nums">
                Trang {page}/{pages} · {total} bộ
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                  disabled={page <= 1 || loading} onClick={() => setPage((n) => n - 1)}>
                  <ChevronLeft size={13} />Trước
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
                  disabled={page >= pages || loading} onClick={() => setPage((n) => n + 1)}>
                  Sau<ChevronRight size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
