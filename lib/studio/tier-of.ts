/**
 * A channel's own tier, without touching request headers — `tier()` needs a request scope and
 * the run machine also runs from tests and (later) from a queue.
 */
import type { Tier } from './tier';
import type { Channel } from './steps/types';

export function tierOf(c: Channel): Tier {
  return c.tier_min === 'demo' || c.tier_min === 'member' ? c.tier_min : 'owner';
}
