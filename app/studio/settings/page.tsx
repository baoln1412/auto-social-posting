import Link from 'next/link';
import { Bell, Mic, Send, Share2, SlidersHorizontal, User } from 'lucide-react';
import { chatId, deliveryOn, telegramBlocked } from '@/lib/studio/deliver';
import { getSetting } from '@/lib/studio/settings';
import { can, tier } from '@/lib/studio/tier';
import { visibleChannels } from '@/lib/studio/visible';
import { TelegramSettings } from '../components/TelegramSettings';
import FacebookConnect from '@/app/components/FacebookConnect';

import { PageHeader, monthCostUsd } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

/**
 * The reference's settings shape (tv-15): a sub-nav on the left, the sections themselves
 * stacked on the right. The sub-nav scrolls rather than switches — every section stays in the
 * page, so "where is Telegram" is answered by looking, not by clicking through six tabs.
 *
 * Facebook is the SPA's own `FacebookConnect`, imported. It holds the page tokens the whole
 * repo publishes with; a second implementation of connect/disconnect would drift by the first
 * bug fix.
 */
const NAV = [
  { id: 'profile', label: 'Hồ sơ', Icon: User },
  { id: 'setup', label: 'Thiết lập', Icon: SlidersHorizontal },
  { id: 'voice', label: 'Giọng đọc', Icon: Mic },
  { id: 'notify', label: 'Thông báo', Icon: Bell },
  { id: 'telegram', label: 'Telegram', Icon: Send },
  { id: 'facebook', label: 'Facebook', Icon: Share2 },
];

function Section({
  id,
  title,
  sub,
  Icon,
  children,
}: {
  id: string;
  title: string;
  sub: string;
  Icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-testid={`set-${id}`} className="st-card scroll-mt-4 p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="st-tile">
          <Icon strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold leading-tight" style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}>
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** One label/value line, with whatever action belongs on its right. */
function Row({ label, sub, right }: { label: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t-2 border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px]">{label}</b>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

export default function SettingsPage() {
  const t = tier();
  const channels = visibleChannels(t).length;
  const usd = monthCostUsd();

  return (
    <>
      <PageHeader title="Cài đặt" sub="Quyền, thông báo và các tài khoản Studio đăng bài qua." />
      <div className="st-content">
        <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[176px_minmax(0,1fr)]">
          <nav data-testid="settings-nav" className="st-subnav h-max">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} data-testid={`set-jump-${n.id}`}>
                <n.Icon strokeWidth={2.25} />
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            <Section id="profile" title="Hồ sơ" Icon={User} sub="Quyền hiện tại quyết định màn hình nào tiêu được tiền.">
              <Row label="Quyền" sub="Đặt bằng cookie đã ký, không phải biến môi trường" right={<span className="st-badge st-green">{t}</span>} />
              <Row
                label="Kênh nhìn thấy"
                sub="Kênh dưới quyền này bị ẩn khỏi mọi màn hình"
                right={<span className="st-num text-sm">{channels}</span>}
              />
              <Row
                label="Chi phí tháng này"
                sub="Cộng từ cost_usd của từng bước đã chạy"
                right={<span className="st-num text-sm">${usd.toFixed(2)}</span>}
              />
            </Section>

            <Section id="setup" title="Thiết lập" Icon={SlidersHorizontal} sub="Mặc định áp cho video mới.">
              <Row
                label="Bộ nhận diện"
                sub="Màu, phông, khung, nhạc và giọng đọc của từng kênh"
                right={
                  <Link href="/studio/kits" className="st-btn st-sm">
                    Mở
                  </Link>
                }
              />
              <Row
                label="Kho tài nguyên"
                sub="Ảnh nền, video nền, nhãn dán, nhạc — 50 MB / 30 tệp"
                right={
                  <Link href="/studio/assets" className="st-btn st-sm">
                    Mở
                  </Link>
                }
              />
              <Row
                label="Nguồn tự động"
                sub="Lịch crawl và thiết lập năm bước cho từng thị trường"
                right={
                  <Link href="/studio/pipeline" className="st-btn st-sm">
                    Mở
                  </Link>
                }
              />
            </Section>

            <Section id="voice" title="Giọng đọc" Icon={Mic} sub="Giọng đọc thuộc về bộ nhận diện, không phải về máy.">
              <Row
                label="Chọn giọng ở tab Giọng đọc của kit"
                sub="Hai kênh dùng hai giọng khác nhau là chuyện bình thường, nên không có một giọng chung ở đây."
                right={
                  <Link href="/studio/kits" className="st-btn st-sm">
                    Mở Bộ nhận diện
                  </Link>
                }
              />
            </Section>

            <Section id="notify" title="Thông báo" Icon={Bell} sub="Một dây chuyền chạy lúc 4 giờ sáng chỉ hữu ích nếu nó biết gọi bạn.">
              <Row
                label="Video dựng xong"
                sub="Gửi kèm tệp mp4 vào chat đã nối"
                right={<span className="st-badge st-grey">{deliveryOn() ? 'đang bật' : 'đang tắt'}</span>}
              />
              <Row
                label="Bước lỗi"
                sub="Gửi tên bước và lý do, ngay khi bước đó hỏng"
                right={<span className="st-badge st-grey">{deliveryOn() ? 'đang bật' : 'đang tắt'}</span>}
              />
              <Row label="Kênh nhận" sub="Hiện chỉ có Telegram. Email và web push chưa làm." right={<a href="#telegram" className="st-btn st-sm">Telegram</a>} />
            </Section>

            <Section id="telegram" title="Telegram" Icon={Send} sub="Nối một chat bằng mã dùng một lần.">
              {can(t, 'deliver') ? (
                <TelegramSettings
                  blocked={telegramBlocked()}
                  chatId={chatId()}
                  enabled={getSetting('telegram.enabled', '0') === '1' && Boolean(chatId())}
                />
              ) : (
                <p data-testid="settings-denied" className="text-sm text-muted-foreground">
                  Chế độ này không đổi được cài đặt gửi thông báo.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Trạng thái gửi: <b>{deliveryOn() ? 'bật' : 'tắt'}</b>
              </p>
            </Section>

            <Section id="facebook" title="Facebook" Icon={Share2} sub="Trang đã nối là nơi bước Đăng gửi bài và video tới.">
              {/* The SPA's panel draws itself dark with inline hex — it cannot be reskinned from
                  here, and a second light-but-not-quite surface would read as a bug. So it gets
                  the bezel the phone preview and the layer canvas get: one dark surface, on
                  purpose, inside the pen. */}
              <div className="st-stage p-3">
                <FacebookConnect />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Cùng một bảng với trang Desoul Posting — nối ở đây là nối cho cả hai.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
