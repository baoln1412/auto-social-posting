import { describe, it, expect } from 'vitest';
import { kitSchema } from '@/lib/studio/kits/schema';
import {
  CUSTOM_TABS,
  FIELD_LABELS,
  TAB_LABELS,
  TAB_ORDER,
  VALUE_LABELS,
  labelFor,
  valueLabel,
} from '@/lib/studio/kits/labels';

/**
 * The trap §9 names: "Schema keys are not labels." The kit editor shipped with `card.engine`
 * as a label because the form is generated from the schema. This is the test that makes
 * adding a field without naming it a red build rather than something the owner discovers.
 */
const schema = kitSchema();
const defs = schema.definitions as Record<string, { properties?: Record<string, unknown> }>;
/** Every definition the root offers as part of a kit — what an editor could put on screen. */
const kitTabs = Object.entries(schema.properties as Record<string, { $ref?: string }>)
  .filter(([, v]) => typeof v.$ref === 'string')
  .map(([k]) => k);

describe('every control has a Vietnamese name', () => {
  it('names every tab a kit has', () => {
    for (const tab of kitTabs) {
      expect(TAB_LABELS[tab]?.label, `tab ${tab}`).toBeTruthy();
    }
  });

  it('accounts for every tab — as a field form, or as a screen of its own', () => {
    // Adding a definition to the schema without deciding how it is edited leaves it
    // invisible, which is the same failure as leaving it unnamed.
    const known = new Set([...TAB_ORDER, ...CUSTOM_TABS]);
    expect(kitTabs.filter((t) => !known.has(t))).toEqual([]);
  });

  it('names every field of every field-form tab', () => {
    const missing: string[] = [];
    for (const tab of TAB_ORDER) {
      for (const field of Object.keys(defs[tab]?.properties ?? {})) {
        if (field === 'preset') continue; // the editor's own preset picker, not a field
        if (!FIELD_LABELS[`${tab}.${field}`]) missing.push(`${tab}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names every enum value that is not already readable', () => {
    const missing: string[] = [];
    for (const tab of TAB_ORDER) {
      for (const [field, spec] of Object.entries(defs[tab]?.properties ?? {})) {
        const options = (spec as { enum?: string[] }).enum;
        for (const v of options ?? []) {
          // A value that is already a word a person would say needs no translation:
          // "4:5", "9:16". Everything else is an identifier.
          // Font names are brand names, not words to translate, and the face list is
          // generated from what is actually on disk — pinning labels to it would mean
          // editing this file every time a face is added.
          if (/^[\d:.]+$/.test(v) || field === 'font') continue;
          // Asked the way the UI asks: valueLabel() consults the per-field map first, so a
          // volume can read "Tắt" where the shared table says "Không". Checking the shared
          // table alone called a named value missing.
          if (valueLabel(v, `${tab}.${field}`) === v) missing.push(`${tab}.${field} = ${v}`);
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
