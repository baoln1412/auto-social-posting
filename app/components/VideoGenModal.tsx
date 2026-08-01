'use client';

import { useState, useEffect, useRef } from 'react';
import { PostDraft } from '../types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { VideoGenState } from './useVideoGen';

interface Props {
  open: boolean;
  onClose: () => void;
  post: PostDraft;
  vg: VideoGenState;
  onShowChecklistInChat: (text: string) => void;
}

// Full CapCut checklist — pushed into the AI chat panel ("Xem checklist đầy đủ")
// and exported as .txt. Reference for anyone assembling the reel by hand.
const FULL_CHECKLIST = `📋 CHECKLIST DỰNG VIDEO (CapCut 9:16 — 1080×1920)

1) VOICE (Canva TTS)
   - Dán kịch bản đã Approve vào công cụ Text-to-Speech (Murf/ElevenLabs/Canva).
   - Chọn giọng đọc tin tức rõ ràng, nhịp nhanh dồn dập → xuất MP3.

2) DỰNG THEO CẤU TRÚC: Hook → Intro 101 → Nội dung chính
   - Hook (5–10s): 2–3 câu đầu của kịch bản, gây tò mò.
   - Sau hook chèn VIDEO INTRO "101 Australia" (~4–7s).
   - Rồi tới phần nội dung chính.

3) LAYOUT 3 PHẦN
   - Trên: con số/điểm nhấn (VD "500 LẦN") viền đỏ/trắng nổi bật.
   - Giữa: ảnh bài báo/minh họa; keyframe Phóng to–Thu nhỏ nhẹ để ảnh động, tránh đơ.
   - Dưới: khối nền Gradient Blue; logo 101 góc dưới TRÁI; tiêu đề chữ TRẮNG in đậm,
     từ khóa quan trọng tô VÀNG (VD "TĂNG MỨC THUỐC TRỪ SÂU"). Text lệch về phải,
     chừa trái cho logo + thanh dọc trang trí.

4) ÂM THANH
   - Nhạc nền tìm theo: Suspense / News / Beat / Tension.
   - Hạ nhạc nền xuống −18dB đến −22dB để nghe rõ lồng tiếng.
   - Auto-captions từ file MP3: font Bold, hiện 2–4 từ/lần để tạo nhịp dồn dập.
   - SFX: Whoosh/Swoosh khi chuyển cảnh/hiện tiêu đề; Pop/Ding/Deep Boom khi nhấn mạnh.

5) THỜI LƯỢNG: bám theo độ dài kịch bản/bản tin.`;

const CHECKLIST_LINES = [
  <>Hook (5–10s) → đọc 2–3 câu đầu của kịch bản, giật gân.</>,
  <>Intro 101 (~4–7s) → chèn video intro kênh ngay sau hook.</>,
  <>Layout 9:16 → trên: con số điểm nhấn · giữa: ảnh keyframe zoom nhẹ · dưới: khối gradient xanh + logo trái + tiêu đề trắng, từ khóa vàng.</>,
  <>Âm thanh → voice MP3 giọng tin tức · nhạc nền −18…−22dB · caption 2–4 từ/dòng · SFX Whoosh/Pop/Ding.</>,
];

