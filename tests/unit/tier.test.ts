import { describe, it, expect } from 'vitest';
import { can, mayUseChannel, resolveTier, signTier } from '@/lib/studio/tier';

const SECRET = 'test-secret';

describe('can()', () => {
  it('gives the owner everything', () => {
    for (const f of ['run', 'spend', 'edit_kit', 'publish'] as const) {
      expect(can('owner', f)).toBe(true);
    }
  });

  it('gives demo run and nothing else', () => {
    expect(can('demo', 'run')).toBe(true);
    expect(can('demo', 'spend')).toBe(false);
    expect(can('demo', 'edit_kit')).toBe(false);
    expect(can('demo', 'publish')).toBe(false);
  });

  it('lets a member work but not publish', () => {
    expect(can('member', 'run')).toBe(true);
    expect(can('member', 'edit_kit')).toBe(true);
    expect(can('member', 'publish')).toBe(false);
  });
});

describe('resolveTier()', () => {
  it('falls back to owner when nothing is set', () => {
    expect(resolveTier({})).toBe('owner');
  });

  it('reads a correctly signed cookie', () => {
    const cookie = signTier('demo', SECRET);
    expect(resolveTier({ cookie, secret: SECRET })).toBe('demo');
  });

  it('ignores a tampered cookie rather than trusting it', () => {
    const cookie = signTier('demo', SECRET).replace('demo', 'owner');
    expect(resolveTier({ cookie, secret: SECRET, env: 'demo' })).toBe('demo');
  });

  it('ignores a cookie when no secret is configured', () => {
    expect(resolveTier({ cookie: 'owner.deadbeef', env: 'demo' })).toBe('demo');
  });

  it('ignores a cookie signed with a different secret', () => {
    const cookie = signTier('owner', 'other-secret');
    expect(resolveTier({ cookie, secret: SECRET, env: 'demo' })).toBe('demo');
  });

  it('treats a Cloudflare Access identity as the owner', () => {
    expect(resolveTier({ accessEmail: 'baoln1412@gmail.com', env: 'demo' })).toBe('owner');
  });

  it('prefers a signed cookie over the Access header', () => {
    const cookie = signTier('demo', SECRET);
    expect(resolveTier({ cookie, secret: SECRET, accessEmail: 'baoln1412@gmail.com' })).toBe('demo');
  });

  it('reads DESOUL_TIER when there is no cookie and no header', () => {
    expect(resolveTier({ env: 'member' })).toBe('member');
  });

  it('rejects a DESOUL_TIER that is not a tier', () => {
    expect(resolveTier({ env: 'admin' })).toBe('owner');
  });
});

describe('mayUseChannel()', () => {
  it('lets the owner into every channel', () => {
    for (const m of ['owner', 'member', 'demo']) expect(can('owner', 'run') && mayUseChannel('owner', m)).toBe(true);
  });

  it('keeps a demo visitor out of an owner channel — that is the path that spends', () => {
    expect(mayUseChannel('demo', 'owner')).toBe(false);
    expect(mayUseChannel('demo', 'member')).toBe(false);
    expect(mayUseChannel('demo', 'demo')).toBe(true);
  });

  it('lets a member into member and demo channels only', () => {
    expect(mayUseChannel('member', 'owner')).toBe(false);
    expect(mayUseChannel('member', 'member')).toBe(true);
  });
});
