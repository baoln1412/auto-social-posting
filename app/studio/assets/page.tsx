import { listMedia, quotaOf } from '@/lib/studio/assets';
import { AssetsView } from '../components/AssetsView';

export const dynamic = 'force-dynamic';

export default function AssetsPage() {
  const media = listMedia();
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Kho tài nguyên</h1>
        <p className="text-sm text-muted-foreground">
          Ảnh nền, nhãn dán và nhạc của riêng bạn. Chỉ tải lên — không lấy từ nơi khác.
        </p>
      </header>
      <AssetsView media={media} quota={quotaOf(media.map((m) => ({ bytes: m.bytes })))} />
    </div>
  );
}
