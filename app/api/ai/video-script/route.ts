import { NextResponse } from 'next/server';
import { generateViaClaudeCli } from '../../pipeline/claude-cli-client';

export const runtime = 'nodejs';
export const maxDuration = 90;

/**
 * Reel/short-video script generator.
 * Turns an already-Vietnamese gold post into a voice-over script:
 * a 5–10s Hook + spoken-Vietnamese body, one sentence per line, ready to read
 * into Canva/CapCut TTS. Runs on Claude Sonnet via the subscription-billed
 * `claude -p` CLI (see claude-cli-client.ts) — not the Gemini backend the rest
 * of the site's AI features use.
 */
export async function POST(request: Request) {
  try {
    const { title, draft, channelName } = await request.json();

    if (!draft || !String(draft).trim()) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 });
    }

    const channel = (channelName && String(channelName).trim()) || '101 Australia - Chuyện Úc chút chút';

    const systemPrompt = [
      `Bạn là biên tập viên kịch bản video ngắn (TikTok/Reels/Shorts) chuyên nghiệp cho kênh "${channel}".`,
      'Tôi đưa bạn nội dung một bài tin (tiêu đề gốc + bản tin tiếng Việt). Hãy viết KỊCH BẢN LỒNG TIẾNG theo yêu cầu:',
      '',
      '1. HOOK (5–10 giây, tối đa 3 câu): giật gân, đánh đúng tâm lý tò mò/cảnh báo của người xem, đúng phong cách kênh.',
      '2. NỘI DUNG CHÍNH: dùng văn phong nói (khẩu ngữ) tự nhiên của người Việt, bám sát bản tin, câu ngắn gọn dồn dập để dễ ghép video. Độ dài tùy theo độ chi tiết của bài.',
      '',
      'QUY TẮC BẮT BUỘC:',
      '- Trình bày dạng văn xuôi thuần túy. LOẠI BỎ hoàn toàn tên nhân vật, tên vai nói, và mọi nhãn như "Hook", "Lời dẫn", "Nội dung".',
      '- KHÔNG markdown, KHÔNG emoji, KHÔNG dấu ngoặc kép bao quanh.',
      '- Ngắt dòng RÕ RÀNG theo từng câu thoại: mỗi câu một dòng, để chỉ việc nhìn vào đọc lồng tiếng.',
      '- Vài dòng đầu là Hook, sau đó xuống dòng trống rồi tới nội dung chính.',
      '- Chỉ trả về kịch bản, không giải thích gì thêm.',
    ].join('\n');

    const userMessage = [
      '--- TIÊU ĐỀ GỐC ---',
      String(title ?? '').trim() || '(không có)',
      '',
      '--- BẢN TIN (tiếng Việt) ---',
      String(draft).trim(),
    ].join('\n');

    const script = await generateViaClaudeCli(systemPrompt, userMessage);
    return NextResponse.json({ success: true, script: script.trim() });
  } catch (error) {
    console.error('[ai/video-script] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Script generation failed' },
      { status: 500 },
    );
  }
}
