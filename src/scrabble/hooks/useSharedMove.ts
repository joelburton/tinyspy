import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../common/lib/supabase/supabase'
import type { Placement } from '../lib/play'

/**
 * The payload of a coop "show a move" broadcast — a snapshot of the sharer's
 * in-progress (staged) tiles, so a teammate can preview it read-only. The
 * committed board is already shared across the team, so we send only the
 * tentative placements; the receiver overlays them on its own live board.
 */
export type SharedMovePayload = {
  /** The sharer's staged tiles (not yet committed). */
  placements: Placement[]
  /** Who is showing the move — the receiver resolves the name + identity disc. */
  sharerId: string
  /** The sharer's board `version` when they shared. The receiver drops the
   *  broadcast if its own board has since moved on (a real move landed in
   *  between), so a stale move never renders over a changed board. */
  baseVersion: number
  /** The play's words + score, for the banner ("moth showing: +18 BERRY") — sent
   *  so the receiver needn't recompute (empty/0 for a not-yet-legal arrangement). */
  words: string[]
  score: number
}

/**
 * scrabble's coop "show a move" transport — a **stable-name** Broadcast channel
 * (`scrabble:${gameId}`) so every teammate merges into one room, following the
 * connections peer-selection pattern (docs/code-conventions.md → "Realtime data
 * hooks"). It's separate from `useGame`'s postgres-changes channel (which is
 * per-tab UUID-suffixed and carries no Broadcast) because this state is ephemeral
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
  /** undefined while the game loads; the channel opens once it resolves to coop. */
  mode: 'coop' | 'compete' | undefined
  onReceive: (payload: SharedMovePayload) => void
}): { shareMove: (payload: SharedMovePayload) => void } {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const onReceiveRef = useRef(onReceive)
  useEffect(() => {
    onReceiveRef.current = onReceive
  })

  useEffect(() => {
    if (mode !== 'coop') return // compete / still-loading: no room, no sends
    const ch = supabase.channel(`scrabble:${gameId}`)
    ch.on('broadcast', { event: 'show-move' }, ({ payload }) =>
      onReceiveRef.current(payload as SharedMovePayload),
    )
    ch.subscribe()
    channelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      channelRef.current = null
    }
  }, [gameId, mode])

  const shareMove = useCallback((payload: SharedMovePayload) => {
    channelRef.current?.send({ type: 'broadcast', event: 'show-move', payload })
  }, [])

  return { shareMove }
}
