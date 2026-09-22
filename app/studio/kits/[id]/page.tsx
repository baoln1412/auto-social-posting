import { notFound } from 'next/navigation';
import fs from 'node:fs';
import { studioDb } from '@/lib/studio/db';
import { kitSchema, listPresetFiles } from '@/lib/studio/kits/schema';
import type { Kit } from '@/lib/studio/steps/types';
import { KitEditor, type FieldSpec, type TabSpec } from '../../components/KitEditor';
import captionPresets from '@/deploy/assets/caption-presets.json';

export const dynamic = 'force-dynamic';

const LABELS: Record<string, string> = {
  identity: 'Nhận diện',
  post: 'Bài đăng',
  card: 'Ảnh thẻ',
  voice: 'Giọng đọc',
  captions: 'Phụ đề',
  frame: 'Khung hình',
  stickers: 'Nhãn dán',
  signature: 'Chữ ký',
  music: 'Nhạc nền',
};

/** The schema is the field list. A tab the schema does not define cannot be edited into one. */
function fieldsOf(def: Record<string, any>): FieldSpec[] {
  return Object.entries(def.properties ?? {})
    .filter(([k]) => k !== 'preset')
    .map(([key, p]: [string, any]): FieldSpec => {
      if (p.enum) return { key, label: key, type: 'enum', options: p.enum };
      if (p.type === 'boolean') return { key, label: key, type: 'boolean' };
      if (p.type === 'number' || p.type === 'integer') {
        return { key, label: key, type: 'number', min: p.minimum, max: p.maximum };
      }
      return { key, label: key, type: 'text' };
    });
}

export default function KitEditorPage({ params }: { params: { id: string } }) {
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

  const tabs: TabSpec[] = Object.keys(LABELS)
    .filter((k) => defs[k])
    .map((key) => ({
      key,
      label: LABELS[key],
      fields: fieldsOf(defs[key]),
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
      <KitEditor kit={kit} tabs={tabs} />
    </div>
  );
}
