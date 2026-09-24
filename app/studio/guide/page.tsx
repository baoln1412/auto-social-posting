import Link from 'next/link';
import { Image as ImageIcon, Link2, Palette, Rss, Send } from 'lucide-react';

import { PageHeader } from '@/app/studio/components/PageHeader';
import { RestartTour } from '@/app/studio/components/RestartTour';

export const dynamic = 'force-dynamic';

/**
 * The guide hub the reference draws (tv-17): pick the job, then read it as numbered steps.
 *
 * The old page was five cards and nothing else, so every card was a promise the page did not
 * keep — it linked to a screen and left you there. The steps below are the keeping.
 */
const GUIDES = [
  {
    id: 'link',
    chip: 'Từ một link',
    Icon: Link2,
    href: '/studio',
    title: 'Làm video từ một link',
    line: 'Dán một bài Threads, Reddit, Facebook hay bài báo và theo dõi từng bước dựng.',
    steps: [
      {
        t: 'Dán link vào ô Tạo video',
        b: 'Link phải trỏ tới chính bài viết, không phải trang hồ sơ. Chip dưới ô nói nó đọc ra nguồn nào trước khi bạn bấm gì.',
      },
      {
        t: 'Chọn kênh, rồi bấm nút video',
        b: 'Kênh quyết định bộ nhận diện, thị trường và nơi đăng. Tuỳ chỉnh chỉ đổi riêng lượt chạy này.',
      },
      {
        t: 'Đi qua năm bước',
        b: 'Đọc bài · Viết bài · Ảnh · Video · Đăng. Mỗi bước hiện kết quả và chi phí ước tính trước khi bước sau chạy.',
      },
    ],
  },
  {
    id: 'auto',
    chip: 'Nguồn tự động',
    Icon: Rss,
    href: '/studio/pipeline',
    title: 'Bật nguồn tự động',
    line: 'Dây chuyền crawl chạy theo lịch và để sẵn bài Gold cho bạn chọn.',
    steps: [
      {
        t: 'Khai báo nguồn của thị trường',
        b: 'Mỗi thị trường có danh sách nguồn riêng. Bước kiểm tra bắt buộc lấy được bài thật — nguồn hỏng chỉ lộ ra lúc 4 giờ sáng.',
      },
      {
        t: 'Đặt lịch chạy',
        b: 'Lịch đọc từ launchd, không phải từ một ô trong trang. Dòng trạng thái ở Tạo video luôn nói lần chạy gần nhất.',
      },
      {
        t: 'Dựng từ gợi ý',
        b: 'Bài Gold chưa có video hiện thành thẻ gợi ý. Bấm nút video trên thẻ là bắt đầu đúng bài đó.',
      },
    ],
  },
  {
    id: 'kit',
    chip: 'Bộ nhận diện',
    Icon: Palette,
    href: '/studio/kits',
    title: 'Cấu hình diện mạo video',
    line: 'Một bộ nhận diện giữ màu, phông, khung, nhạc và giọng đọc của kênh.',
    steps: [
      {
        t: 'Mở Bộ nhận diện rồi chọn kit của kênh',
        b: 'Mỗi kênh trỏ tới một kit. Sửa kit là đổi mọi video sau của kênh đó, không đổi video đã dựng.',
      },
      {
        t: 'Sửa từng tab, xem ngay trên khung',
        b: 'Nhận diện · Thẻ · Khung hình · Phụ đề · Nhãn dán · Chữ ký · Giọng đọc · Bài đăng. Khung bên trái vẽ lại sau mỗi lần đổi.',
      },
      {
        t: 'Dùng ảnh nền và nhãn dán của mình',
        b: 'Tải lên ở Kho tài nguyên rồi chọn lại trong tab Khung hình hoặc Nhãn dán. Giới hạn 50 MB / 30 tệp.',
      },
      {
        t: 'Kiểm tra bố cục trước khi lưu',
        b: 'Thẻ 9:16 trong bố cục liền mạch sẽ cao hơn khung. Khung xem đo thật, nên lỗi đó lộ ra ở đây chứ không phải sau khi render.',
      },
    ],
  },
  {
    id: 'media',
    chip: 'Ảnh & cảnh',
    Icon: ImageIcon,
    href: '/studio/library',
    title: 'Sửa ảnh và cảnh trước khi dựng',
    line: 'Cùng một ảnh đi ra ba nơi: bài Facebook, ảnh bìa video, và thẻ trong video.',
    steps: [
      {
        t: 'Mở một bài rồi vào bước Ảnh',
        b: 'Chọn tỉ lệ, đổi ảnh nền bằng ảnh của bài hoặc ảnh bạn tải lên, bật ảnh tròn và dòng nhấn mạnh.',
      },
      {
        t: 'Lưu vào bài nếu muốn dùng lại',
        b: 'Lưu vào bài ghi thẳng vào bài trong kho — đúng chỗ trang Desoul Posting đọc, không phải một bản sao riêng của Studio.',
      },
      {
        t: 'Sửa cảnh ở bước Video',
        b: 'Mỗi cảnh có text gốc và text đã sửa. Nghe thử giọng đọc từng cảnh trước khi dựng cả video.',
      },
    ],
  },
  {
    id: 'telegram',
    chip: 'Telegram',
    Icon: Send,
    href: '/studio/settings',
    title: 'Nhận video qua Telegram',
    line: 'Video render xong tự về chat của bạn, kèm cảnh báo khi một bước hỏng.',
    steps: [
      {
        t: 'Kết nối bot trong Cài đặt',
        b: 'Dán token bot và chat id. Studio gửi thử một tin ngay để bạn biết nó nối được.',
      },
      {
        t: 'Chọn nhận gì',
        b: 'Video xong, bước lỗi, hoặc cả hai. Một dây chuyền chạy lúc 4 giờ sáng chỉ hữu ích nếu nó biết gọi bạn.',
      },
    ],
  },
] as const;


