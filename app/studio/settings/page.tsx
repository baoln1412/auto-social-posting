import { chatId, deliveryOn, telegramBlocked } from '@/lib/studio/deliver';
import { getSetting } from '@/lib/studio/settings';
import { can, tier } from '@/lib/studio/tier';
import { TelegramSettings } from '../components/TelegramSettings';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const t = tier();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Quyền hiện tại: <span className="font-mono text-xs uppercase">{t}</span>
        </p>
      </header>

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
        Trạng thái gửi: <span className="font-mono">{deliveryOn() ? 'bật' : 'tắt'}</span>
      </p>
    </div>
  );
}
