import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Task cards, each opening the screen that does it. */
const CARDS = [
  {
    href: '/studio',
    title: 'Làm một video từ bài có sẵn',
    body: 'Chọn kênh, chọn kiểu, bấm Bắt đầu. Mỗi bước hiện kết quả và chi phí trước khi chạy bước sau.',
  },
  {
    href: '/studio/channels/new',
    title: 'Thêm một nguồn mới',
    body: 'Năm bước. Bước hai bắt buộc lấy được bài thật — kênh hỏng chỉ lộ ra lúc 4 giờ sáng.',
  },
  {
    href: '/studio/kits',
    title: 'Đổi diện mạo của kênh',
    body: 'Cùng một tiêu đề qua hai bộ nhận diện ra hai kiểu thẻ khác nhau. Sửa ở tab, xem ngay trên khung.',
  },
  {
    href: '/studio/assets',
    title: 'Dùng ảnh nền và nhãn dán của mình',
    body: 'Tải lên rồi chọn trong tab Khung hình hoặc Nhãn dán. Giới hạn 50 MB / 30 tệp.',
  },
  {
    href: '/studio/library',
    title: 'Tìm lại một video đã dựng',
    body: 'Tìm bằng chính đường dẫn bạn đã dán, hoặc theo kênh và ngày.',
  },
];

export default function GuidePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Hướng dẫn</h1>
        <p className="text-sm text-muted-foreground">Mỗi thẻ mở thẳng màn hình làm việc đó.</p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link href={c.href} data-testid="guide-card" className="card-warm block h-full p-4">
              <h2 className="mb-1 text-sm font-semibold">{c.title}</h2>
              <p className="text-xs text-muted-foreground">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
