/**
 * What a tier may see, not merely what it may run.
 *
 * mayUseChannel already refused a demo visitor's *runs* on an owner channel, but every screen
 * still listed those channels and their finished videos by name. A seam that blocks the
 * button and shows the content is a decoration.
 */
import { studioDb } from './db';
import { mayUseChannel, type Tier } from './tier';
import type { Channel } from './steps/types';

export function visibleChannels(tier: Tier): Channel[] {
  return (studioDb().prepare('SELECT * FROM studio_channels ORDER BY created_at').all() as Channel[])
    .filter((c) => mayUseChannel(tier, c.tier_min));
}

export function visibleChannelIds(tier: Tier): Set<string> {
  return new Set(visibleChannels(tier).map((c) => c.id));
}
