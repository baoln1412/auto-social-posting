/**
 * Answers that are a pure function of their inputs, kept in `studio_cache`.
 *
 * On disk and not in a module-level Map, deliberately: Next gives each route its own module
 * graph, so a Map filled by the preview route would be empty in the advance route — the same
 * trap that made a three-minute render report no progress at all. A table is one instance.
 */
import { studioDb } from './db';

export function cacheGet<T>(key: string): T | null {
  const row = studioDb().prepare('SELECT value FROM studio_cache WHERE key=?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown): void {
  studioDb()
    .prepare('INSERT OR REPLACE INTO studio_cache (key, value) VALUES (?,?)')
    .run(key, JSON.stringify(value));
}

/** Run `make` once per key. A failure is not cached — a network blip is not an answer. */
export async function cached<T>(key: string, make: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const made = await make();
  cacheSet(key, made);
  return made;
}
