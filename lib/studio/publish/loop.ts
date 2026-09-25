/**
 * The minute hand. Anything in `studio_publish` whose time has come goes out.
 *
 * Facebook schedules its own posts server-side (`scheduled_publish_time`), so for a Facebook
 * destination this loop only has to hand the post over once. Telegram and the library have no
 * scheduler of their own, and a row that said 18:00 with nothing running would be v2's lie
 * again — so there is a loop.
 *
 * It starts from Studio's own server code — the layout and the publish route — and not from
 * `instrumentation.ts`: Next 14 compiles that file for the edge runtime as well, and the
 * `NEXT_RUNTIME` guard does not stop webpack from following the import, so duckdb, sharp and
 * rss-parser all got pulled into an edge bundle that cannot load them. What this costs is a
 * loop that begins on the server's first Studio request rather than at boot. What it does not
 * cost is a scheduled Facebook post, which Meta holds and publishes on its own clock.
 */
import { tick } from './queue';
import { sendRow } from './send';

let timer: NodeJS.Timeout | null = null;
let daily: NodeJS.Timeout | null = null;
let running = false;

export function startPublishLoop(everyMs = 60_000): void {
  if (timer) return;
  timer = setInterval(async () => {
    // A slow Graph upload must not have a second tick starting on top of it.
    if (running) return;
    running = true;
    try {
      const out = await tick(sendRow);
      if (out.sent || out.failed) console.log(`[studio] đăng: ${out.sent} gửi, ${out.failed} lỗi`);
    } catch (e) {
      console.error('[studio] vòng đăng lỗi:', e);
    } finally {
      running = false;
    }
  }, everyMs);
  // Never hold the process open on its own account.
  timer.unref?.();
}

/**
 * The other clock: how the posts that went out are doing. Once a day is the cadence the
 * numbers move at, and `fetchAllMetrics` skips anything read in the last twelve hours, so
 * an extra pass after a restart costs one query and no Graph calls.
 */
export function startMetricsLoop(everyMs = 6 * 3_600_000): void {
  if (daily) return;
  const pass = async () => {
    try {
      const { fetchAllMetrics } = await import('../metrics');
      const out = await fetchAllMetrics();
      if (out.read || out.failed) console.log(`[studio] số liệu: ${out.read} đọc, ${out.failed} lỗi`);
    } catch (e) {
      console.error('[studio] vòng số liệu lỗi:', e);
    }
  };
  daily = setInterval(pass, everyMs);
  daily.unref?.();
  void pass();
}
