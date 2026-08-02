import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Serialize teardown → re-create for **stable-name** Realtime channels.
 *
 * ─── The bug this exists for ──────────────────────────────────────────
 * Channels whose name is the ROOM — `game:<id>`, `club:<handle>`,
 * `club-setup:<handle>`, `scratchpad:<id>` — can't take the random suffix
 * that [`channelDedupSuffix`](./channelDedup.ts) gives the per-client data
 * channels: every peer has to join the *same* topic or presence sees nobody
 * and broadcasts reach nobody. That leaves them exposed to two things, both
 * verified against `@supabase/realtime-js` 2.108.1:
 *
 *  1. **The client cache hands back a dying channel.** `RealtimeClient.channel(topic)`
 *     returns any existing instance with that topic. A channel is removed from
 *     `client.channels` only by its own `_onClose` handler — NOT by
 *     `removeChannel()`, which merely awaits `unsubscribe()` and then calls
 *     `teardown()`. So for the whole leave round-trip the old instance is still
 *     in the cache, and a remount gets it back: already unsubscribing, and
 *     `.subscribe()` on it never reaches SUBSCRIBED.
 *  2. **The server may reject a re-join that races the leave.** `unsubscribe()`
 *     sends `phx_leave` and waits for the ack. Joining the same topic on the
 *     same socket before that lands is a duplicate join. So evicting the client
 *     cache alone would NOT be enough — the wait is the actual fix.
 *
 * Either way the new mount gets no presence, no broadcasts, and no
 * postgres-changes until the next reconnect. Windows where it can happen:
 * StrictMode's dev double-mount, and club↔game navigation completing inside
 * the unsubscribe RTT.
 *
 * ─── Using it ─────────────────────────────────────────────────────────
 * Two calls, at the two ends of a channel's life:
 *
 *     const leaving = channelLeaving(roomName)      // create side
 *     if (leaving) void leaving.then(open)
 *     else open()
 *
 *     return () => { …; releaseChannel(ch) }        // teardown side
 *
 * The create side stays synchronous in the common case (nothing pending), so
 * a first mount joins on the spot; only a genuine re-create waits. Whoever
 * defers MUST guard with a cancelled flag — the effect can be torn down again
 * before its turn arrives.
 *
 * **Not for suffixed channels.** They can never collide by name, so they gain
 * nothing and should keep calling `supabase.removeChannel` directly.
 */

/**
 * In-flight teardowns, keyed by the bare channel name (what you passed to
 * `supabase.channel()`, without realtime-js's `realtime:` topic prefix).
 * Module-level on purpose: the races are BETWEEN component instances, so a
 * per-hook ref would never see the outgoing mount's teardown.
 */
const leaving = new Map<string, Promise<unknown>>()

/** realtime-js prefixes topics; our callers speak the bare name. */
function bareName(topic: string): string {
  return topic.replace(/^realtime:/, '')
}

/**
 * `supabase.removeChannel(ch)`, with the resulting promise parked where a
 * same-named re-create can find it. Always resolves (never rejects) — a
 * failed leave must not wedge every future join of that room, and by the time
 * `removeChannel` settles we've waited as long as we usefully can whether the
 * status was `ok`, `timed out`, or `error`.
 */
export function releaseChannel(ch: RealtimeChannel): Promise<unknown> {
  const name = bareName(ch.topic)
  const done = Promise.resolve(supabase.removeChannel(ch))
    .catch((err) => {
      console.error(`releaseChannel: removing "${name}" failed`, err)
    })
    .finally(() => {
      // Only clear if we're still the current teardown: a re-create that
      // already came and went could have parked a newer one under this name.
      if (leaving.get(name) === done) leaving.delete(name)
    })
  leaving.set(name, done)
  return done
}

/**
 * The in-flight teardown for `name`, or `null` if the room is free right now.
 * Callers await it before `supabase.channel(name)`; `null` is the fast path
 * that keeps a first mount synchronous.
 */
export function channelLeaving(name: string): Promise<unknown> | null {
  return leaving.get(name) ?? null
}

/** Test seam: drop all tracked teardowns. Not for app code. */
export function __resetChannelTeardowns(): void {
  leaving.clear()
}