export default function GuidePage() {
  return (
    <>
      <PageHeader title="Hướng dẫn" sub="Hướng dẫn theo từng việc trong Studio." />
      <div className="st-content">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <header className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <span className="st-eyebrow">Trung tâm hướng dẫn</span>
              <h2
                className="text-[28px] font-bold leading-tight"
                style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
              >
                Chọn việc bạn muốn làm
              </h2>
              <p className="text-sm text-muted-foreground">
                Làm theo từng hướng dẫn, hoặc mở thẳng màn hình bạn cần.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <RestartTour />
              {GUIDES.map((g) => (
                <a key={g.id} href={`#guide-${g.id}`} data-testid="guide-jump" className="st-btn st-sm">
                  {g.chip}
                </a>
              ))}
            </div>
          </header>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDES.map((c) => (
              <li key={c.href + c.title}>
                <Link href={c.href} data-testid="guide-card" className="st-card flex h-full flex-col gap-2 p-4">
                  <span className="st-tile">
                    <c.Icon strokeWidth={2.25} />
                  </span>
                  <b className="text-[15px]">{c.title}</b>
                  <span className="text-[13px] leading-snug text-muted-foreground">{c.line}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-2 grid gap-x-8 gap-y-6 lg:grid-cols-2">
            {GUIDES.map((g, n) => (
              <section key={g.id} id={`guide-${g.id}`} data-testid="guide-detail" className="st-guide scroll-mt-6">
                <div className="mb-3 flex items-start gap-3">
                  <span className="st-tile">
                    <g.Icon strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0">
                    <span className="st-eyebrow">
                      Hướng dẫn <span className="st-num">{n + 1}</span>
                    </span>
                    <h3
                      className="text-[19px] font-bold leading-tight"
                      style={{ fontFamily: "'Baloo 2', system-ui, sans-serif" }}
                    >
                      {g.title}
                    </h3>
                    <p className="text-[13px] text-muted-foreground">{g.line}</p>
                  </div>
                </div>
                <ol className="flex flex-col gap-3">
                  {g.steps.map((s, k) => (
                    <li key={s.t} data-testid="guide-step" className="flex gap-3">
                      <span className="st-stepn st-num">{k + 1}</span>
                      <div className="min-w-0">
                        <b className="text-[14px]">{s.t}</b>
                        <p className="text-[12.5px] leading-snug text-muted-foreground">{s.b}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <Link href={g.href} className="st-btn st-sm mt-3 inline-flex">
                  Mở màn hình này →
                </Link>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
