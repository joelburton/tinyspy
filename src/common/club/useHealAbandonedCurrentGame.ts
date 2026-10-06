// cs-unmet

import { useEffect, useRef } from 'react'
import { db as commonDb } from '../supabase/db'
import { runRpc } from '../supabase/dbResult'
import { reportUnhandled } from '../supabase/dbEnvelope'
import type { MemberGameOrClub } from '../realtime/useClubPresence'

/** What `common.unset_current_view` puts in `data` when it cleared the pointer.
 *  Nullable because its other `ok` — PA001, the game is gone — comes through a
 *  raise, and `common._raised_envelope` always builds `data: null`. */
type UnsetAnswer = { result: 'cleared' } | null

/** How long a current game may sit with nobody present before its flag is
 *  cleared, so an arriving viewer's presence has time to sync. */
const GRACE_MS = 2500

/**
 * Clears the club's current-game flag when nobody present is viewing that game
 * — a pointer that stuck (club/doc.md → the current-game pointer). Presence is
 * the evidence: a game page announces its game on the club's presence channel.
 *
 * It waits `GRACE_MS` first. If a viewer shows up inside the window, presence
 * changes, the effect re-runs and finds them, and the cleanup cancels the
 * timer. It fires once per game id, so a clear still on its way back through
 * the games list's re-read is not sent twice.
 *
 * Nothing is refetched here: the flag's UPDATE nudges `useClubGames`' room,
 * which re-reads and drops the current game.
 *
 * **A failure is logged, not shown.** Nobody asked for the heal, so there is
 * nobody to tell, and the only not-ok the RPC gives is a fault (PN011 / PN012,
 * from `_require_club_member`), whose modal `runRpc` has already raised. The
 * severity is checked rather than assumed: any other not-ok would need a
 * surface this page doesn't have, so it goes to `reportUnhandled`.
 */
export function useHealAbandonedCurrentGame(
  currentGameId: string | null,
  presence: MemberGameOrClub[],
): void {
  // The game a clear was last sent for.
  const healedRef = useRef<string | null>(null)

  useEffect(function healAbandonedCurrentGame() {
    if (!currentGameId || presence.some((e) => e.gameId === currentGameId)) {
      healedRef.current = null
      return
    }
    if (healedRef.current === currentGameId) return

    const timer = setTimeout(() => {
      healedRef.current = currentGameId
      void runRpc<UnsetAnswer>(
        commonDb.rpc('unset_current_view', { target_game: currentGameId }),
      ).then((res) => {
        if (res.type === 'not-ok' && res.severity === 'fault') {
          console.error('heal unset_current_view failed', res.message)
        } else if (res.type === 'ok' && res.dbcode === 'PA001') {
          // Deleted inside the grace window: no pointer left to clear.
        } else if (res.type === 'ok' && res.data?.result === 'cleared') {
          // Cleared, or already clear — the RPC's own guard makes a lost race
          // a no-op.
        } else {
          reportUnhandled('unset_current_view', res)
        }
      })
    }, GRACE_MS)
    return () => clearTimeout(timer)
  }, [currentGameId, presence])
}