export default function VideoGenModal({ open, onClose, post, vg, onShowChecklistInChat }: Props) {
  const [mediaExpanded, setMediaExpanded] = useState(false);

  // Render finished → drawer auto-closes; the result surfaces in the post list instead.
  // Gated on the running→done transition (not just "is done"), so reopening the
  // drawer later to re-check a *previously* finished job doesn't instantly close it.
  const prevJobStatus = useRef(vg.jobStatus);
  useEffect(() => {
    if (prevJobStatus.current === 'running' && vg.jobStatus === 'done' && open) onClose();
    prevJobStatus.current = vg.jobStatus;
  }, [vg.jobStatus, open, onClose]);

  const exportTxt = () => {
    const blob = new Blob([vg.script], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'video-script.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statusLabel = vg.jobStatus === 'running' ? 'Đang render' : vg.approved ? 'Đã approve' : 'Script';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-[540px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b border-border shrink-0">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle className="truncate flex-1">{post.emojiTitle || post.article.title}</SheetTitle>
            <Badge variant="secondary" className="shrink-0 text-[10px]">{statusLabel}</Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ─── Section 1 — Script ─── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Script</h3>
              {vg.approved && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Đã approve</Badge>}
            </div>

            <Textarea
              value={vg.script}
              readOnly={vg.approved}
              onChange={(e) => vg.setScript(e.target.value)}
              placeholder="Nhấn “Tạo script” để AI viết Hook + nội dung chính…"
              className={`min-h-[220px] text-sm leading-relaxed ${vg.approved ? 'bg-muted/40 text-foreground/80' : ''}`}
            />

            <div className="flex flex-wrap gap-2">
              <Button onClick={vg.generate} disabled={vg.loading} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                {vg.loading ? '⏳ Đang tạo…' : '✨ Tạo script'}
              </Button>
              {vg.script && (
                <Button onClick={vg.generate} disabled={vg.loading} variant="ghost" size="sm">
                  🔄 Tạo lại
                </Button>
              )}
              {vg.script && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(vg.script)}
                >
                  📋 Sao chép
                </Button>
              )}
            </div>

            {vg.script && !vg.approved && (
              <Button onClick={() => vg.setApproved(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                ✅ Approve
              </Button>
            )}
            {vg.approved && (
              <Button onClick={() => vg.setApproved(false)} variant="ghost" size="sm" className="text-muted-foreground">
                Huỷ approve
              </Button>
            )}
          </div>

          <Separator />

          {/* ─── Section 2 — Media (optional, collapsed by default) ─── */}
          <div className="space-y-3">
            <button
              onClick={() => setMediaExpanded((v) => !v)}
              className="w-full flex items-center gap-2 text-left"
            >
              {mediaExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <h3 className="text-sm font-semibold text-foreground">Hình ảnh / video</h3>
              <Badge variant="secondary" className="text-[10px]">Tuỳ chọn</Badge>
            </button>

            {mediaExpanded && (
              <div className="space-y-3 pl-6">
                <label className="flex items-center gap-2 text-sm text-rose-600 font-medium cursor-pointer w-fit">
                  <Upload className="w-4 h-4" /> Thêm file
                  <input type="file" multiple accept="image/*,video/*" className="hidden"
                    onChange={(e) => { vg.addFiles(e.target.files); e.target.value = ''; }} />
                </label>

                {vg.media.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {vg.media.map((m, i) => (
                      <div key={m.id} className="relative rounded-md border border-border overflow-hidden bg-muted/30">
                        <span className="absolute top-1 left-1 z-10 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <button onClick={() => vg.removeMedia(m.id)}
                          className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center hover:bg-red-700">
                          ✕
                        </button>
                        {m.uploading ? (
                          <div className="w-full aspect-square flex items-center justify-center text-[10px] text-muted-foreground animate-pulse">…</div>
                        ) : m.kind === 'video' ? (
                          <video src={m.url} className="w-full aspect-square object-cover" muted />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={m.url} alt={m.name} className="w-full aspect-square object-cover" />
                        )}
                        <div className="flex">
                          <button onClick={() => vg.moveMedia(i, -1)} disabled={i === 0}
                            className="flex-1 py-0.5 text-[10px] bg-muted hover:bg-accent disabled:opacity-30">◀</button>
                          <button onClick={() => vg.moveMedia(i, 1)} disabled={i === vg.media.length - 1}
                            className="flex-1 py-0.5 text-[10px] bg-muted hover:bg-accent disabled:opacity-30 border-l border-border">▶</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  Mỗi file (ảnh hoặc video) chiếm một phần bằng nhau trong video — video dài hơn sẽ tự cắt vừa phần đó. Bỏ qua → tool tự lấy hình từ bài báo.
                </p>
              </div>
            )}
          </div>

          {/* ─── Section 3 — Checklist + Render (only after Approve) ─── */}
          {vg.approved && vg.script && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Checklist CapCut</h3>
                <ul className="text-sm space-y-1.5 text-foreground/90">
                  {CHECKLIST_LINES.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={exportTxt}>📄 Xuất script .txt</Button>
                  <Button variant="ghost" size="sm" onClick={() => onShowChecklistInChat(FULL_CHECKLIST)}>
                    💬 Xem checklist đầy đủ
                  </Button>
                </div>

                <Button
                  onClick={vg.render}
                  disabled={vg.jobStatus === 'running'}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {vg.jobStatus === 'running' ? 'Đang render…' : vg.jobStatus === 'error' ? '🔁 Thử lại render' : '🎥 Bắt đầu render'}
                </Button>

                {vg.jobStatus === 'running' && (
                  <p className="text-xs rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2">
                    Render đang chạy ngầm — bạn có thể đóng khung này.
                  </p>
                )}
                {vg.jobStatus === 'error' && vg.jobError && (
                  <p className="text-xs text-red-600 whitespace-pre-wrap">{vg.jobError}</p>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
