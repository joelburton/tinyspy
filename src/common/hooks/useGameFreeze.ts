import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { SetupMember } from '../lib/games'

/**
 * Per-game presence tracker. Returns whether the game is
 * "frozen" — i.e., not all expected players are currently
 * connected to the realtime channel — plus the list of
 * missing members.
 *
 * "Frozen" is distinct from "paused" (the club-level state
 * where a game isn't `common.club_active_game`'s active row).
 * A frozen game is open and active; it's just waiting for a
 * disconnected peer to come back. UI shows an overlay, click
 * handlers ignore, but no DB state changes.
 *
 * Built on Supabase Realtime **Presence** — the right primitive
 * for "who's connected with what identity." When a player joins
 * the channel they call `channel.track({ user_id })`; Presence's
 * `sync` event fires whenever the set of connected members
 * changes. We compare the connected set against the expected
 * member list (passed in by the caller, who knows the club's
 * roster) to decide whether the game is frozen.
 *
 * This hook does NOT subscribe to the channel itself — it
 * attaches to an already-created channel passed in by the caller.
 * That way the broadcast / postgres-changes subscriptions for a
 * game can share the same channel rather than racing on
 * independent lifecycles. (See `useGame`, which owns the
 * channel.)
 *
 * Usage:
 *
 *   const { frozen, missing } = useGameFreeze(channel, members)
 *
 * - `channel` is the per-game realtime channel. Pass `null` to
 *   mean "no channel yet"; frozen stays false until the first
 *   presence sync arrives.
 * - `members` is the club's full roster — the set of users
 *   expected to be at the game.
 *
 * See docs/wordknit.md for the wider pattern (Presence for
 * "who's here," Broadcast for events, no persisted ephemeral
 * state) and the future-rollout plan to tinyspy / psychic-num.
 */
export function useGameFreeze(
  channel: RealtimeChannel | null,
  members: SetupMember[],
): { frozen: boolean; missing: SetupMember[] } {
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(
    () => new Set(),
  )

  // Subscribe to the channel's presence sync events. Re-runs only
  // when the channel identity changes (e.g., the parent created a
  // new channel for a different game). When `channel` is null we
  // skip the subscription — `presentUserIds` retains its last
  // value, which is fine because channel goes null on unmount.
  useEffect(() => {
    if (!channel) return
    const ch = channel  // narrow inside the callback

    function recomputePresent() {
      // Presence state is { presenceKey: [{ user_id, ... }, ...] }
      // where presenceKey is per-tab/connection. Several tabs of
      // the same user are fine — we dedupe to user_ids.
      const state = ch.presenceState() as Record<
        string,
        Array<{ user_id?: string }>
      >
      const ids = new Set<string>()
      for (const list of Object.values(state)) {
        for (const entry of list) {
          if (entry.user_id) ids.add(entry.user_id)
        }
      }
      setPresentUserIds(ids)
    }

    // 'sync' fires whenever the merged presence state changes —
    // covers our own track() landing, peer joins, peer leaves.
    // Single source of truth; no separate 'join' / 'leave'
    // handlers needed.
    ch.on('presence', { event: 'sync' }, recomputePresent)
  }, [channel])

  // Derived on each render — cheap, and keeps the result reactive
  // to `members` changes without retriggering the effect.
  const missing = members.filter((m) => !presentUserIds.has(m.user_id))
  const frozen = members.length > 0 && missing.length > 0

  return { frozen, missing }
}
