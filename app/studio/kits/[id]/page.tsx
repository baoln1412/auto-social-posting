import { notFound } from 'next/navigation';
import fs from 'node:fs';
import path from 'node:path';
import { studioDb } from '@/lib/studio/db';
import { kitSchema, listPresetFiles } from '@/lib/studio/kits/schema';
import { listMedia, type MediaKind } from '@/lib/studio/assets';
import type { Kit } from '@/lib/studio/steps/types';
import { KitEditor, type FieldSpec, type TabSpec } from '../../components/KitEditor';
import { TAB_LABELS, labelFor } from '@/lib/studio/kits/labels';
import captionPresets from '@/deploy/assets/caption-presets.json';

export const dynamic = 'force-dynamic';

/** Tab order on the strip — the order of the reference's own tabs. */
const TAB_ORDER = ['identity', 'post', 'voice', 'frame', 'card', 'captions', 'signature', 'stickers', 'music'];

/**
 * The schema is the field list; labels.ts is the names. A tab the schema does not define
 * cannot be edited into one, and a field labels.ts does not name shows a ⚠ rather than its
 * own key — tests/unit/labels.test.ts is what keeps that from happening.
 */
function fieldsOf(tab: string, def: Record<string, any>): FieldSpec[] {
  return Object.entries(def.properties ?? {})
    .filter(([k]) => k !== 'preset')
    .map(([key, p]: [string, any]): FieldSpec => {
      const { label, hint } = labelFor(tab, key);
      const base = { key, label, hint };
      if (p.enum) return { ...base, type: 'enum', options: p.enum };
      if (p.type === 'boolean') return { ...base, type: 'boolean' };
      if (p.type === 'array') return { ...base, type: 'list' };
      // A hex pattern is a colour; a text box for "#F8EF63" is a typo waiting to happen.
      if (typeof p.pattern === 'string' && p.pattern.includes('0-9a-fA-F')) {
        return { ...base, type: 'color' };
      }
      if (p.type === 'number' || p.type === 'integer') {
        return { ...base, type: 'number', min: p.minimum, max: p.maximum };
      }
      return { ...base, type: 'text' };
    });
}

export default function KitEditorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { run?: string };
}) {
  const row = studioDb()
    .prepare('SELECT id, name, json FROM studio_kits WHERE id=?')
    .get(params.id) as { id: string; name: string; json: string } | undefined;
  if (!row) notFound();

  let kit: Kit;
  try {
    kit = JSON.parse(row.json);
  } catch {
    kit = { id: row.id, name: row.name };
  }

  const defs = kitSchema().definitions ?? {};
  const files = listPresetFiles();

  // Which kit field an uploaded file lands in, per tab. A tab with no entry shows no uploads.
  const MEDIA_FOR: Record<string, { kind: MediaKind; field: string }> = {
    frame: { kind: 'bg', field: 'background' },
    stickers: { kind: 'sticker', field: 'set' },
    music: { kind: 'music', field: 'track' },
  };

  const tabs: TabSpec[] = TAB_ORDER.filter((k) => defs[k]).map((key) => ({
      key,
      label: TAB_LABELS[key]?.label ?? key,
      hint: TAB_LABELS[key]?.hint,
      fields: fieldsOf(key, defs[key]),
      media: MEDIA_FOR[key]
        ? listMedia(MEDIA_FOR[key].kind).map((m) => ({
            id: m.id,
            name: m.name,
            url: m.url,
            field: MEDIA_FOR[key].field,
          }))
        : undefined,
      presets:
        key === 'captions'
          ? // One file, two readers (app/lib/captionPresets.ts) — the wall comes from there,
            // not from a second copy in the kit pack.
            Object.entries(captionPresets as Record<string, { label?: string }>).map(([id]) => ({
              id,
              values: { preset: id },
            }))
          : files
              .filter((f) => f.tab === key)
              .map((f) => {
                const values = JSON.parse(fs.readFileSync(f.file, 'utf8')) as Record<string, unknown>;
                return { id: String(values.preset ?? ''), values };
              }),
    }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{row.name}</h1>
        <p className="text-sm text-muted-foreground">
          Mỗi thẻ dưới đây là một tab của bộ nhận diện, kèm trạng thái hiện tại.
        </p>
      </header>
      <KitEditor
        kit={kit}
        tabs={tabs}
        runId={searchParams.run}
        samplePlate={path.join(process.cwd(), 'public', 'studio-demo', 'card.png')}
      />
    </div>
  );
}
