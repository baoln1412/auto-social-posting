/**
 * Who is looking, and what they are allowed to spend.
 *
 * One table (`GRANTS`), not tier conditions scattered through components — a
 * feature is added by adding a column here, and every screen asks the same
 * question. `resolveTier` is pure so it can be tested; `tier()` is the thin
 * request-scoped wrapper around it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Tier = 'owner' | 'member' | 'demo';
export type Feature = 'run' | 'spend' | 'edit_kit' | 'publish';

const TIERS = ['owner', 'member', 'demo'] as const;

const GRANTS: Record<Tier, readonly Feature[]> = {
  owner: ['run', 'spend', 'edit_kit', 'publish'],
  member: ['run', 'spend', 'edit_kit'],
  demo: ['run'],
};

export function can(t: Tier, f: Feature): boolean {
  return GRANTS[t].includes(f);
}

function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}

/** Cookie value: `<tier>.<hex hmac>`. */
export function signTier(t: Tier, secret: string): string {
  return `${t}.${createHmac('sha256', secret).update(t).digest('hex')}`;
}

/** The tier a cookie proves, or null. An unsigned, mis-signed or unverifiable cookie proves nothing. */
function verifyTier(cookie: string | undefined, secret: string | undefined): Tier | null {
  if (!cookie || !secret) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot < 1) return null;
  const claimed = cookie.slice(0, dot);
  if (!isTier(claimed)) return null;
  const got = Buffer.from(cookie.slice(dot + 1), 'hex');
  const want = createHmac('sha256', secret).update(claimed).digest();
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  return claimed;
}

/**
 * First of: a signed `desoul_tier` cookie · a Cloudflare Access identity (the owner is
 * the only one who gets through Access) · `DESOUL_TIER` · owner.
 */
export function resolveTier(src: {
  cookie?: string;
  accessEmail?: string;
  env?: string;
  secret?: string;
}): Tier {
  return (
    verifyTier(src.cookie, src.secret) ??
    (src.accessEmail ? 'owner' : null) ??
    (isTier(src.env) ? src.env : null) ??
    'owner'
  );
}

/** The tier of the current request. Server components / route handlers only. */
export function tier(): Tier {
  // Imported lazily: `next/headers` throws outside a request scope, and this module's
  // pure half is unit-tested in plain node.
  const { cookies, headers } = require('next/headers') as typeof import('next/headers');
  return resolveTier({
    cookie: cookies().get('desoul_tier')?.value,
    accessEmail: headers().get('Cf-Access-Authenticated-User-Email') ?? undefined,
    env: process.env.DESOUL_TIER,
    secret: process.env.STUDIO_COOKIE_SECRET,
  });
}

/**
 * May this tier open this channel at all? A demo visitor reaching an owner channel is the
 * path that would spend real money, so it is a check, not a UI decision.
 */
export function mayUseChannel(t: Tier, channelTierMin: string): boolean {
  if (t === 'owner') return true;
  if (t === 'member') return channelTierMin !== 'owner';
  return channelTierMin === 'demo';
}
