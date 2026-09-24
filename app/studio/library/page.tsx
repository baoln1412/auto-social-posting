import { listLibrary } from '@/lib/studio/library';
import { tier } from '@/lib/studio/tier';
import { visibleChannelIds } from '@/lib/studio/visible';
import { LibraryView } from '../components/LibraryView';
import libTour from '@/lib/studio/tours/library.json';
import { Tour } from '../components/Tour';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function LibraryPage() {
  const items = listLibrary({ channelIds: visibleChannelIds(tier()) });
  return (
    <>
      <PageHeader title="Thư viện" sub="Mọi lượt chạy, theo ngày. Tìm được bằng chính đường dẫn bạn đã dán." />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <LibraryView items={items} />
      <Tour id="library" steps={libTour} />
      </div>
      </div>
    </>
  );
}
