/**
 * Local data client.
 *
 * Previously backed by hosted Supabase; now backed by an embedded SQLite
 * database (see ./db.ts) so all data stays on this machine. The function
 * names and the returned `.from(...)` query-builder surface are kept
 * identical to the old supabase-js client, so every API route that calls
 * `getSupabaseServer()` continues to work without changes.
 */

import { getLocalClient, type LocalClient } from './db';

/**
 * Server-side data client (formerly service-role Supabase).
 * Used in API routes for reading and writing posts, pages, feeds, channels.
 */
export function getSupabaseServer(): LocalClient {
  return getLocalClient();
}

/**
 * Anon data client (kept for API compatibility — same local backend).
 */
export function getSupabaseAnon(): LocalClient {
  return getLocalClient();
}
