import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Brand rule 3: the word DESOUL is never typed — no font has the head in it. The Studio
 * sidebar shipped v1 and v2 with `Desoul` set in Source Sans; this is the test that makes that
 * a red build. `alt="DESOUL"` on the wordmark image is the one place the string belongs.
 */
function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the studio never types the wordmark', () => {
  it('has no DESOUL / Desoul as JSX text or a string literal', () => {
    const hits: string[] = [];
    for (const f of tsxFiles(path.join(process.cwd(), 'app', 'studio'))) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((raw, i) => {
        const line = raw.trim();
        if (line.includes('alt=')) return;
        if (/^(DESOUL|Desoul)$/.test(line) || />\s*(DESOUL|Desoul)\s*</.test(line) || /['"`](DESOUL|Desoul)['"`]/.test(line)) {
          hits.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
