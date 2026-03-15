/**
 * Server-side Supabase client.
 *
 * Uses the service-role key for server-side writes (pipeline),
 * and the anon key for client-side reads (via NEXT_PUBLIC_ env vars).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverClient: SupabaseClient | null = null;

/**
 * Server-side Supabase client with service-role privileges.
 * Used in API routes for reading and writing crime_posts.
 */
export function getSupabaseServer(): SupabaseClient {
  if (!serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    serverClient = createClient(url, key, {
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    });
  }
  return serverClient;
}

/**
 * Anon Supabase client for client-side reads.
 */
let anonClient: SupabaseClient | null = null;

export function getSupabaseAnon(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    anonClient = createClient(url, key);
  }
  return anonClient;
}
