/** POST /api/studio/telegram — connect, test, switch or forget the delivery chat. */
import { NextRequest, NextResponse } from 'next/server';
import { finishLink, sendMessage, startLink, telegramBlocked, unlink } from '@/lib/studio/deliver';
import { setSetting } from '@/lib/studio/settings';
import { can, tier } from '@/lib/studio/tier';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.STUDIO_ENABLED) return new NextResponse('Not found', { status: 404 });
  // Owner-only: this makes a bot send messages from the owner's account.
  if (!can(tier(), 'deliver')) {
    return NextResponse.json({ error: 'Chỉ chủ tài khoản dùng được.' }, { status: 403 });
  }

  const { action, on } = (await req.json().catch(() => ({}))) as {
    action?: string;
    on?: boolean;
  };

  try {
    switch (action) {
      case 'code':
        return NextResponse.json(await startLink());
      case 'link':
        return NextResponse.json(await finishLink());
      case 'test':
        await sendMessage('🔔 Desoul Studio đã kết nối với chat này.');
        return NextResponse.json({ ok: true });
      case 'switch':
        setSetting('telegram.enabled', on ? '1' : '0');
        return NextResponse.json({ ok: true });
      case 'forget':
        unlink();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Hành động không hợp lệ.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), blocked: telegramBlocked() },
      { status: 400 },
    );
  }
}
