import { listMedia, quotaOf } from '@/lib/studio/assets';
import { AssetsView } from '../components/AssetsView';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function AssetsPage() {
  const media = listMedia();
  return (
    <>
      <PageHeader title="Kho tài nguyên" sub="Ảnh nền, nhãn dán và nhạc của riêng bạn. Chỉ tải lên — không lấy từ nơi khác." />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <AssetsView media={media} quota={quotaOf(media.map((m) => ({ bytes: m.bytes })))} />
      </div>
      </div>
    </>
  );
}
