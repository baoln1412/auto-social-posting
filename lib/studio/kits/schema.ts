/**
 * Kit loading and validation against the draft-07 schema.
 *
 * The schema is the portable half of the plan's Approach A: AILP adopts the *data*, not this
 * React. So it lives in ~/research-console/brand/kits, symlinked in at deploy/assets/kits,
 * and every field in it maps to something an engine already accepts — a kit cannot promise a
 * look no renderer can produce.
 */
import fs from 'node:fs';
import path from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';

export const KITS_DIR = path.join(process.cwd(), 'deploy', 'assets', 'kits');

const ajv = new Ajv({ allErrors: true, strict: false });

let root: ValidateFunction | null = null;
const tabs = new Map<string, ValidateFunction>();

export function kitSchema(): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(KITS_DIR, 'kit.schema.json'), 'utf8'));
}

function message(v: ValidateFunction): string {
  return (v.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? `: ${(e.params as any).additionalProperty}` : ''}`)
    .join('; ');
}

/** Null when valid, otherwise why not. */
export function validateKit(kit: unknown): string | null {
  root ??= ajv.compile(kitSchema());
  return root(kit) ? null : message(root);
}

export function validatePreset(tab: string, preset: unknown): string | null {
  let v = tabs.get(tab);
  if (!v) {
    const defs = kitSchema().definitions ?? {};
    if (!defs[tab]) return `Không có tab "${tab}" trong schema.`;
    v = ajv.compile({ ...defs[tab], definitions: defs });
    tabs.set(tab, v);
  }
  return v(preset) ? null : message(v);
}

export function listKitFiles(): string[] {
  const dir = path.join(KITS_DIR, 'kits');
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)).sort()
    : [];
}

export function listPresetFiles(): { tab: string; file: string }[] {
  const dir = path.join(KITS_DIR, 'presets');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((tab) => {
    const sub = path.join(dir, tab);
    if (!fs.statSync(sub).isDirectory()) return [];
    return fs
      .readdirSync(sub)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ tab, file: path.join(sub, f) }));
  });
}

export function loadKitFile(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
