import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/supabase'
import { channelLeaving, releaseChannel } from '../../lib/supabase/channelTeardown'

/** One present member's location within the club orbit. `gameId` is
 *  the game they're viewing, or null if they're on the club page. */
export type ClubPresenceEntry = { userId: string; gameId: string | null }

/**
 * Join the club's presence channel (`club:<handle>`) and broadcast
 * where this client is within the club — on the club page, or viewing
 * a specific game. Returns the live roster of present members.
 *
 * Every connected member of a club's orbit joins this ONE channel
 * (the club page AND every game page of the club), so the roster
 * answers "who's here, and which game are they in?" in real time.
 * Presence expires automatically on disconnect — tab close,
 * navigation, or a network blip — which is exactly why it's a
 * reliable signal where a synced DB flag (`is_current_view`) isn't:
 * there's no write to miss.
 *
 * Two kinds of caller:
 *   - **ClubPage** passes `viewingGameId = null` (it's the club room)
 *     and uses the roster to light up the member strip + heal an
 *     abandoned current-view pointer.
 *   - **GamePage** passes `viewingGameId = <gameId>` and ignores the
 *     roster — it's here only to ANNOUNCE that a player is viewing
 *     that game, so the club page can see them.
 *
 * The channel name is the bare `club:<handle>` (no per-tab dedup
 * suffix): presence rosters are per-channel-name, so everyone must
 * share the exact name. Multiple tabs of one user collapse under the
 * `user_id` presence key.
 */
export function useClubPresence(
  clubHandle: string | null,
  viewingGameId: string | null,
  selfId: string,
): ClubPresenceEntry[] {
  const [roster, setRoster] = useState<ClubPresenceEntry[]>([])

  // Subscribe once per (club, location). The presence-sync handler
  // rebuilds the roster from the full channel state on every change.
  //
  // `viewingGameId` is in the deps but is effectively constant for a
  // given hook instance — ClubPage always passes null, and GamePage
  // is keyed by gameId (a different game is a fresh mount). So a
  // location change is handled by unmount-then-remount (ClubPage's
  // cleanup untracks; GamePage's mount tracks the new game), not by
  // re-tracking in place — which keeps this hook a plain subscribe.
  useEffect(() => {
    if (!clubHandle) return // no subscription; the hook returns [] below
    const room = `club:${clubHandle}`
    let cancelled = false
    let ch: RealtimeChannel | null = null

    function join() {
      // The cancelled guard matters only on the deferred path below: this
      // effect can be torn down again while the previous channel is leaving.
      if (cancelled) return
      const joined = supabase.channel(room, {
        config: { presence: { key: selfId } },
      })
      ch = joined

      joined.on('presence', { event: 'sync' }, () => {
        const state = joined.presenceState() as Record<
          string,
          Array<{ user_id?: string; game_id?: string | null }>
        >
        const entries: ClubPresenceEntry[] = []
        for (const list of Object.values(state)) {
          for (const e of list) {
            if (e.user_id) {
              entries.push({ userId: e.user_id, gameId: e.game_id ?? null })
            }
          }
        }
        setRoster(entries)
      })

      joined.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void joined.track({ user_id: selfId, game_id: viewingGameId })
        }
      })
    }

    // A stable ROOM name, so a remount inside the previous mount's leave
    // round-trip would otherwise get the dying channel back (and could be
    // rejected server-side as a duplicate join). Wait it out — see
    // lib/supabase/channelTeardown.ts. Nothing pending is the fast path:
    // a first mount joins synchronously.
    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()

    return () => {
      cancelled = true
      if (!ch) return // torn down before our turn to join came round
      try {
        void ch.untrack()
      } catch {
        // channel may already be closed
      }
      void releaseChannel(ch)
    }
  }, [clubHandle, selfId, viewingGameId])

  // Derived, not setState'd in the effect: with no club we simply
  // report an empty roster (the effect never subscribes).
  return clubHandle ? roster : []
}
