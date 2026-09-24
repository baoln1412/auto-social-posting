import { listMedia, quotaOf } from '@/lib/studio/assets';
import { AssetsView } from '../components/AssetsView';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AssetsPage() {
  const media = listMedia();
  return (
    <>
      <PageHeader title="Kho tài nguyên" sub="Ảnh nền, video nền, nhãn dán và nhạc của riêng bạn. Chỉ tải lên — không lấy từ nơi khác." />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <AssetsView media={media} quota={quotaOf(media.map((m) => ({ bytes: m.bytes })))} />
      </div>
      </div>
    </>
  );
}
