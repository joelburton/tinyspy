// cs-unmet

import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '@/common/supabase/supabase'
import { channelLeaving, releaseChannel } from '@/common/realtime/channelTeardown'
import type { GSharedMovePayload } from '../types'

/**
 * scrabble's coop "show a move" transport — a **stable-name** Broadcast channel
 * (`scrabble:${gameId}`) so every teammate merges into one room, following the
 * connections peer-selection pattern (src/common/realtime/doc.md). It's
 * separate from `useGame`'s postgres-changes channel (which is per-tab
 * UUID-suffixed and carries no Broadcast) because this state is ephemeral
 * — a not-yet-committed move that's never stored, and that a teammate who misses
 * it simply doesn't see. **Coop only**: in compete the channel is never opened
 * (private racks, no shared board), so `shareMove` is a no-op and nothing is
 * received.
 *
 * `onReceive` fires for every incoming broadcast; it's held in a ref so a new
 * callback identity each render doesn't tear down and rebuild the channel. The
 * default supabase Broadcast does NOT echo to the sender, which is what we want —
 * the sharer keeps editing their own board, only teammates get the preview.
 */
export function useSharedMove({
  gameId,
  mode,
  onReceive,
}: {
  gameId: string
  /** The channel opens in coop alone. */
  mode: 'coop' | 'compete'
  onReceive: (payload: GSharedMovePayload) => void
}): { shareMove: (payload: GSharedMovePayload) => void } {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const onReceiveRef = useRef(onReceive)
  useEffect(() => {
    onReceiveRef.current = onReceive
  })

  useEffect(() => {
    if (mode !== 'coop') return // compete / still-loading: no room, no sends
    const room = `scrabble:${gameId}`
    let canceled = false

    function join() {
      // Guards the deferred path only — the effect can tear down again
      // while the previous channel is still leaving.
      if (canceled) return
      const ch = supabase.channel(room)
      ch.on('broadcast', { event: 'show-move' }, ({ payload }) =>
        onReceiveRef.current(payload as GSharedMovePayload),
      )
      ch.subscribe()
      channelRef.current = ch
    }

    // Stable ROOM name (peers must share the topic), so a remount inside the
    // previous mount's leave round-trip would otherwise be handed the dying
    // channel. See common/realtime/channelTeardown.ts.
    const pending = channelLeaving(room)
    if (pending) void pending.then(join)
    else join()
    return () => {
      canceled = true
      const ch = channelRef.current
      channelRef.current = null
      if (ch) void releaseChannel(ch) // null if we tore down before joining
    }
  }, [gameId, mode])

  const shareMove = useCallback((payload: GSharedMovePayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'show-move', payload })
  }, [])

  return { shareMove }
}
