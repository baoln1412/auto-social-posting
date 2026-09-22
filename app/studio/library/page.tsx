import { listLibrary } from '@/lib/studio/library';
import { tier } from '@/lib/studio/tier';
import { visibleChannelIds } from '@/lib/studio/visible';
import { LibraryView } from '../components/LibraryView';
import libTour from '@/lib/studio/tours/library.json';
import { Tour } from '../components/Tour';

export const dynamic = 'force-dynamic';

export default function LibraryPage() {
  const items = listLibrary({ channelIds: visibleChannelIds(tier()) });
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Thư viện</h1>
        <p className="text-sm text-muted-foreground">
          Mọi lượt chạy, theo ngày. Tìm được bằng chính đường dẫn bạn đã dán.
        </p>
      </header>
      <LibraryView items={items} />
      <Tour id="library" steps={libTour} />
    </div>
  );
}
