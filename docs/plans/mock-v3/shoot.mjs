import { chromium } from '@playwright/test';
import path from 'node:path';
const dir = path.resolve('docs/plans/mock-v3');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })).newPage();
for (const f of process.argv.slice(2)) {
  await p.goto('file://' + path.join(dir, f + '.html'));
  await p.waitForTimeout(1200); // fonts
  await p.screenshot({ path: path.join(dir, f + '.png'), fullPage: false });
  console.log('shot', f);
}
await b.close();
