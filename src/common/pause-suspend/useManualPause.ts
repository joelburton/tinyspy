// cs-unmet

import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * The manual-pause broadcast. The pauser's id rides along so peers can say
 * "Bea paused the game", looking the member up by id. Anyone connected may
 * resume: there is no privileged "original pauser".
 */
export type ManualPauseEvent =
  | { type: 'manualPause'; userId: string }
  | { type: 'manualUnpause' }

type ManualPauseOptions = {
  // The game room's channel; null until it has joined.
  channel: RealtimeChannel | null
  myId: string
  // Who is connected; a change rebroadcasts a standing pause.
  presentUserIds: Set<string>
}

/**
 * The manual half of a game's pause: who clicked Pause, and the two senders,
 * over the game room's channel.
 *
 * A send applies locally and broadcasts; a broadcast does not echo to its
 * sender, so a peer's arrives through `applyManualPause`, which the room calls
 * from its `manualPause` handler (handlers must be attached before the room
 * subscribes, so the room attaches it, not this hook). Applying is idempotent:
 * a repeat lands on the same value and React drops it.
 *
 * While a manual pause stands, it is rebroadcast whenever the set of connected
 * peers changes, so a peer who joins mid-pause, or reconnects after the pauser
 * closed their tab, lands paused rather than on a board that looks resumed.
 */
export function useManualPause({
  channel,
  myId,
  presentUserIds,
}: ManualPauseOptions): {
  // Whoever clicked the standing manual pause; null when there is none.
  manuallyPausedById: string | null
  applyManualPause: (event: ManualPauseEvent) => void
  sendManualPause: () => void
  sendManualUnpause: () => void
} {
  const [manuallyPausedById, setManuallyPausedById] = useState<string | null>(null)

  const applyManualPause = useCallback((event: ManualPauseEvent) => {
    setManuallyPausedById(event.type === 'manualPause' ? event.userId : null)
  }, [])

  useEffect(function rebroadcastManualPause() {
    if (!channel || manuallyPausedById === null) return
    channel.send({
      type: 'broadcast',
      event: 'manualPause',
      payload: { type: 'manualPause', userId: manuallyPausedById },
    })
  }, [channel, manuallyPausedById, presentUserIds])

  const sendManualPause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = { type: 'manualPause', userId: myId }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel, myId])

  const sendManualUnpause = useCallback(() => {
    if (!channel) return
    const event: ManualPauseEvent = { type: 'manualUnpause' }
    applyManualPause(event)
    channel.send({ type: 'broadcast', event: 'manualPause', payload: event })
  }, [applyManualPause, channel])

  return { manuallyPausedById, applyManualPause, sendManualPause, sendManualUnpause }
}
