import fs from 'node:fs';
import path from 'node:path';

/**
 * When the crawler runs by itself, read off the launchd plist that actually schedules it —
 * the plist is the schedule, so the screen can never say something the machine does not do.
 * Server only (reads a file).
 */
export function scheduleText(plist = path.join(process.cwd(), 'deploy', 'com.immigration.pipeline.plist')): string {
  try {
    const xml = fs.readFileSync(plist, 'utf8');
    const times = [...xml.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/g)]
      .map((m) => `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`);
    if (times.length) return `Tự chạy ${times.length} lần mỗi ngày — ${times.join(' · ')}.`;
    const every = /<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(xml);
    if (every) return `Tự chạy mỗi ${Math.round(Number(every[1]) / 3600)} giờ.`;
  } catch {
    /* no plist on this machine is a fact worth saying, not a crash */
  }
  return 'Chưa tìm thấy lịch tự chạy trên máy này.';
}
