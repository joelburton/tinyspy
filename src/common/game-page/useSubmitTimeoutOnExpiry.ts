// cs-unmet

import { useEffect, useRef } from 'react'
import type { Manifest } from '../manifest/manifest'
import { reportUnhandled } from '../supabase/dbEnvelope'

type SubmitTimeoutOnExpiryOptions = {
  gameId: string
  manifest: Manifest
  // A countdown reached zero.
  expired: boolean
  paused: boolean
  isGameEnded: boolean
}

/**
 * Ends the game, or whatever the game's countdown bounds, when its countdown
 * runs out, by calling the manifest's `submitTimeout` — on the moment
 * `expired` turns true, not while it stays true.
 *
 * **An edge, not a level.** Replaying the board un-ends a timed-out game while
 * `expired` is still true for a beat, so firing on the level would end the
 * fresh game again, and a one-shot latch would block its own real timeout.
 *
 * **Not while paused.** It returns before recording the edge, so a timeout that
 * comes due as a pause starts fires on resume.
 *
 * **Every client fires it.** The RPC is idempotent, so all but the first arrive
 * to find the game ended: a race, logged at info and shown to nobody.
 */
export function useSubmitTimeoutOnExpiry({
  gameId,
  manifest,
  expired,
  paused,
  isGameEnded,
}: SubmitTimeoutOnExpiryOptions): void {
  const prevExpiredRef = useRef(false)
  useEffect(function fireTimeoutOnExpiry() {
    if (paused) return
    const wasExpired = prevExpiredRef.current
    prevExpiredRef.current = expired
    if (!expired || wasExpired) return
    if (isGameEnded) return // a peer already ended it
    void manifest.submitTimeout(gameId).then(function logHowTheTimeoutLanded(res) {
      if (res.type === 'not-ok' && res.severity === 'race') {
        console.log(`[db] submitTimeout: ${res.message} (${res.dbcode})`)
      } else if (res.type === 'not-ok') {
        // It reaches no player, so it must be findable in the log.
        console.error(`[db] submitTimeout failed: ${res.message} (${res.dbcode})`)
      } else if (res.type === 'ok' && res.data?.result === 'ended') {
        // The end arrives by subscription, here as everywhere.
      } else {
        reportUnhandled('submit_timeout', res)
      }
    })
  }, [expired, paused, isGameEnded, gameId, manifest])
}
