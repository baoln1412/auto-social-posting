'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Copy, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
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

function PartCard({ part, total }: { part: Part; total: number }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(part.status === 'published');
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
          onClick={async () => {
            if (!part.articleUrl) return; // never PATCH a blank key — it matches siblings
            const next = !done;
            setDone(next);
            try {
              await fetch('/api/posts/status', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleUrl: part.articleUrl, status: next ? 'published' : 'draft' }),
              });
            } catch { setDone(!next); toast('Không đổi được trạng thái bài này.'); }
          }}
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crime/series?marketId=${pageId}`);
      const d = await res.json();
      setSeries(d.series ?? []);
    } catch {
      toast('Không tải được danh sách kỳ án.');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

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

      <CaseQueue pageId={pageId} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />Đang tải…
        </div>
      ) : series.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-card">
          <FileText size={22} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-lg font-normal text-foreground mb-1">Chưa có kỳ án nào</p>
          <p className="text-sm text-muted-foreground">
            Chạy skill <code className="text-xs">crime-series</code> kèm link vụ án để tạo bộ đầu tiên.
          </p>
        </div>
      ) : (
        series.map((s) => (
          <Card key={s.seriesId} className="card-warm">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground flex-1">{s.seriesTitle}</h3>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {s.parts.length}/3 kỳ
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {s.parts.map((p) => <PartCard key={p.id} part={p} total={Math.max(s.parts.length, 3)} />)}
                {s.parts.length < 3 && (
                  <p className="text-xs text-muted-foreground">
                    Thiếu {KY.slice(s.parts.length, 3).join(', ')} — bộ chưa hoàn chỉnh.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
