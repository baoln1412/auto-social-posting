import { chatId, deliveryOn, telegramBlocked } from '@/lib/studio/deliver';
import { getSetting } from '@/lib/studio/settings';
import { can, tier } from '@/lib/studio/tier';
import { TelegramSettings } from '../components/TelegramSettings';

import { PageHeader } from '@/app/studio/components/PageHeader';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const t = tier();
  return (
    <>
      <PageHeader title="Cài đặt" sub={<>Quyền hiện tại: <b>{t}</b></>} />
      <div className="st-content">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">

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

      <p className="text-xs text-muted-foreground">
        Trạng thái gửi: <b>{deliveryOn() ? 'bật' : 'tắt'}</b>
      </p>
      </div>
      </div>
    </>
  );
}
