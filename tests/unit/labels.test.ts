import { describe, it, expect } from 'vitest';
import { kitSchema } from '@/lib/studio/kits/schema';
import { FIELD_LABELS, TAB_LABELS, VALUE_LABELS, labelFor, valueLabel } from '@/lib/studio/kits/labels';

/**
 * The trap §9 names: "Schema keys are not labels." The kit editor shipped with `card.engine`
 * as a label because the form is generated from the schema. This is the test that makes
 * adding a field without naming it a red build rather than something the owner discovers.
 */
const defs = kitSchema().definitions as Record<string, { properties: Record<string, unknown> }>;

describe('every control has a Vietnamese name', () => {
  it('names every tab', () => {
    for (const tab of Object.keys(defs)) {
      expect(TAB_LABELS[tab]?.label, `tab ${tab}`).toBeTruthy();
    }
  });

  it('names every field of every tab', () => {
    const missing: string[] = [];
    for (const [tab, def] of Object.entries(defs)) {
      for (const field of Object.keys(def.properties ?? {})) {
        if (field === 'preset') continue; // the editor's own preset picker, not a field
        if (!FIELD_LABELS[`${tab}.${field}`]) missing.push(`${tab}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names every enum value that is not already readable', () => {
    const missing: string[] = [];
    for (const [tab, def] of Object.entries(defs)) {
      for (const [field, spec] of Object.entries(def.properties ?? {})) {
        const options = (spec as { enum?: string[] }).enum;
        for (const v of options ?? []) {
          // A value that is already a word a person would say needs no translation:
          // "4:5", "9:16". Everything else is an identifier.
          if (/^[\d:.]+$/.test(v) || /^BeVietnamPro-/.test(v)) continue;
          if (!VALUE_LABELS[v]) missing.push(`${tab}.${field} = ${v}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('never labels anything with its own schema key', () => {
    for (const [key, l] of Object.entries(FIELD_LABELS)) {
      const field = key.split('.')[1];
      expect(l.label, key).not.toBe(field);
    }
  });

  it('marks an unnamed control rather than quietly showing its key', () => {
    // A key printed as-is looks like a label and hides the omission; a ⚠ is a bug report.
    expect(labelFor('card', 'somethingNew').label).toContain('⚠');
    expect(valueLabel('khong-biet')).toBe('khong-biet');
  });

  it('gives the labels a Vietnamese reader actually needs a hint for', () => {
    expect(FIELD_LABELS['card.engine'].hint).toBeTruthy();
    expect(FIELD_LABELS['post.narration'].hint).toBeTruthy();
    expect(FIELD_LABELS['frame.durationBand'].hint).toBeTruthy();
  });
});
